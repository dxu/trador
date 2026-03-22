import type { TradingStrategy, MarketState, PortfolioState, StrategySignal } from "./index";
import { detectRegime, regimeBuyMultiplier } from "./regimeDetector";
import { evaluateProfitGate } from "./profitGate";
import { calculateBuyAmount } from "./positionSizer";

export const volatilityHarvesterStrategy: TradingStrategy = {
  id: "volatility-harvester",
  name: "Volatility Harvester",
  description:
    "Captures crypto's ±5-10% swings using Bollinger Bands and RSI. Buys at the lower band (oversold), sells at the upper band (overbought) — but only at a profit. Regime-aware with a DCA floor for constant accumulation.",
  category: "moderate",
  minCandles: 50,

  defaultParams: {
    bbPeriod: 20,
    bbStdDev: 2.0,
    rsiOversold: 35,
    rsiOverbought: 65,
    bbLowerBuyZone: 0.2,
    bbUpperSellZone: 0.8,
    dcaFloorUsd: 50,
    dcaFloorIntervalCandles: 48,
    maxPositionPercent: 80,
    profitTier1: 5,
    profitTier2: 10,
    profitTier3: 20,
    sellPerTier: 0.33,
    cooldownCandles: 4,
    percentHighLookback: 48,
  },

  paramLabels: {
    bbPeriod: "Bollinger Band Period",
    bbStdDev: "BB Std Dev",
    rsiOversold: "RSI Oversold",
    rsiOverbought: "RSI Overbought",
    bbLowerBuyZone: "BB Buy Zone (0-1)",
    bbUpperSellZone: "BB Sell Zone (0-1)",
    dcaFloorUsd: "DCA Floor Amount ($)",
    dcaFloorIntervalCandles: "DCA Floor Interval",
    maxPositionPercent: "Max Position (%)",
    profitTier1: "Profit Tier 1 (%)",
    profitTier2: "Profit Tier 2 (%)",
    profitTier3: "Profit Tier 3 (%)",
    sellPerTier: "Sell Fraction Per Tier",
    cooldownCandles: "Cooldown (candles)",
    percentHighLookback: "Lookback for High",
  },

  paramDescriptions: {
    bbPeriod: "Period for Bollinger Band calculation",
    bbStdDev: "Standard deviation multiplier for BB width",
    rsiOversold: "RSI level below which confirms oversold (buy signal)",
    rsiOverbought: "RSI level above which confirms overbought (sell signal)",
    bbLowerBuyZone: "Buy when price is in bottom X of BB range (0.2 = bottom 20%)",
    bbUpperSellZone: "Sell when price is in top X of BB range (0.8 = top 20%)",
    dcaFloorUsd: "Minimum USD to buy per DCA floor interval even without signals",
    dcaFloorIntervalCandles: "Candles between DCA floor buys",
    maxPositionPercent: "Max % of portfolio in crypto",
    profitTier1: "First profit-taking level (%)",
    profitTier2: "Second profit-taking level (%)",
    profitTier3: "Third profit-taking level (%)",
    sellPerTier: "Fraction of position to sell per tier",
    cooldownCandles: "Minimum candles between signal buys",
    percentHighLookback: "Candles to look back for recent high",
  },

  evaluate(
    market: MarketState,
    portfolio: PortfolioState,
    params: Record<string, any>
  ): StrategySignal {
    const {
      rsiOversold = 35,
      rsiOverbought = 65,
      bbLowerBuyZone = 0.2,
      bbUpperSellZone = 0.8,
      dcaFloorUsd = 50,
      dcaFloorIntervalCandles = 48,
      maxPositionPercent = 80,
      profitTier1 = 5,
      profitTier2 = 10,
      profitTier3 = 20,
      sellPerTier = 0.33,
      cooldownCandles = 4,
    } = params;

    const regime = detectRegime({ ...market.indicators, price: market.price });

    // Calculate BB position (0 = lower band, 1 = upper band)
    const bbUpper = market.indicators["bbUpper"];
    const bbLower = market.indicators["bbLower"];
    const currentRsi = market.indicators["rsi"];
    const stochRsiK = market.indicators["stochRsiK"];

    let bbPosition: number | null = null;
    if (bbUpper !== null && bbLower !== null && bbUpper !== bbLower) {
      bbPosition = (market.price - bbLower) / (bbUpper - bbLower);
    }

    // === SELL LOGIC (must be profitable) ===
    const tiers = [
      { profitPercent: profitTier1, sellFraction: sellPerTier },
      { profitPercent: profitTier2, sellFraction: sellPerTier },
      { profitPercent: profitTier3, sellFraction: sellPerTier },
    ];
    const tiersTriggered = portfolio.profitTiersTriggered || [false, false, false];

    // Regime-adjusted profit threshold shift
    let thresholdShift = 0;
    if (regime.regime === "strong_bull") thresholdShift = -2;

    // In bear regimes, suppress sells (hold for recovery) unless high profit
    const suppressSells =
      (regime.regime === "strong_bear" || regime.regime === "bear") &&
      portfolio.unrealizedPnlPercent < profitTier3;

    if (!suppressSells) {
      // Check profit gate tiers
      const profitSignal = evaluateProfitGate(
        portfolio,
        tiers,
        tiersTriggered,
        thresholdShift
      );
      if (profitSignal) {
        // Additional confirmation: BB position should be in upper zone
        const bbConfirm = bbPosition === null || bbPosition >= 0.5;
        if (bbConfirm) {
          return {
            action: "sell",
            amount: profitSignal.sellFraction,
            confidence: 0.8,
            reason: `[${regime.regime}] ${profitSignal.reason}`,
          };
        }
      }

      // BB-triggered sell (not tier-based, for general profit-taking)
      if (
        portfolio.cryptoAmount > 0 &&
        portfolio.unrealizedPnlPercent > 0 &&
        bbPosition !== null &&
        bbPosition >= bbUpperSellZone &&
        currentRsi !== null &&
        currentRsi >= rsiOverbought
      ) {
        const sellFraction = Math.min(0.3, portfolio.unrealizedPnlPercent / 100);
        return {
          action: "sell",
          amount: sellFraction,
          confidence: 0.7,
          reason: `[${regime.regime}] BB overbought sell: BB=${bbPosition.toFixed(2)}, RSI=${currentRsi.toFixed(0)}, PnL=+${portfolio.unrealizedPnlPercent.toFixed(1)}%`,
        };
      }
    }

    // === BUY LOGIC ===

    // Cooldown check (DCA floor bypasses this)
    const isInCooldown = (() => {
      if (portfolio.lastBuyTimestamp === null) return false;
      if (market.candles.length < 2) return false;
      const candleInterval =
        market.candles[market.candles.length - 1].timestamp -
        market.candles[market.candles.length - 2].timestamp;
      if (candleInterval <= 0) return false;
      const elapsed = market.timestamp - portfolio.lastBuyTimestamp;
      return elapsed < cooldownCandles * candleInterval;
    })();

    // Signal buy: BB lower zone + RSI oversold + StochRSI confirmation
    if (!isInCooldown && bbPosition !== null) {
      // Adjust thresholds in strong bear (more aggressive)
      const effectiveBBZone =
        regime.regime === "strong_bear" ? bbLowerBuyZone + 0.1 : bbLowerBuyZone;
      const effectiveRsiThreshold =
        regime.regime === "strong_bear" ? rsiOversold + 5 : rsiOversold;

      // Suppress signal buys in strong bull (only DCA floor)
      const suppressSignalBuys = regime.regime === "strong_bull";

      if (
        !suppressSignalBuys &&
        bbPosition <= effectiveBBZone &&
        currentRsi !== null &&
        currentRsi <= effectiveRsiThreshold
      ) {
        // StochRSI confirmation (optional — still buy without it, just lower confidence)
        const hasStochConfirm = stochRsiK !== null && stochRsiK < 20;
        const confidence = hasStochConfirm ? 0.85 : 0.7;

        const buyBase = dcaFloorUsd * 3; // Signal buys are 3x the DCA floor
        const buyAmount = calculateBuyAmount(
          portfolio,
          regime,
          buyBase,
          maxPositionPercent
        );

        if (buyAmount >= 10) {
          return {
            action: "buy",
            amount: buyAmount,
            confidence,
            reason: `[${regime.regime}] Signal buy: BB=${bbPosition.toFixed(2)}, RSI=${currentRsi.toFixed(0)}${hasStochConfirm ? ", StochRSI confirmed" : ""} × ${regimeBuyMultiplier(regime.regime).toFixed(2)}`,
          };
        }
      }
    }

    // DCA floor: guaranteed minimum buying
    const isDcaFloorDue = (() => {
      if (portfolio.lastBuyTimestamp === null) return true;
      if (market.candles.length < 2) return true;
      const candleInterval =
        market.candles[market.candles.length - 1].timestamp -
        market.candles[market.candles.length - 2].timestamp;
      if (candleInterval <= 0) return true;
      const elapsed = market.timestamp - portfolio.lastBuyTimestamp;
      return elapsed >= dcaFloorIntervalCandles * candleInterval;
    })();

    if (isDcaFloorDue) {
      const buyAmount = calculateBuyAmount(
        portfolio,
        regime,
        dcaFloorUsd,
        maxPositionPercent
      );

      if (buyAmount >= 10) {
        return {
          action: "buy",
          amount: buyAmount,
          confidence: 0.5,
          reason: `[${regime.regime}] DCA floor: $${buyAmount.toFixed(0)} × ${regimeBuyMultiplier(regime.regime).toFixed(2)}`,
        };
      }
    }

    return {
      action: "hold",
      confidence: 0.5,
      reason: `[${regime.regime}] No signal (BB=${bbPosition?.toFixed(2) ?? "?"}, RSI=${currentRsi?.toFixed(0) ?? "?"})`,
    };
  },
};
