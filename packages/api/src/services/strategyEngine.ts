import type { OHLCV } from "../strategies/indicators";
import type { MarketState, PortfolioState } from "../strategies/index";
import {
  sma,
  ema,
  rsi,
  bollingerBands,
  atr,
  macd,
  percentFromHigh,
  percentFromLow,
  stochasticRsi,
} from "../strategies/indicators";
import { timeframeDefaults } from "../strategies/regimeDetector";

export interface IndicatorConfig {
  rsiPeriod?: number;
  fastMaPeriod?: number;
  slowMaPeriod?: number;
  bbPeriod?: number;
  bbStdDev?: number;
  atrPeriod?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  percentHighLookback?: number;
  percentLowLookback?: number;
  maPeriod?: number;
  stochRsiPeriod?: number;
  stochRsiKSmoothing?: number;
  stochRsiDSmoothing?: number;
}

export interface PrecomputedIndicators {
  smaFast: (number | null)[];
  smaSlow: (number | null)[];
  emaFast: (number | null)[];
  emaSlow: (number | null)[];
  rsi: (number | null)[];
  bbUpper: (number | null)[];
  bbMiddle: (number | null)[];
  bbLower: (number | null)[];
  atr: (number | null)[];
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHistogram: (number | null)[];
  percentFromHigh: (number | null)[];
  percentFromLow: (number | null)[];
  stochRsiK: (number | null)[];
  stochRsiD: (number | null)[];
}

export function getDefaultConfig(timeframe?: string): Required<IndicatorConfig> {
  const tfDefaults = timeframe ? timeframeDefaults(timeframe) : timeframeDefaults("1h");
  return {
    rsiPeriod: 14,
    fastMaPeriod: tfDefaults.fastMaPeriod,
    slowMaPeriod: tfDefaults.slowMaPeriod,
    bbPeriod: 20,
    bbStdDev: 2,
    atrPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    percentHighLookback: tfDefaults.percentHighLookback,
    percentLowLookback: tfDefaults.percentLowLookback,
    maPeriod: tfDefaults.maPeriod,
    stochRsiPeriod: 14,
    stochRsiKSmoothing: 3,
    stochRsiDSmoothing: 3,
  };
}

export function computeAllIndicators(
  candles: OHLCV[],
  config: IndicatorConfig = {},
  timeframe?: string
): PrecomputedIndicators {
  const cfg = { ...getDefaultConfig(timeframe), ...config };
  const closes = candles.map((c) => c.close);

  const smaFast = sma(closes, cfg.fastMaPeriod);
  const smaSlow = sma(closes, cfg.slowMaPeriod);
  const emaFast = ema(closes, cfg.fastMaPeriod);
  const emaSlow = ema(closes, cfg.slowMaPeriod);
  const rsiValues = rsi(closes, cfg.rsiPeriod);
  const bb = bollingerBands(closes, cfg.bbPeriod, cfg.bbStdDev);
  const atrValues = atr(candles, cfg.atrPeriod);
  const macdValues = macd(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
  const pctHigh = percentFromHigh(candles, cfg.percentHighLookback);
  const pctLow = percentFromLow(candles, cfg.percentLowLookback);
  const stochRsi = stochasticRsi(
    closes,
    cfg.rsiPeriod,
    cfg.stochRsiPeriod,
    cfg.stochRsiKSmoothing,
    cfg.stochRsiDSmoothing
  );

  return {
    smaFast,
    smaSlow,
    emaFast,
    emaSlow,
    rsi: rsiValues,
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
    atr: atrValues,
    macdLine: macdValues.macd,
    macdSignal: macdValues.signal,
    macdHistogram: macdValues.histogram,
    percentFromHigh: pctHigh,
    percentFromLow: pctLow,
    stochRsiK: stochRsi.k,
    stochRsiD: stochRsi.d,
  };
}

export function buildMarketState(
  symbol: string,
  candleIndex: number,
  candles: OHLCV[],
  indicators: PrecomputedIndicators
): MarketState {
  const candle = candles[candleIndex];
  const i = candleIndex;

  // Build indicator map for current candle
  const indicatorMap: Record<string, number | null> = {
    smaFast: indicators.smaFast[i],
    smaSlow: indicators.smaSlow[i],
    emaFast: indicators.emaFast[i],
    emaSlow: indicators.emaSlow[i],
    rsi: indicators.rsi[i],
    bbUpper: indicators.bbUpper[i],
    bbMiddle: indicators.bbMiddle[i],
    bbLower: indicators.bbLower[i],
    atr: indicators.atr[i],
    macdLine: indicators.macdLine[i],
    macdSignal: indicators.macdSignal[i],
    macdHistogram: indicators.macdHistogram[i],
    percentFromHigh: indicators.percentFromHigh[i],
    percentFromLow: indicators.percentFromLow[i],
    stochRsiK: indicators.stochRsiK[i],
    stochRsiD: indicators.stochRsiD[i],
    maDeviation:
      indicators.smaSlow[i] !== null && indicators.smaSlow[i]! > 0
        ? ((candle.close - indicators.smaSlow[i]!) / indicators.smaSlow[i]!) * 100
        : null,
  };

  return {
    symbol,
    price: candle.close,
    timestamp: candle.timestamp,
    candles: candles.slice(Math.max(0, i - 100), i + 1),
    indicators: indicatorMap,
  };
}

export function buildPortfolioState(
  cash: number,
  cryptoAmount: number,
  avgEntryPrice: number,
  currentPrice: number,
  lastBuyTimestamp: number | null,
  profitTiersTriggered: boolean[] = []
): PortfolioState {
  const cryptoValue = cryptoAmount * currentPrice;
  const totalValue = cash + cryptoValue;
  const unrealizedPnlPercent =
    avgEntryPrice > 0
      ? ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100
      : 0;

  return {
    cash,
    cryptoAmount,
    avgEntryPrice,
    unrealizedPnlPercent,
    totalValue,
    lastBuyTimestamp,
    profitTiersTriggered,
  };
}
