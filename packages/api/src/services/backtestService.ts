import { db } from "../db";
import {
  backtestRuns,
  backtestTrades,
  backtestSnapshots,
  historicalOhlcv,
} from "../db/schema";
import { eq, and, gte, lte, asc, desc } from "drizzle-orm";
import { strategies } from "../strategies/index";
import type { OHLCV } from "../strategies/indicators";
import type { TradingStrategy } from "../strategies/index";
import {
  computeAllIndicators,
  buildMarketState,
  buildPortfolioState,
} from "./strategyEngine";

const TAKER_FEE = 0.0026; // Kraken taker fee 0.26%
const SNAPSHOT_INTERVAL = 10; // Save equity snapshot every N candles

export interface BacktestRequest {
  strategySlug: string;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  paramOverrides?: Record<string, any>;
}

export const backtestService = {
  async startBacktest(req: BacktestRequest): Promise<string> {
    const strategy = strategies[req.strategySlug];
    if (!strategy) throw new Error(`Unknown strategy: ${req.strategySlug}`);

    const params = { ...strategy.defaultParams, ...(req.paramOverrides || {}) };

    // Create run record
    const [run] = await db
      .insert(backtestRuns)
      .values({
        strategySlug: req.strategySlug,
        strategyParams: JSON.stringify(params),
        symbol: req.symbol,
        timeframe: req.timeframe,
        startDate: new Date(req.startDate),
        endDate: new Date(req.endDate),
        initialCapital: req.initialCapital,
        status: "running",
      })
      .returning();

    // Run async
    setTimeout(() => this.executeBacktest(run.id, strategy, params, req), 0);

    return run.id;
  },

  async executeBacktest(
    runId: string,
    strategy: TradingStrategy,
    params: Record<string, any>,
    req: BacktestRequest
  ): Promise<void> {
    try {
      // Load candles
      const candles = await db
        .select({
          timestamp: historicalOhlcv.timestamp,
          open: historicalOhlcv.open,
          high: historicalOhlcv.high,
          low: historicalOhlcv.low,
          close: historicalOhlcv.close,
          volume: historicalOhlcv.volume,
        })
        .from(historicalOhlcv)
        .where(
          and(
            eq(historicalOhlcv.symbol, req.symbol),
            eq(historicalOhlcv.timeframe, req.timeframe),
            gte(historicalOhlcv.timestamp, new Date(req.startDate)),
            lte(historicalOhlcv.timestamp, new Date(req.endDate))
          )
        )
        .orderBy(asc(historicalOhlcv.timestamp));

      if (candles.length < strategy.minCandles) {
        await db
          .update(backtestRuns)
          .set({
            status: "failed",
            error: `Not enough data: ${candles.length} candles (need ${strategy.minCandles})`,
          })
          .where(eq(backtestRuns.id, runId));
        return;
      }

      // Convert to OHLCV format
      const ohlcv: OHLCV[] = candles.map((c) => ({
        timestamp: c.timestamp.getTime(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      // Pre-compute indicators with timeframe-aware defaults
      const indicatorConfig = {
        rsiPeriod: params.rsiPeriod ?? 14,
        bbPeriod: params.bbPeriod ?? 20,
        bbStdDev: params.bbStdDev ?? 2,
      };
      const indicators = computeAllIndicators(ohlcv, indicatorConfig, req.timeframe);

      // Simulation state
      let cash = req.initialCapital;
      let cryptoAmount = 0;
      let avgEntryPrice = 0;
      let lastBuyTimestamp: number | null = null;
      let peakValue = req.initialCapital;
      let maxDrawdown = 0;
      let profitTiersTriggered: boolean[] = [];
      let timeLocked = 0; // candles where position is underwater

      const trades: Array<{
        timestamp: Date;
        side: string;
        price: number;
        amount: number;
        cost: number;
        fee: number;
        reason: string;
        portfolioValueAfter: number;
        avgEntryAfter: number;
        avgEntryBefore: number;
      }> = [];

      const snapshots: Array<{
        timestamp: Date;
        portfolioValue: number;
        cashBalance: number;
        cryptoValue: number;
        cryptoAmount: number;
        drawdownPercent: number;
      }> = [];

      // Returns tracking for Sharpe
      const periodReturns: number[] = [];
      let prevValue = req.initialCapital;

      const buyHoldStart = ohlcv[0].close;

      // Iterate candles
      for (let i = 0; i < ohlcv.length; i++) {
        const market = buildMarketState(req.symbol, i, ohlcv, indicators);
        const portfolio = buildPortfolioState(
          cash,
          cryptoAmount,
          avgEntryPrice,
          ohlcv[i].close,
          lastBuyTimestamp,
          profitTiersTriggered
        );

        const signal = strategy.evaluate(market, portfolio, params);

        if (signal.action === "buy" && signal.amount && signal.amount > 0) {
          const buyUsd = Math.min(signal.amount, cash);
          if (buyUsd >= 1) {
            const fee = buyUsd * TAKER_FEE;
            const netUsd = buyUsd - fee;
            const cryptoBought = netUsd / ohlcv[i].close;

            // BUG FIX: Track all-in cost including fees for avg entry
            const avgEntryBefore = avgEntryPrice;
            const totalCost =
              avgEntryPrice * cryptoAmount + buyUsd;
            cryptoAmount += cryptoBought;
            avgEntryPrice = cryptoAmount > 0 ? totalCost / cryptoAmount : 0;
            cash -= buyUsd;
            lastBuyTimestamp = ohlcv[i].timestamp;

            const portfolioValue = cash + cryptoAmount * ohlcv[i].close;
            trades.push({
              timestamp: new Date(ohlcv[i].timestamp),
              side: "buy",
              price: ohlcv[i].close,
              amount: cryptoBought,
              cost: buyUsd,
              fee,
              reason: signal.reason,
              portfolioValueAfter: portfolioValue,
              avgEntryAfter: avgEntryPrice,
              avgEntryBefore,
            });
          }
        } else if (
          signal.action === "sell" &&
          signal.amount &&
          signal.amount > 0 &&
          cryptoAmount > 0
        ) {
          const avgEntryBefore = avgEntryPrice;
          const sellCrypto = cryptoAmount * Math.min(signal.amount, 1);
          const grossUsd = sellCrypto * ohlcv[i].close;
          const fee = grossUsd * TAKER_FEE;
          const netUsd = grossUsd - fee;

          cryptoAmount -= sellCrypto;
          cash += netUsd;

          // Track which tier was triggered from the signal reason
          for (let t = 0; t < profitTiersTriggered.length; t++) {
            if (!profitTiersTriggered[t]) {
              profitTiersTriggered[t] = true;
              break;
            }
          }

          if (cryptoAmount < 1e-12) {
            cryptoAmount = 0;
            avgEntryPrice = 0;
            // Reset tiers when position fully closed
            profitTiersTriggered = [];
          }

          const portfolioValue = cash + cryptoAmount * ohlcv[i].close;
          trades.push({
            timestamp: new Date(ohlcv[i].timestamp),
            side: "sell",
            price: ohlcv[i].close,
            amount: sellCrypto,
            cost: grossUsd,
            fee,
            reason: signal.reason,
            portfolioValueAfter: portfolioValue,
            avgEntryAfter: avgEntryPrice,
            avgEntryBefore,
          });
        }

        // Initialize profit tiers array based on strategy
        if (profitTiersTriggered.length === 0 && cryptoAmount > 0) {
          const tierCount = strategy.id === "smart-dca" ? 4 : 3;
          profitTiersTriggered = new Array(tierCount).fill(false);
        }

        // Track time locked (underwater)
        if (
          cryptoAmount > 0 &&
          avgEntryPrice > 0 &&
          ohlcv[i].close < avgEntryPrice
        ) {
          timeLocked++;
        }

        // Track drawdown + returns
        const currentValue = cash + cryptoAmount * ohlcv[i].close;
        if (currentValue > peakValue) peakValue = currentValue;
        const drawdown =
          peakValue > 0 ? ((peakValue - currentValue) / peakValue) * 100 : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        // Period return for Sharpe
        if (prevValue > 0) {
          periodReturns.push((currentValue - prevValue) / prevValue);
        }
        prevValue = currentValue;

        // Snapshot
        if (i % SNAPSHOT_INTERVAL === 0 || i === ohlcv.length - 1) {
          snapshots.push({
            timestamp: new Date(ohlcv[i].timestamp),
            portfolioValue: currentValue,
            cashBalance: cash,
            cryptoValue: cryptoAmount * ohlcv[i].close,
            cryptoAmount,
            drawdownPercent: drawdown,
          });
        }
      }

      // Final metrics
      const finalValue = cash + cryptoAmount * ohlcv[ohlcv.length - 1].close;
      const totalReturn =
        ((finalValue - req.initialCapital) / req.initialCapital) * 100;
      const buyHoldEnd = ohlcv[ohlcv.length - 1].close;
      const buyHoldReturn =
        ((buyHoldEnd - buyHoldStart) / buyHoldStart) * 100;

      // Sharpe ratio (annualized)
      let sharpeRatio = 0;
      if (periodReturns.length > 1) {
        const avgReturn =
          periodReturns.reduce((a, b) => a + b, 0) / periodReturns.length;
        const variance =
          periodReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) /
          (periodReturns.length - 1);
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0) {
          const periodsPerYear = estimatePeriodsPerYear(req.timeframe);
          sharpeRatio =
            (avgReturn / stdDev) * Math.sqrt(periodsPerYear);
        }
      }

      // BUG FIX: Win rate — compare sell price to avgEntryBefore (entry at time of sell)
      const sellTrades = trades.filter((t) => t.side === "sell");
      const wins = sellTrades.filter(
        (t) => t.price > t.avgEntryBefore
      ).length;
      const winRate = sellTrades.length > 0 ? (wins / sellTrades.length) * 100 : 0;

      // Save results
      await db
        .update(backtestRuns)
        .set({
          status: "completed",
          finalValue,
          totalReturn,
          maxDrawdown,
          sharpeRatio,
          winRate,
          totalTrades: trades.length,
          buyHoldReturn,
          timeLocked,
        })
        .where(eq(backtestRuns.id, runId));

      // Batch insert trades
      if (trades.length > 0) {
        await db.insert(backtestTrades).values(
          trades.map((t) => ({
            backtestId: runId,
            ...t,
          }))
        );
      }

      // Batch insert snapshots
      if (snapshots.length > 0) {
        await db.insert(backtestSnapshots).values(
          snapshots.map((s) => ({
            backtestId: runId,
            ...s,
          }))
        );
      }

      console.log(
        `Backtest ${runId} completed: ${trades.length} trades, ${totalReturn.toFixed(1)}% return`
      );
    } catch (error: any) {
      console.error(`Backtest ${runId} failed:`, error);
      await db
        .update(backtestRuns)
        .set({
          status: "failed",
          error: error.message || "Unknown error",
        })
        .where(eq(backtestRuns.id, runId));
    }
  },

  async getBacktestRuns() {
    return db
      .select()
      .from(backtestRuns)
      .orderBy(desc(backtestRuns.createdAt));
  },

  async getBacktestRun(id: string) {
    const [run] = await db
      .select()
      .from(backtestRuns)
      .where(eq(backtestRuns.id, id));
    return run || null;
  },

  async getBacktestTrades(id: string) {
    return db
      .select()
      .from(backtestTrades)
      .where(eq(backtestTrades.backtestId, id))
      .orderBy(asc(backtestTrades.timestamp));
  },

  async getBacktestSnapshots(id: string) {
    return db
      .select()
      .from(backtestSnapshots)
      .where(eq(backtestSnapshots.backtestId, id))
      .orderBy(asc(backtestSnapshots.timestamp));
  },

  async deleteBacktest(id: string) {
    await db.delete(backtestRuns).where(eq(backtestRuns.id, id));
  },
};

function estimatePeriodsPerYear(timeframe: string): number {
  switch (timeframe) {
    case "5m":
      return 365 * 24 * 12;
    case "15m":
      return 365 * 24 * 4;
    case "1h":
      return 365 * 24;
    case "4h":
      return 365 * 6;
    case "1d":
      return 365;
    default:
      return 365 * 24; // default to hourly
  }
}
