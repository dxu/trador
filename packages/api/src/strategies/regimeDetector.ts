export type Regime = "strong_bear" | "bear" | "neutral" | "bull" | "strong_bull";

export interface RegimeState {
  regime: Regime;
  score: number;
  volatilityNorm: number;
  isTrendingUp: boolean;
}

export function detectRegime(
  indicators: Record<string, number | null>
): RegimeState {
  const components: number[] = [];

  // 1. RSI component (25%) — maps directly to 0-100
  const rsi = indicators["rsi"];
  if (rsi !== null) {
    components.push(Math.max(0, Math.min(100, rsi)));
  }

  // 2. Trend component (25%) — price vs slow SMA
  //    +20% above = 100, -20% below = 0
  const maDeviation = indicators["maDeviation"];
  if (maDeviation !== null) {
    components.push(Math.max(0, Math.min(100, 50 + maDeviation * 2.5)));
  }

  // 3. Momentum component (25%) — MACD histogram normalized by ATR
  //    +1 ATR = 100, -1 ATR = 0
  const macdHist = indicators["macdHistogram"];
  const atr = indicators["atr"];
  if (macdHist !== null && atr !== null && atr > 0) {
    const normalized = macdHist / atr;
    components.push(Math.max(0, Math.min(100, 50 + normalized * 50)));
  }

  // 4. Distance from high component (25%)
  //    0% from high = 100, -50% = 0
  const pctFromHigh = indicators["percentFromHigh"];
  if (pctFromHigh !== null) {
    components.push(Math.max(0, Math.min(100, 100 + pctFromHigh * 2)));
  }

  const score =
    components.length > 0
      ? components.reduce((a, b) => a + b, 0) / components.length
      : 50;

  const regime: Regime =
    score < 20
      ? "strong_bear"
      : score < 35
        ? "bear"
        : score < 65
          ? "neutral"
          : score < 80
            ? "bull"
            : "strong_bull";

  const price = indicators["price"] ?? 0;
  const volatilityNorm =
    atr !== null && price > 0 ? (atr / price) * 100 : 2;

  const emaFast = indicators["emaFast"];
  const emaSlow = indicators["emaSlow"];
  const isTrendingUp =
    emaFast !== null && emaSlow !== null ? emaFast > emaSlow : false;

  return { regime, score, volatilityNorm, isTrendingUp };
}

/** Regime-based buy multiplier — buy more in fear, less in greed */
export function regimeBuyMultiplier(regime: Regime): number {
  switch (regime) {
    case "strong_bear":
      return 1.75;
    case "bear":
      return 1.25;
    case "neutral":
      return 1.0;
    case "bull":
      return 0.75;
    case "strong_bull":
      return 0.5;
  }
}

/** Timeframe-aware indicator config defaults */
export function timeframeDefaults(timeframe: string): {
  percentHighLookback: number;
  percentLowLookback: number;
  maPeriod: number;
  fastMaPeriod: number;
  slowMaPeriod: number;
} {
  switch (timeframe) {
    case "5m":
      return {
        percentHighLookback: 2016,
        percentLowLookback: 2016,
        maPeriod: 288,
        fastMaPeriod: 36,
        slowMaPeriod: 108,
      };
    case "1h":
      return {
        percentHighLookback: 720,
        percentLowLookback: 720,
        maPeriod: 200,
        fastMaPeriod: 12,
        slowMaPeriod: 48,
      };
    case "1d":
    default:
      return {
        percentHighLookback: 90,
        percentLowLookback: 90,
        maPeriod: 50,
        fastMaPeriod: 9,
        slowMaPeriod: 21,
      };
  }
}
