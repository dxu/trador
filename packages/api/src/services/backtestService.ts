import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import ccxt from "ccxt";
import {
  db,
  historicalOhlcv,
  backtests,
  backtestTrades,
  backtestSnapshots,
  type Backtest,
  type BacktestTrade,
  type BacktestSnapshot,
  type HistoricalOhlcv,
  type MarketRegime,
} from "../db";
import {
  type TradingStrategy,
  type MarketConditions,
  type PortfolioState,
  getStrategy,
  listStrategies,
  STRATEGY_REGISTRY,
} from "../strategies";

// ============================================================================
// TYPES
// ============================================================================

export interface BacktestConfig {
  name: string;
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  strategyId: string;
}

export interface BacktestResult {
  backtest: Backtest;
  trades: BacktestTrade[];
  snapshots: BacktestSnapshot[];
  equityCurve: { timestamp: Date; value: number }[];
}

interface SimulatedPosition {
  amount: number;
  costBasis: number;
  avgEntryPrice: number;
}

interface DailyData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma200: number | null;
  ma50: number | null;
  rsi: number;
  percentFromAth: number;
  regime: MarketRegime;
  regimeScore: number;
}

// ============================================================================
// BACKTEST SERVICE
// ============================================================================

export class BacktestService {
  private readonly FEE_RATE = 0.001; // 0.1% trading fee
  private exchange: ccxt.Exchange | null = null;

  /**
   * Get a public (unauthenticated) exchange instance for fetching historical data
   */
  private async getPublicExchange(): Promise<ccxt.Exchange> {
    if (this.exchange) return this.exchange;

    this.exchange = new ccxt.kraken({
      enableRateLimit: true,
    });

    await this.exchange.loadMarkets();
    console.log("📊 Connected to kraken for historical data (public API)");

    return this.exchange;
  }

  // ============================================================================
  // HISTORICAL DATA MANAGEMENT
  // ============================================================================

  private normalizeSymbolForKraken(symbol: string): string {
    return symbol.replace("/USDT", "/USD");
  }

  /**
   * Fetch and store historical OHLCV data from exchange
   */
  async fetchHistoricalData(
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe: string = "1d"
  ): Promise<number> {
    console.log(
      `📊 Fetching historical data for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    // Check what we already have
    const existing = await db
      .select()
      .from(historicalOhlcv)
      .where(
        and(
          eq(historicalOhlcv.symbol, symbol),
          eq(historicalOhlcv.timeframe, timeframe),
          gte(historicalOhlcv.timestamp, startDate),
          lte(historicalOhlcv.timestamp, endDate)
        )
      )
      .orderBy(asc(historicalOhlcv.timestamp));

    const existingDates = new Set(
      existing.map((e) => e.timestamp.toISOString().split("T")[0])
    );

    const dayMs = 24 * 60 * 60 * 1000;
    const totalDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / dayMs
    );

    if (existingDates.size >= totalDays * 0.9) {
      console.log(
        `✅ Already have ${existingDates.size}/${totalDays} days of data`
      );
      return existingDates.size;
    }

    const exchange = await this.getPublicExchange();
    const fetchSymbol = this.normalizeSymbolForKraken(symbol);
    console.log(`📊 Using symbol ${fetchSymbol} on Kraken`);

    let fetchedCount = 0;
    let currentEnd = endDate.getTime();
    const chunkSize = 200;

    while (currentEnd > startDate.getTime()) {
      try {
        const chunkStart = Math.max(
          startDate.getTime(),
          currentEnd - chunkSize * dayMs
        );

        const ohlcv = await exchange.fetchOHLCV(
          fetchSymbol,
          timeframe,
          chunkStart,
          chunkSize
        );

        if (!ohlcv || ohlcv.length === 0) {
          console.log(
            `📊 No more data available before ${new Date(currentEnd).toISOString().split("T")[0]}`
          );
          break;
        }

        const toInsert = ohlcv
          .filter((candle) => {
            const candleDate = new Date(candle[0] as number);
            const dateStr = candleDate.toISOString().split("T")[0];
            return (
              candleDate >= startDate &&
              candleDate <= endDate &&
              !existingDates.has(dateStr)
            );
          })
          .map((candle) => ({
            symbol,
            timeframe,
            timestamp: new Date(candle[0] as number),
            open: candle[1] as number,
            high: candle[2] as number,
            low: candle[3] as number,
            close: candle[4] as number,
            volume: candle[5] as number,
          }));

        if (toInsert.length > 0) {
          await db.insert(historicalOhlcv).values(toInsert).onConflictDoNothing();
          fetchedCount += toInsert.length;
          toInsert.forEach((d) =>
            existingDates.add(d.timestamp.toISOString().split("T")[0])
          );
          console.log(
            `📊 Fetched ${toInsert.length} candles (total: ${existingDates.size}/${totalDays})`
          );
        }

        const earliestCandle = ohlcv[0];
        currentEnd = (earliestCandle[0] as number) - dayMs;

        // Respect Kraken rate limits
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error("Error fetching OHLCV chunk:", error?.message || error);

        if (
          error?.message?.includes("Too many requests") ||
          error?.message?.includes("DDoS")
        ) {
          console.log("⏳ Rate limited - waiting 10 seconds before retry...");
          await new Promise((resolve) => setTimeout(resolve, 10000));
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          currentEnd -= chunkSize * dayMs;
        }
      }
    }

    console.log(
      `📊 Fetched ${fetchedCount} new candles, total: ${existingDates.size}`
    );
    return existingDates.size;
  }

  /**
   * Get stored historical data
   */
  async getHistoricalData(
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe: string = "1d"
  ): Promise<HistoricalOhlcv[]> {
    return db
      .select()
      .from(historicalOhlcv)
      .where(
        and(
          eq(historicalOhlcv.symbol, symbol),
          eq(historicalOhlcv.timeframe, timeframe),
          gte(historicalOhlcv.timestamp, startDate),
          lte(historicalOhlcv.timestamp, endDate)
        )
      )
      .orderBy(asc(historicalOhlcv.timestamp));
  }

  /**
   * Get available date range for a symbol
   */
  async getAvailableDataRange(
    symbol: string
  ): Promise<{ earliest: Date | null; latest: Date | null; count: number }> {
    const data = await db
      .select()
      .from(historicalOhlcv)
      .where(eq(historicalOhlcv.symbol, symbol))
      .orderBy(asc(historicalOhlcv.timestamp));

    if (data.length === 0) {
      return { earliest: null, latest: null, count: 0 };
    }

    return {
      earliest: data[0].timestamp,
      latest: data[data.length - 1].timestamp,
      count: data.length,
    };
  }

  // ============================================================================
  // BACKTEST EXECUTION
  // ============================================================================

  /**
   * Run a backtest with given configuration
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    const strategy = getStrategy(config.strategyId);
    if (!strategy) {
      throw new Error(`Unknown strategy: ${config.strategyId}`);
    }

    console.log(`\n🔬 Starting backtest: ${config.name}`);
    console.log(`   Strategy: ${strategy.config.name}`);
    console.log(`   Symbol: ${config.symbol}`);
    console.log(
      `   Period: ${config.startDate.toISOString().split("T")[0]} to ${config.endDate.toISOString().split("T")[0]}`
    );
    console.log(`   Capital: $${config.initialCapital}`);

    // Create backtest record
    const [backtest] = await db
      .insert(backtests)
      .values({
        name: config.name,
        symbol: config.symbol,
        startDate: config.startDate,
        endDate: config.endDate,
        initialCapital: config.initialCapital,
        strategyParams: strategy.config.params,
        riskProfile: strategy.config.category,
        status: "running",
        progress: 0,
      })
      .returning();

    try {
      // Ensure we have historical data
      await this.fetchHistoricalData(
        config.symbol,
        config.startDate,
        config.endDate
      );

      // Get the data
      const rawData = await this.getHistoricalData(
        config.symbol,
        config.startDate,
        config.endDate
      );

      if (rawData.length < 201) {
        throw new Error(
          `Insufficient data: need at least 201 days for 200-day MA, have ${rawData.length}`
        );
      }

      // Process data with technical indicators
      const processedData = this.processDataWithIndicators(rawData);

      // Run simulation with the selected strategy
      const result = await this.simulateStrategy(
        backtest.id,
        processedData,
        config.initialCapital,
        strategy
      );

      // Calculate final metrics
      const metrics = this.calculateMetrics(
        result,
        config.initialCapital,
        processedData
      );

      // Update backtest with results
      const [updatedBacktest] = await db
        .update(backtests)
        .set({
          status: "completed",
          progress: 100,
          ...metrics,
          completedAt: new Date(),
        })
        .where(eq(backtests.id, backtest.id))
        .returning();

      console.log(`\n✅ Backtest completed: ${config.name}`);
      console.log(`   Strategy: ${strategy.config.name}`);
      console.log(`   Total Return: ${metrics.totalReturn?.toFixed(2)}%`);
      console.log(`   Win Rate: ${metrics.winRate?.toFixed(1)}%`);
      console.log(`   Max Drawdown: ${metrics.maxDrawdown?.toFixed(2)}%`);
      console.log(`   vs HODL: ${metrics.outperformance?.toFixed(2)}%`);

      return {
        backtest: updatedBacktest,
        trades: result.trades,
        snapshots: result.snapshots,
        equityCurve: result.equityCurve,
      };
    } catch (error) {
      await db
        .update(backtests)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(backtests.id, backtest.id));

      throw error;
    }
  }

  /**
   * Process raw OHLCV data and add technical indicators
   */
  private processDataWithIndicators(rawData: HistoricalOhlcv[]): DailyData[] {
    const processed: DailyData[] = [];
    const closes = rawData.map((d) => d.close);

    for (let i = 0; i < rawData.length; i++) {
      const candle = rawData[i];

      const ma200 =
        i >= 199 ? this.calculateSMA(closes.slice(i - 199, i + 1), 200) : null;
      const ma50 =
        i >= 49 ? this.calculateSMA(closes.slice(i - 49, i + 1), 50) : null;
      const rsi = i >= 14 ? this.calculateRSI(closes.slice(0, i + 1), 14) : 50;

      const currentATH = Math.max(
        ...rawData.slice(0, i + 1).map((d) => d.high)
      );
      const percentFromAth =
        ((candle.close - currentATH) / currentATH) * 100;

      const { regime, regimeScore } = this.calculateRegime(
        candle.close,
        ma200,
        ma50,
        rsi,
        percentFromAth
      );

      processed.push({
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        ma200,
        ma50,
        rsi,
        percentFromAth,
        regime,
        regimeScore,
      });
    }

    return processed;
  }

  /**
   * Run the strategy simulation using the strategy interface
   */
  private async simulateStrategy(
    backtestId: string,
    data: DailyData[],
    initialCapital: number,
    strategy: TradingStrategy
  ): Promise<{
    trades: BacktestTrade[];
    snapshots: BacktestSnapshot[];
    equityCurve: { timestamp: Date; value: number }[];
  }> {
    const trades: BacktestTrade[] = [];
    const snapshots: BacktestSnapshot[] = [];
    const equityCurve: { timestamp: Date; value: number }[] = [];

    let cash = initialCapital;
    let position: SimulatedPosition = {
      amount: 0,
      costBasis: 0,
      avgEntryPrice: 0,
    };
    let lastBuyTime = 0;

    const startIndex = 200;
    const totalDays = data.length - startIndex;
    let progressUpdate = 0;

    for (let i = startIndex; i < data.length; i++) {
      const day = data[i];
      const price = day.close;

      // Build market conditions
      const market: MarketConditions = {
        price,
        rsi: day.rsi,
        ma50: day.ma50,
        ma200: day.ma200,
        percentFromAth: day.percentFromAth,
        regime: day.regime,
        regimeScore: day.regimeScore,
      };

      // Build portfolio state
      const cryptoValue = position.amount * price;
      const totalValue = cash + cryptoValue;
      const unrealizedPnl = cryptoValue - position.costBasis;
      const unrealizedPnlPercent =
        position.costBasis > 0 ? (unrealizedPnl / position.costBasis) * 100 : 0;

      const portfolio: PortfolioState = {
        cash,
        cryptoAmount: position.amount,
        cryptoValue,
        totalValue,
        costBasis: position.costBasis,
        avgEntryPrice: position.avgEntryPrice,
        unrealizedPnlPercent,
        lastBuyTime,
      };

      // Ask strategy what to do
      const decision = strategy.decide(market, portfolio);
      const strategyRegime = strategy.interpretRegime(market);

      // Execute decision
      if (decision.action === "buy" && decision.amount && decision.amount > 0) {
        const buyAmountUsd = Math.min(decision.amount, cash * 0.99);
        if (buyAmountUsd >= 10) {
          // Minimum $10 trade
          const buyAmountCrypto = buyAmountUsd / price;
          const fee = buyAmountUsd * this.FEE_RATE;

          position.amount += buyAmountCrypto;
          position.costBasis += buyAmountUsd;
          position.avgEntryPrice = position.costBasis / position.amount;
          cash -= buyAmountUsd + fee;
          lastBuyTime = day.timestamp.getTime();

          const [trade] = await db
            .insert(backtestTrades)
            .values({
              backtestId,
              action: "buy",
              timestamp: day.timestamp,
              price,
              amount: buyAmountCrypto,
              valueUsdt: buyAmountUsd,
              fee,
              regime: strategyRegime,
              regimeScore: day.regimeScore,
              rsi: day.rsi,
              percentFromAth: day.percentFromAth,
              reason: decision.reason,
              portfolioValue: cash + position.amount * price,
              cashBalance: cash,
              cryptoBalance: position.amount,
            })
            .returning();

          trades.push(trade);
        }
      } else if (
        decision.action === "sell" &&
        decision.amount &&
        decision.amount > 0
      ) {
        const sellAmountCrypto = Math.min(decision.amount, position.amount);
        if (sellAmountCrypto > 0) {
          const sellValue = sellAmountCrypto * price;
          const fee = sellValue * this.FEE_RATE;

          const costBasisPortion = position.avgEntryPrice * sellAmountCrypto;
          const profitUsdt = sellValue - costBasisPortion - fee;
          const profitPercent =
            costBasisPortion > 0 ? (profitUsdt / costBasisPortion) * 100 : 0;

          position.amount -= sellAmountCrypto;
          position.costBasis -= costBasisPortion;
          cash += sellValue - fee;

          const [trade] = await db
            .insert(backtestTrades)
            .values({
              backtestId,
              action: "sell",
              timestamp: day.timestamp,
              price,
              amount: sellAmountCrypto,
              valueUsdt: sellValue,
              fee,
              regime: strategyRegime,
              regimeScore: day.regimeScore,
              rsi: day.rsi,
              percentFromAth: day.percentFromAth,
              reason: decision.reason,
              costBasis: costBasisPortion,
              profitUsdt,
              profitPercent,
              portfolioValue: cash + position.amount * price,
              cashBalance: cash,
              cryptoBalance: position.amount,
            })
            .returning();

          trades.push(trade);
        }
      }

      // Record snapshot every 7 days
      if (i % 7 === 0 || i === data.length - 1) {
        const newValue = cash + position.amount * price;

        const [snapshot] = await db
          .insert(backtestSnapshots)
          .values({
            backtestId,
            timestamp: day.timestamp,
            price,
            portfolioValue: newValue,
            cashBalance: cash,
            cryptoBalance: position.amount,
            cryptoValue: position.amount * price,
            regime: day.regime,
            regimeScore: day.regimeScore,
            rsi: day.rsi,
          })
          .returning();

        snapshots.push(snapshot);
      }

      equityCurve.push({
        timestamp: day.timestamp,
        value: cash + position.amount * price,
      });

      // Update progress
      const newProgress = Math.floor(((i - startIndex) / totalDays) * 100);
      if (newProgress > progressUpdate) {
        progressUpdate = newProgress;
        await db
          .update(backtests)
          .set({ progress: progressUpdate })
          .where(eq(backtests.id, backtestId));
      }
    }

    return { trades, snapshots, equityCurve };
  }

  /**
   * Calculate final metrics for the backtest
   */
  private calculateMetrics(
    result: {
      trades: BacktestTrade[];
      equityCurve: { timestamp: Date; value: number }[];
    },
    initialCapital: number,
    data: DailyData[]
  ): Partial<Backtest> {
    const { trades, equityCurve } = result;

    const finalValue =
      equityCurve[equityCurve.length - 1]?.value || initialCapital;
    const totalReturn =
      ((finalValue - initialCapital) / initialCapital) * 100;
    const totalReturnUsdt = finalValue - initialCapital;

    // Max drawdown
    let maxDrawdown = 0;
    let peak = initialCapital;
    for (const point of equityCurve) {
      if (point.value > peak) peak = point.value;
      const drawdown = ((peak - point.value) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Trade statistics
    const sells = trades.filter((t) => t.action === "sell");
    const profitableTrades = sells.filter((t) => (t.profitUsdt || 0) > 0);
    const winRate =
      sells.length > 0 ? (profitableTrades.length / sells.length) * 100 : 0;

    const avgTradeReturn =
      sells.length > 0
        ? sells.reduce((sum, t) => sum + (t.profitPercent || 0), 0) /
          sells.length
        : 0;

    const wins = sells.filter((t) => (t.profitUsdt || 0) > 0);
    const losses = sells.filter((t) => (t.profitUsdt || 0) < 0);
    const avgWinSize =
      wins.length > 0
        ? wins.reduce((sum, t) => sum + (t.profitUsdt || 0), 0) / wins.length
        : 0;
    const avgLossSize =
      losses.length > 0
        ? Math.abs(
            losses.reduce((sum, t) => sum + (t.profitUsdt || 0), 0) /
              losses.length
          )
        : 0;

    // Sharpe ratio
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const dailyReturn =
        (equityCurve[i].value - equityCurve[i - 1].value) /
        equityCurve[i - 1].value;
      returns.push(dailyReturn);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
        returns.length
    );
    const sharpeRatio =
      stdDev > 0 ? (avgReturn * 365) / (stdDev * Math.sqrt(365)) : 0;

    // Buy and hold comparison
    const startPrice = data[200].close;
    const endPrice = data[data.length - 1].close;
    const buyAndHoldReturn =
      ((endPrice - startPrice) / startPrice) * 100;
    const outperformance = totalReturn - buyAndHoldReturn;

    return {
      finalCapital: finalValue,
      totalReturn,
      totalReturnUsdt,
      maxDrawdown,
      sharpeRatio,
      winRate,
      totalTrades: trades.length,
      profitableTrades: profitableTrades.length,
      avgTradeReturn,
      avgWinSize,
      avgLossSize,
      buyAndHoldReturn,
      outperformance,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private calculateSMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1];
    const slice = values.slice(-period);
    return slice.reduce((sum, v) => sum + v, 0) / period;
  }

  private calculateRSI(closes: number[], period: number = 14): number {
    if (closes.length < period + 1) return 50;

    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    const recentChanges = changes.slice(-period);
    let gains = 0;
    let losses = 0;

    for (const change of recentChanges) {
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateRegime(
    price: number,
    ma200: number | null,
    ma50: number | null,
    rsi: number,
    percentFromAth: number
  ): { regime: MarketRegime; regimeScore: number } {
    let score = 0;

    if (percentFromAth <= -50) score -= 40;
    else if (percentFromAth <= -30) score -= 25;
    else if (percentFromAth >= -10) score += 20;

    if (rsi >= 85) score += 30;
    else if (rsi >= 70) score += 20;
    else if (rsi <= 30) score -= 30;
    else if (rsi <= 40) score -= 15;

    if (ma200) {
      const maDeviation = ((price - ma200) / ma200) * 100;
      if (maDeviation < -20) score -= 20;
      else if (maDeviation < 0) score -= 10;
      else if (maDeviation > 50) score += 20;
      else if (maDeviation > 20) score += 10;
    }

    if (ma50 && ma200) {
      if (ma50 > ma200 * 1.05) score += 10;
      else if (ma50 < ma200 * 0.95) score -= 10;
    }

    let regime: MarketRegime;
    if (score <= -50) regime = "extreme_fear";
    else if (score <= -20) regime = "fear";
    else if (score >= 50) regime = "extreme_greed";
    else if (score >= 20) regime = "greed";
    else regime = "neutral";

    return { regime, regimeScore: score };
  }

  // ============================================================================
  // BACKTEST MANAGEMENT
  // ============================================================================

  async listBacktests(limit: number = 20): Promise<Backtest[]> {
    return db
      .select()
      .from(backtests)
      .orderBy(desc(backtests.createdAt))
      .limit(limit);
  }

  async getBacktest(id: string): Promise<BacktestResult | null> {
    const [backtest] = await db
      .select()
      .from(backtests)
      .where(eq(backtests.id, id))
      .limit(1);

    if (!backtest) return null;

    const trades = await db
      .select()
      .from(backtestTrades)
      .where(eq(backtestTrades.backtestId, id))
      .orderBy(asc(backtestTrades.timestamp));

    const snapshots = await db
      .select()
      .from(backtestSnapshots)
      .where(eq(backtestSnapshots.backtestId, id))
      .orderBy(asc(backtestSnapshots.timestamp));

    const equityCurve = snapshots.map((s) => ({
      timestamp: s.timestamp,
      value: s.portfolioValue,
    }));

    return { backtest, trades, snapshots, equityCurve };
  }

  async deleteBacktest(id: string): Promise<void> {
    await db.delete(backtestTrades).where(eq(backtestTrades.backtestId, id));
    await db.delete(backtestSnapshots).where(eq(backtestSnapshots.backtestId, id));
    await db.delete(backtests).where(eq(backtests.id, id));
  }

  /**
   * Get all available strategies
   */
  getStrategies() {
    return listStrategies();
  }

  /**
   * Get a specific strategy config
   */
  getStrategyConfig(id: string) {
    const strategy = getStrategy(id);
    return strategy?.config || null;
  }
}

export const backtestService = new BacktestService();
