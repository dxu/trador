import type { TradingStrategy, MarketState, PortfolioState, StrategySignal } from "./index";
import { detectRegime, regimeBuyMultiplier } from "./regimeDetector";
import { evaluateProfitGate } from "./profitGate";
import { calculateBuyAmount } from "./positionSizer";

export const smartDcaStrategy: TradingStrategy = {
  id: "smart-dca",
  name: "Smart DCA",
  description:
    "Regime-aware dollar cost averaging. Always accumulating, but buys more in fear regimes and less in greed. Takes partial profits at configurable tiers. Never sells at a loss.",
  category: "conservative",
  minCandles: 50,

  defaultParams: {
    baseBuyUsd: 100,
    buyIntervalCandles: 24,
    dipThreshold: -5,
    dipMultiplier: 2.0,
    maxPositionPercent: 85,
    profitTier1: 5,
    profitTier2: 10,
    profitTier3: 20,
    profitTier4: 35,
    sellPerTier: 0.25,
    regimeBuyScaling: true,
    percentHighLookback: 24,
  },

  paramLabels: {
    baseBuyUsd: "Base Buy Amount ($)",
    buyIntervalCandles: "Buy Interval (candles)",
    dipThreshold: "Dip Bonus Threshold (%)",
    dipMultiplier: "Dip Buy Multiplier",
    maxPositionPercent: "Max Position (%)",
    profitTier1: "Profit Tier 1 (%)",
    profitTier2: "Profit Tier 2 (%)",
    profitTier3: "Profit Tier 3 (%)",
    profitTier4: "Profit Tier 4 (%)",
    sellPerTier: "Sell Fraction Per Tier",
    regimeBuyScaling: "Regime-Adjusted Buying",
    percentHighLookback: "Lookback for High (candles)",
  },

  paramDescriptions: {
    baseBuyUsd: "Fixed USD to buy per scheduled interval before multipliers",
    buyIntervalCandles: "Candles between scheduled DCA buys",
    dipThreshold: "% drop from recent high to trigger bonus buy (bypasses schedule)",
    dipMultiplier: "Multiply buy amount by this during dips",
    maxPositionPercent: "Max % of portfolio in crypto",
    profitTier1: "First profit-taking level (sell portion when unrealized PnL hits this %)",
    profitTier2: "Second profit-taking level",
    profitTier3: "Third profit-taking level",
    profitTier4: "Fourth profit-taking level",
    sellPerTier: "Fraction of position to sell at each tier (e.g. 0.25 = 25%)",
    regimeBuyScaling: "Scale buy amounts based on market regime (more in fear, less in greed)",
    percentHighLookback: "Candles to look back for recent high (dip detection)",
  },

  evaluate(
    market: MarketState,
    portfolio: PortfolioState,
    params: Record<string, any>
  ): StrategySignal {
    const {
      baseBuyUsd = 100,
      buyIntervalCandles = 24,
      dipThreshold = -5,
      dipMultiplier = 2.0,
      maxPositionPercent = 85,
      profitTier1 = 5,
      profitTier2 = 10,
      profitTier3 = 20,
      profitTier4 = 35,
      sellPerTier = 0.25,
      regimeBuyScaling = true,
    } = params;

    // Detect regime
    const regime = detectRegime({ ...market.indicators, price: market.price });

    // Check profit-taking tiers
    const tiers = [
      { profitPercent: profitTier1, sellFraction: sellPerTier },
      { profitPercent: profitTier2, sellFraction: sellPerTier },
      { profitPercent: profitTier3, sellFraction: sellPerTier },
      { profitPercent: profitTier4, sellFraction: sellPerTier },
    ];

    const tiersTriggered = portfolio.profitTiersTriggered || [false, false, false, false];
    const profitSignal = evaluateProfitGate(portfolio, tiers, tiersTriggered);

    if (profitSignal) {
      return {
        action: "sell",
        amount: profitSignal.sellFraction,
        confidence: 0.8,
        reason: `[${regime.regime}] ${profitSignal.reason}`,
      };
    }

    // Check for dip bonus (bypasses schedule)
    const pctFromHigh = market.indicators["percentFromHigh"] ?? null;
    const isDip = pctFromHigh !== null && pctFromHigh <= dipThreshold;

    // Check if scheduled buy is due
    const isScheduledBuyDue = (() => {
      if (portfolio.lastBuyTimestamp === null) return true;
      if (market.candles.length < 2) return true;
      const candleInterval =
        market.candles[market.candles.length - 1].timestamp -
        market.candles[market.candles.length - 2].timestamp;
      if (candleInterval <= 0) return true;

      // Halve cooldown in strong_bear (accumulate faster)
      const effectiveInterval =
        regime.regime === "strong_bear"
          ? buyIntervalCandles * 0.5
          : buyIntervalCandles;

      const elapsed = market.timestamp - portfolio.lastBuyTimestamp;
      return elapsed >= effectiveInterval * candleInterval;
    })();

    if (!isDip && !isScheduledBuyDue) {
      return {
        action: "hold",
        confidence: 0.5,
        reason: `[${regime.regime}] Waiting for next buy interval`,
      };
    }

    // Calculate buy amount
    let buyBase = baseBuyUsd;
    if (isDip) buyBase *= dipMultiplier;

    const buyAmount = calculateBuyAmount(
      portfolio,
      regime,
      buyBase,
      maxPositionPercent,
      !!regimeBuyScaling
    );

    if (buyAmount < 10) {
      return {
        action: "hold",
        confidence: 0.4,
        reason: `[${regime.regime}] ${buyAmount === 0 ? "Max position or no cash" : "Below minimum trade"}`,
      };
    }

    const dipInfo = isDip ? ` | Dip: ${pctFromHigh!.toFixed(1)}%` : "";
    const regimeMulti = regimeBuyScaling ? ` × ${regimeBuyMultiplier(regime.regime).toFixed(2)}` : "";

    return {
      action: "buy",
      amount: buyAmount,
      confidence: isDip ? 0.8 : 0.6,
      reason: `[${regime.regime}] DCA buy $${buyAmount.toFixed(0)}${regimeMulti}${dipInfo}`,
    };
  },
};
