import { desc, eq } from "drizzle-orm";
import {
  db,
  marketSnapshots,
  type MarketRegime,
  type MarketSnapshot,
} from "../db";
import { exchangeService } from "./exchange";

export interface MarketAnalysis {
  symbol: string;
  price: number;
  priceHigh24h: number;
  priceLow24h: number;
  volume24h: number;

  // Technical indicators
  ma200: number | null;
  ma50: number | null;
  rsi14: number;

  // ATH analysis
  allTimeHigh: number;
  percentFromAth: number;
  daysSinceAth: number;

  // Regime
  regime: MarketRegime;
  regimeScore: number; // -100 to +100
  regimeDescription: string;

  // Signals
  signals: string[];
  recommendation: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
}

interface RegimeThresholds {
  fearThreshold: number;
  extremeFearThreshold: number;
  greedRsiThreshold: number;
  extremeGreedRsiThreshold: number;
}

const DEFAULT_THRESHOLDS: RegimeThresholds = {
  fearThreshold: -30,
  extremeFearThreshold: -50,
  greedRsiThreshold: 70,
  extremeGreedRsiThreshold: 85,
};

// Known ATH values (updated periodically, used as fallback)
const KNOWN_ATH: Record<string, { price: number; date: string }> = {
  "BTC/USDT": { price: 73750, date: "2024-03-14" },
  "ETH/USDT": { price: 4878, date: "2021-11-10" },
  "SOL/USDT": { price: 260, date: "2021-11-06" },
};

export class MarketAnalysisService {
  /**
   * Perform comprehensive market analysis
   */
  async analyze(
    symbol: string,
    thresholds: RegimeThresholds = DEFAULT_THRESHOLDS
  ): Promise<MarketAnalysis> {
    // Exchange service handles symbol normalization internally
    const [ticker, ohlcv] = await Promise.all([
      exchangeService.getTicker(symbol),
      exchangeService.getOHLCV(symbol, "1d", 200), // 200 days for MA calculation
    ]);

    const price = ticker.last || 0;

    // Calculate technical indicators
    const ma200 = this.calculateMA(ohlcv, 200);
    const ma50 = this.calculateMA(ohlcv, 50);
    const rsi14 = this.calculateRSI(ohlcv, 14);

    // ATH analysis
    const athData = await this.getATHData(symbol, ohlcv);
    const percentFromAth =
      ((price - athData.allTimeHigh) / athData.allTimeHigh) * 100;

    // Calculate regime
    const { regime, regimeScore, signals } = this.calculateRegime(
      price,
      ma200,
      ma50,
      rsi14,
      percentFromAth,
      thresholds
    );

    const recommendation = this.getRecommendation(regime, regimeScore);
    const regimeDescription = this.getRegimeDescription(regime, regimeScore);

    return {
      symbol,
      price,
      priceHigh24h: ticker.high || price,
      priceLow24h: ticker.low || price,
      volume24h: ticker.quoteVolume || 0,
      ma200,
      ma50,
      rsi14,
      allTimeHigh: athData.allTimeHigh,
      percentFromAth,
      daysSinceAth: athData.daysSinceAth,
      regime,
      regimeScore,
      regimeDescription,
      signals,
      recommendation,
    };
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateMA(ohlcv: number[][], period: number): number | null {
    if (ohlcv.length < period) return null;

    const closes = ohlcv.slice(-period).map((c) => c[4] as number);
    return closes.reduce((sum, price) => sum + price, 0) / period;
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(ohlcv: number[][], period: number = 14): number {
    if (ohlcv.length < period + 1) return 50; // Default neutral

    const closes = ohlcv.map((c) => c[4] as number);
    const changes = [];

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

  /**
   * Get All-Time High data
   */
  private async getATHData(
    symbol: string,
    ohlcv: number[][]
  ): Promise<{ allTimeHigh: number; daysSinceAth: number }> {
    // Get max from OHLCV data
    const maxFromData = Math.max(...ohlcv.map((c) => c[2] as number)); // High prices

    // Check known ATH
    const knownAth = KNOWN_ATH[symbol];
    const allTimeHigh = knownAth
      ? Math.max(maxFromData, knownAth.price)
      : maxFromData;

    // Find days since ATH
    let daysSinceAth = 0;
    for (let i = ohlcv.length - 1; i >= 0; i--) {
      if ((ohlcv[i][2] as number) >= allTimeHigh * 0.99) {
        // Within 1% of ATH
        break;
      }
      daysSinceAth++;
    }

    // If ATH is from known data and older than our OHLCV range
    if (knownAth && knownAth.price > maxFromData) {
      const athDate = new Date(knownAth.date);
      const now = new Date();
      daysSinceAth = Math.floor(
        (now.getTime() - athDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return { allTimeHigh, daysSinceAth };
  }

  /**
   * Calculate market regime based on multiple factors
   */
  private calculateRegime(
    price: number,
    ma200: number | null,
    ma50: number | null,
    rsi: number,
    percentFromAth: number,
    thresholds: RegimeThresholds
  ): { regime: MarketRegime; regimeScore: number; signals: string[] } {
    const signals: string[] = [];
    let score = 0; // -100 (extreme fear) to +100 (extreme greed)

    // Factor 1: Distance from ATH (-40 to +20 points)
    if (percentFromAth <= thresholds.extremeFearThreshold) {
      score -= 40;
      signals.push(
        `🔴 ${Math.abs(percentFromAth).toFixed(0)}% below ATH (extreme fear)`
      );
    } else if (percentFromAth <= thresholds.fearThreshold) {
      score -= 25;
      signals.push(
        `🟠 ${Math.abs(percentFromAth).toFixed(0)}% below ATH (fear)`
      );
    } else if (percentFromAth >= -10) {
      score += 20;
      signals.push(`🟢 Near ATH (${percentFromAth.toFixed(0)}%)`);
    } else {
      signals.push(`⚪ ${percentFromAth.toFixed(0)}% from ATH`);
    }

    // Factor 2: RSI (-30 to +30 points)
    if (rsi >= thresholds.extremeGreedRsiThreshold) {
      score += 30;
      signals.push(`🔴 RSI ${rsi.toFixed(0)} (extremely overbought)`);
    } else if (rsi >= thresholds.greedRsiThreshold) {
      score += 20;
      signals.push(`🟠 RSI ${rsi.toFixed(0)} (overbought)`);
    } else if (rsi <= 30) {
      score -= 30;
      signals.push(`🟢 RSI ${rsi.toFixed(0)} (oversold - buy signal)`);
    } else if (rsi <= 40) {
      score -= 15;
      signals.push(`🟢 RSI ${rsi.toFixed(0)} (approaching oversold)`);
    } else {
      signals.push(`⚪ RSI ${rsi.toFixed(0)} (neutral)`);
    }

    // Factor 3: Price vs 200 MA (-20 to +20 points)
    if (ma200) {
      const maDeviation = ((price - ma200) / ma200) * 100;
      if (maDeviation < -20) {
        score -= 20;
        signals.push(
          `🟢 ${Math.abs(maDeviation).toFixed(
            0
          )}% below 200MA (strong buy zone)`
        );
      } else if (maDeviation < 0) {
        score -= 10;
        signals.push(`🟢 ${Math.abs(maDeviation).toFixed(0)}% below 200MA`);
      } else if (maDeviation > 50) {
        score += 20;
        signals.push(`🔴 ${maDeviation.toFixed(0)}% above 200MA (extended)`);
      } else if (maDeviation > 20) {
        score += 10;
        signals.push(`🟠 ${maDeviation.toFixed(0)}% above 200MA`);
      } else {
        signals.push(
          `⚪ Near 200MA (${maDeviation > 0 ? "+" : ""}${maDeviation.toFixed(
            0
          )}%)`
        );
      }
    }

    // Factor 4: 50/200 MA cross (-10 to +10 points)
    if (ma50 && ma200) {
      if (ma50 > ma200 * 1.05) {
        score += 10;
        signals.push(`🟢 Golden cross active (50MA > 200MA)`);
      } else if (ma50 < ma200 * 0.95) {
        score -= 10;
        signals.push(`🔴 Death cross active (50MA < 200MA)`);
      }
    }

    // Determine regime from score
    let regime: MarketRegime;
    if (score <= -50) {
      regime = "extreme_fear";
    } else if (score <= -20) {
      regime = "fear";
    } else if (score >= 50) {
      regime = "extreme_greed";
    } else if (score >= 20) {
      regime = "greed";
    } else {
      regime = "neutral";
    }

    return { regime, regimeScore: score, signals };
  }

  /**
   * Get action recommendation based on regime
   */
  private getRecommendation(
    regime: MarketRegime,
    score: number
  ): "strong_buy" | "buy" | "hold" | "sell" | "strong_sell" {
    if (score <= -60) return "strong_buy";
    if (score <= -30) return "buy";
    if (score >= 60) return "strong_sell";
    if (score >= 30) return "sell";
    return "hold";
  }

  /**
   * Get human-readable regime description
   */
  private getRegimeDescription(regime: MarketRegime, score: number): string {
    const descriptions: Record<MarketRegime, string> = {
      extreme_fear:
        "🟢 EXTREME FEAR - Prime accumulation zone. This is when fortunes are made.",
      fear: "🟢 FEAR - Good time to accumulate. Others are scared, be greedy.",
      neutral:
        "⚪ NEUTRAL - Market is balanced. Hold positions, wait for clarity.",
      greed: "🟠 GREED - Consider taking some profits. Don't be greedy.",
      extreme_greed:
        "🔴 EXTREME GREED - High risk zone. Take profits, preserve capital.",
    };
    return descriptions[regime];
  }

  /**
   * Save market snapshot to database
   */
  async saveSnapshot(analysis: MarketAnalysis): Promise<MarketSnapshot> {
    const [snapshot] = await db
      .insert(marketSnapshots)
      .values({
        symbol: analysis.symbol,
        price: analysis.price,
        priceHigh24h: analysis.priceHigh24h,
        priceLow24h: analysis.priceLow24h,
        volume24h: analysis.volume24h,
        ma200: analysis.ma200,
        ma50: analysis.ma50,
        rsi14: analysis.rsi14,
        allTimeHigh: analysis.allTimeHigh,
        percentFromAth: analysis.percentFromAth,
        daysSinceAth: analysis.daysSinceAth,
        regime: analysis.regime,
        regimeScore: analysis.regimeScore,
      })
      .returning();

    return snapshot;
  }

  /**
   * Get latest market snapshot from database
   */
  async getLatestSnapshot(symbol: string): Promise<MarketSnapshot | null> {
    const [snapshot] = await db
      .select()
      .from(marketSnapshots)
      .where(eq(marketSnapshots.symbol, symbol))
      .orderBy(desc(marketSnapshots.snapshotAt))
      .limit(1);

    return snapshot || null;
  }

  /**
   * Get regime history for charting
   */
  async getRegimeHistory(
    symbol: string,
    days: number = 30
  ): Promise<MarketSnapshot[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshots = await db
      .select()
      .from(marketSnapshots)
      .where(eq(marketSnapshots.symbol, symbol))
      .orderBy(desc(marketSnapshots.snapshotAt))
      .limit(days);

    return snapshots.reverse();
  }
}

export const marketAnalysisService = new MarketAnalysisService();
