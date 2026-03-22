export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Simple Moving Average */
export function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

/** Exponential Moving Average */
export function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (i === period - 1) {
      // Seed with SMA
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      result.push(sum / period);
      continue;
    }
    const prev = result[i - 1]!;
    result.push(values[i] * k + prev * (1 - k));
  }
  return result;
}

/** Relative Strength Index (Wilder's smoothing) */
export function rsi(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];

  if (closes.length < period + 1) {
    return closes.map(() => null);
  }

  // Calculate initial gains/losses
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  // First value: null for indices 0..period
  for (let i = 0; i <= period; i++) result.push(null);

  // Seed average gain/loss with SMA of first `period` values
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  // First RSI value
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0);

  // Wilder's smoothing for subsequent values
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  }

  return result;
}

/** Bollinger Bands */
export function bollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += (closes[j] - middle[i]!) ** 2;
    }
    const stdDev = Math.sqrt(sumSq / period);
    upper.push(middle[i]! + stdDevMultiplier * stdDev);
    lower.push(middle[i]! - stdDevMultiplier * stdDev);
  }

  return { upper, middle, lower };
}

/** Average True Range */
export function atr(candles: OHLCV[], period: number = 14): (number | null)[] {
  if (candles.length < 2) return candles.map(() => null);

  const trueRanges: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  const result: (number | null)[] = [];
  for (let i = 0; i < period - 1; i++) result.push(null);

  // Seed with SMA
  let atrVal = 0;
  for (let i = 0; i < period; i++) atrVal += trueRanges[i];
  atrVal /= period;
  result.push(atrVal);

  // Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
    result.push(atrVal);
  }

  return result;
}

/** MACD (Moving Average Convergence Divergence) */
export function macd(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const fastEma = ema(closes, fastPeriod);
  const slowEma = ema(closes, slowPeriod);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEma[i] === null || slowEma[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(fastEma[i]! - slowEma[i]!);
    }
  }

  // Signal line: EMA of non-null MACD values
  const macdValues: number[] = [];
  const macdIndices: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      macdValues.push(macdLine[i]!);
      macdIndices.push(i);
    }
  }

  const signalEma = ema(macdValues, signalPeriod);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  const histogram: (number | null)[] = new Array(closes.length).fill(null);

  for (let j = 0; j < macdValues.length; j++) {
    const idx = macdIndices[j];
    if (signalEma[j] !== null) {
      signalLine[idx] = signalEma[j];
      histogram[idx] = macdLine[idx]! - signalEma[j]!;
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

/** Percent drop from recent high over a lookback window */
export function percentFromHigh(candles: OHLCV[], lookback: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < lookback - 1) {
      result.push(null);
      continue;
    }
    let maxHigh = -Infinity;
    for (let j = i - lookback + 1; j <= i; j++) {
      if (candles[j].high > maxHigh) maxHigh = candles[j].high;
    }
    result.push(((candles[i].close - maxHigh) / maxHigh) * 100);
  }
  return result;
}

/** Stochastic RSI — faster oscillator within oversold/overbought zones */
export function stochasticRsi(
  closes: number[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14,
  kSmoothing: number = 3,
  dSmoothing: number = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const rsiValues = rsi(closes, rsiPeriod);

  // Stochastic of RSI: (RSI - lowest RSI) / (highest RSI - lowest RSI)
  const stochRaw: (number | null)[] = [];
  for (let i = 0; i < rsiValues.length; i++) {
    if (rsiValues[i] === null || i < rsiPeriod + stochPeriod - 1) {
      stochRaw.push(null);
      continue;
    }
    let minRsi = Infinity;
    let maxRsi = -Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsiValues[j] !== null) {
        if (rsiValues[j]! < minRsi) minRsi = rsiValues[j]!;
        if (rsiValues[j]! > maxRsi) maxRsi = rsiValues[j]!;
      }
    }
    const range = maxRsi - minRsi;
    stochRaw.push(range > 0 ? ((rsiValues[i]! - minRsi) / range) * 100 : 50);
  }

  // %K = SMA of stochRaw
  const nonNullValues: number[] = [];
  const nonNullIndices: number[] = [];
  for (let i = 0; i < stochRaw.length; i++) {
    if (stochRaw[i] !== null) {
      nonNullValues.push(stochRaw[i]!);
      nonNullIndices.push(i);
    }
  }

  const kSma = sma(nonNullValues, kSmoothing);
  const k: (number | null)[] = new Array(closes.length).fill(null);
  for (let j = 0; j < nonNullValues.length; j++) {
    if (kSma[j] !== null) k[nonNullIndices[j]] = kSma[j];
  }

  // %D = SMA of %K
  const kValues: number[] = [];
  const kIndices: number[] = [];
  for (let i = 0; i < k.length; i++) {
    if (k[i] !== null) {
      kValues.push(k[i]!);
      kIndices.push(i);
    }
  }

  const dSma = sma(kValues, dSmoothing);
  const d: (number | null)[] = new Array(closes.length).fill(null);
  for (let j = 0; j < kValues.length; j++) {
    if (dSma[j] !== null) d[kIndices[j]] = dSma[j];
  }

  return { k, d };
}

/** Percent rise from recent low over a lookback window */
export function percentFromLow(candles: OHLCV[], lookback: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < lookback - 1) {
      result.push(null);
      continue;
    }
    let minLow = Infinity;
    for (let j = i - lookback + 1; j <= i; j++) {
      if (candles[j].low < minLow) minLow = candles[j].low;
    }
    result.push(minLow === 0 ? null : ((candles[i].close - minLow) / minLow) * 100);
  }
  return result;
}
