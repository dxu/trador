/**
 * Trading Strategy Registry
 * 
 * Each strategy defines:
 * - How to interpret market conditions
 * - When to buy and how much
 * - When to sell and how much
 * - Risk parameters
 */

import type { MarketRegime } from "../db";

// ============================================================================
// TYPES
// ============================================================================

export interface MarketConditions {
  price: number;
  rsi: number;
  ma50: number | null;
  ma200: number | null;
  percentFromAth: number;
  regime: MarketRegime;
  regimeScore: number;
}

export interface PortfolioState {
  cash: number;
  cryptoAmount: number;
  cryptoValue: number;
  totalValue: number;
  costBasis: number;
  avgEntryPrice: number;
  unrealizedPnlPercent: number;
  lastBuyTime: number;
}

export interface TradeDecision {
  action: "buy" | "sell" | "hold";
  amount?: number; // For buy: USD amount. For sell: crypto amount
  reason: string;
}

export interface StrategyConfig {
  id: string;
  name: string;
  description: string;
  category: "conservative" | "moderate" | "aggressive" | "experimental";
  
  // Strategy parameters (each strategy can interpret these differently)
  params: {
    // Position limits
    maxPositionPercent: number;    // Max % of portfolio in crypto
    minPositionPercent: number;    // Min % of portfolio in crypto (floor)
    
    // Buy parameters
    buyAmountPercent: number;      // % of cash to use per buy
    buyFrequencyHours: number;     // Minimum hours between buys
    
    // Sell parameters  
    sellAmountPercent: number;     // % of position to sell
    minProfitToSell: number;       // Minimum profit % before selling
    
    // Regime thresholds
    fearThreshold: number;         // % from ATH to consider "fear"
    extremeFearThreshold: number;  // % from ATH for "extreme fear"
    greedRsiThreshold: number;     // RSI level for "greed"
    extremeGreedRsiThreshold: number; // RSI for "extreme greed"
    
    // Strategy-specific params
    [key: string]: number | string | boolean;
  };
}

export interface TradingStrategy {
  config: StrategyConfig;
  
  /**
   * Decide what action to take given market conditions and portfolio state
   */
  decide(market: MarketConditions, portfolio: PortfolioState): TradeDecision;
  
  /**
   * Get regime interpretation for this strategy
   */
  interpretRegime(market: MarketConditions): MarketRegime;
}

// ============================================================================
// STRATEGY IMPLEMENTATIONS
// ============================================================================

/**
 * HODL Strategy - Buy and never sell
 * Baseline for comparison
 */
export const hodlStrategy: TradingStrategy = {
  config: {
    id: "hodl",
    name: "HODL (Buy & Hold)",
    description: "Buy with all capital immediately and never sell. The simplest baseline strategy.",
    category: "moderate",
    params: {
      maxPositionPercent: 100,
      minPositionPercent: 100,
      buyAmountPercent: 100,
      buyFrequencyHours: 0,
      sellAmountPercent: 0,
      minProfitToSell: 999999,
      fearThreshold: -30,
      extremeFearThreshold: -50,
      greedRsiThreshold: 70,
      extremeGreedRsiThreshold: 85,
    },
  },
  
  decide(market, portfolio): TradeDecision {
    // Buy everything on day 1, never sell
    if (portfolio.cryptoAmount === 0 && portfolio.cash > 0) {
      return {
        action: "buy",
        amount: portfolio.cash * 0.99, // Leave tiny buffer for fees
        reason: "Initial HODL purchase",
      };
    }
    return { action: "hold", reason: "HODL - never sell" };
  },
  
  interpretRegime(market): MarketRegime {
    return "neutral"; // Doesn't matter for HODL
  },
};

/**
 * DCA Strategy - Dollar Cost Average regardless of conditions
 * Buy fixed amount on schedule, never sell
 */
export const dcaStrategy: TradingStrategy = {
  config: {
    id: "dca",
    name: "DCA (Dollar Cost Average)",
    description: "Buy a fixed amount on a regular schedule regardless of market conditions. Never sell.",
    category: "conservative",
    params: {
      maxPositionPercent: 100,
      minPositionPercent: 0,
      buyAmountPercent: 5,        // 5% of initial capital per buy
      buyFrequencyHours: 168,     // Weekly
      sellAmountPercent: 0,
      minProfitToSell: 999999,
      fearThreshold: -30,
      extremeFearThreshold: -50,
      greedRsiThreshold: 70,
      extremeGreedRsiThreshold: 85,
    },
  },
  
  decide(market, portfolio): TradeDecision {
    const hoursSinceLastBuy = (Date.now() - portfolio.lastBuyTime) / (1000 * 60 * 60);
    const buyAmount = portfolio.totalValue * (this.config.params.buyAmountPercent / 100);
    
    if (hoursSinceLastBuy >= this.config.params.buyFrequencyHours && portfolio.cash >= buyAmount) {
      return {
        action: "buy",
        amount: Math.min(buyAmount, portfolio.cash * 0.99),
        reason: `Weekly DCA buy`,
      };
    }
    return { action: "hold", reason: "Waiting for next DCA period" };
  },
  
  interpretRegime(market): MarketRegime {
    return "neutral";
  },
};

/**
 * Fear & Greed Conservative - Original strategy but very conservative
 * Only buy in extreme fear, only sell in extreme greed with high profit
 */
export const fearGreedConservative: TradingStrategy = {
  config: {
    id: "fear-greed-conservative",
    name: "Fear & Greed (Conservative)",
    description: "Only buy during extreme fear, only sell during extreme greed with 30%+ profit. Very patient.",
    category: "conservative",
    params: {
      maxPositionPercent: 70,
      minPositionPercent: 0,
      buyAmountPercent: 10,
      buyFrequencyHours: 72,      // Every 3 days max
      sellAmountPercent: 15,
      minProfitToSell: 30,        // Need 30% profit to sell
      fearThreshold: -35,
      extremeFearThreshold: -50,
      greedRsiThreshold: 75,
      extremeGreedRsiThreshold: 85,
    },
  },
  
  decide(market, portfolio): TradeDecision {
    const regime = this.interpretRegime(market);
    const hoursSinceLastBuy = (Date.now() - portfolio.lastBuyTime) / (1000 * 60 * 60);
    const positionPercent = (portfolio.cryptoValue / portfolio.totalValue) * 100;
    
    // Only buy in extreme fear
    if (regime === "extreme_fear") {
      if (positionPercent < this.config.params.maxPositionPercent && 
          hoursSinceLastBuy >= this.config.params.buyFrequencyHours &&
          portfolio.cash > 100) {
        const buyAmount = portfolio.cash * (this.config.params.buyAmountPercent / 100);
        return {
          action: "buy",
          amount: buyAmount,
          reason: `Extreme fear accumulation (${market.percentFromAth.toFixed(0)}% from ATH, RSI ${market.rsi.toFixed(0)})`,
        };
      }
    }
    
    // Only sell in extreme greed with significant profit
    if (regime === "extreme_greed" && portfolio.cryptoAmount > 0) {
      if (portfolio.unrealizedPnlPercent >= this.config.params.minProfitToSell) {
        const sellAmount = portfolio.cryptoAmount * (this.config.params.sellAmountPercent / 100);
        return {
          action: "sell",
          amount: sellAmount,
          reason: `Extreme greed profit taking (+${portfolio.unrealizedPnlPercent.toFixed(0)}% profit, RSI ${market.rsi.toFixed(0)})`,
        };
      }
    }
    
    return { action: "hold", reason: `Waiting for better opportunity (regime: ${regime})` };
  },
  
  interpretRegime(market): MarketRegime {
    const { percentFromAth, rsi } = market;
    const p = this.config.params;
    
    if (percentFromAth <= p.extremeFearThreshold || rsi <= 25) return "extreme_fear";
    if (percentFromAth <= p.fearThreshold || rsi <= 35) return "fear";
    if (rsi >= p.extremeGreedRsiThreshold) return "extreme_greed";
    if (rsi >= p.greedRsiThreshold) return "greed";
    return "neutral";
  },
};

/**
 * Fear & Greed Moderate - Balanced approach
 */
export const fearGreedModerate: TradingStrategy = {
  config: {
    id: "fear-greed-moderate",
    name: "Fear & Greed (Moderate)",
    description: "Buy during fear phases, sell during greed with 15%+ profit. Balanced risk/reward.",
    category: "moderate",
    params: {
      maxPositionPercent: 80,
      minPositionPercent: 20,     // Always keep at least 20% invested
      buyAmountPercent: 15,
      buyFrequencyHours: 48,
      sellAmountPercent: 20,
      minProfitToSell: 15,
      fearThreshold: -25,
      extremeFearThreshold: -40,
      greedRsiThreshold: 70,
      extremeGreedRsiThreshold: 80,
    },
  },
  
  decide(market, portfolio): TradeDecision {
    const regime = this.interpretRegime(market);
    const hoursSinceLastBuy = (Date.now() - portfolio.lastBuyTime) / (1000 * 60 * 60);
    const positionPercent = (portfolio.cryptoValue / portfolio.totalValue) * 100;
    
    // Buy in fear or extreme fear
    if (regime === "extreme_fear" || regime === "fear") {
      const buyMultiplier = regime === "extreme_fear" ? 1.5 : 1;
      const frequencyMultiplier = regime === "extreme_fear" ? 0.5 : 1;
      
      if (positionPercent < this.config.params.maxPositionPercent && 
          hoursSinceLastBuy >= this.config.params.buyFrequencyHours * frequencyMultiplier &&
          portfolio.cash > 100) {
        const buyAmount = portfolio.cash * (this.config.params.buyAmountPercent / 100) * buyMultiplier;
        return {
          action: "buy",
          amount: Math.min(buyAmount, portfolio.cash * 0.95),
          reason: `${regime} accumulation (${market.percentFromAth.toFixed(0)}% from ATH, RSI ${market.rsi.toFixed(0)})`,
        };
      }
    }
    
    // Sell in greed with profit (but respect minimum position)
    if ((regime === "greed" || regime === "extreme_greed") && portfolio.cryptoAmount > 0) {
      const minCrypto = (portfolio.totalValue * this.config.params.minPositionPercent / 100) / market.price;
      
      if (portfolio.unrealizedPnlPercent >= this.config.params.minProfitToSell &&
          portfolio.cryptoAmount > minCrypto) {
        const sellMultiplier = regime === "extreme_greed" ? 1.5 : 1;
        const maxSellAmount = portfolio.cryptoAmount - minCrypto;
        const sellAmount = Math.min(
          portfolio.cryptoAmount * (this.config.params.sellAmountPercent / 100) * sellMultiplier,
          maxSellAmount
        );
        
        if (sellAmount > 0) {
          return {
            action: "sell",
            amount: sellAmount,
            reason: `${regime} profit taking (+${portfolio.unrealizedPnlPercent.toFixed(0)}% profit, RSI ${market.rsi.toFixed(0)})`,
          };
        }
      }
    }
    
    return { action: "hold", reason: `Holding (regime: ${regime}, position: ${positionPercent.toFixed(0)}%)` };
  },
  
  interpretRegime(market): MarketRegime {
    const { percentFromAth, rsi } = market;
    const p = this.config.params;
    
    if (percentFromAth <= p.extremeFearThreshold || rsi <= 30) return "extreme_fear";
    if (percentFromAth <= p.fearThreshold || rsi <= 40) return "fear";
    if (rsi >= p.extremeGreedRsiThreshold) return "extreme_greed";
    if (rsi >= p.greedRsiThreshold) return "greed";
    return "neutral";
  },
};

/**
 * Fear & Greed Aggressive - Stay heavily invested, only trim at extremes
 */
export const fearGreedAggressive: TradingStrategy = {
  config: {
    id: "fear-greed-aggressive",
    name: "Fear & Greed (Aggressive)",
    description: "Stay 60%+ invested always. Buy aggressively in fear, only sell small amounts at extreme greed.",
    category: "aggressive",
    params: {
      maxPositionPercent: 95,
      minPositionPercent: 60,     // Always keep 60% invested minimum
      buyAmountPercent: 25,
      buyFrequencyHours: 24,
      sellAmountPercent: 10,      // Only sell 10% at a time
      minProfitToSell: 25,        // Need 25% profit
      fearThreshold: -20,
      extremeFearThreshold: -35,
      greedRsiThreshold: 75,
      extremeGreedRsiThreshold: 85,
    },
  },
  
  decide(market, portfolio): TradeDecision {
    const regime = this.interpretRegime(market);
    const hoursSinceLastBuy = (Date.now() - portfolio.lastBuyTime) / (1000 * 60 * 60);
    const positionPercent = (portfolio.cryptoValue / portfolio.totalValue) * 100;
    
    // If below minimum position, buy regardless of regime
    if (positionPercent < this.config.params.minPositionPercent && portfolio.cash > 100) {
      const targetBuy = (this.config.params.minPositionPercent - positionPercent) / 100 * portfolio.totalValue;
      return {
        action: "buy",
        amount: Math.min(targetBuy, portfolio.cash * 0.95),
        reason: `Rebalancing to minimum position (${positionPercent.toFixed(0)}% → ${this.config.params.minPositionPercent}%)`,
      };
    }
    
    // Buy aggressively in any fear
    if (regime === "extreme_fear" || regime === "fear") {
      const buyMultiplier = regime === "extreme_fear" ? 2 : 1;
      
      if (positionPercent < this.config.params.maxPositionPercent && 
          hoursSinceLastBuy >= this.config.params.buyFrequencyHours &&
          portfolio.cash > 100) {
        const buyAmount = portfolio.cash * (this.config.params.buyAmountPercent / 100) * buyMultiplier;
        return {
          action: "buy",
          amount: Math.min(buyAmount, portfolio.cash * 0.95),
          reason: `Aggressive ${regime} buying (${market.percentFromAth.toFixed(0)}% from ATH)`,
        };
      }
    }
    
    // Only sell small amounts at EXTREME greed with high profit
    if (regime === "extreme_greed" && portfolio.cryptoAmount > 0) {
      const minCrypto = (portfolio.totalValue * this.config.params.minPositionPercent / 100) / market.price;
      
      if (portfolio.unrealizedPnlPercent >= this.config.params.minProfitToSell &&
          portfolio.cryptoAmount > minCrypto) {
        const maxSellAmount = portfolio.cryptoAmount - minCrypto;
        const sellAmount = Math.min(
          portfolio.cryptoAmount * (this.config.params.sellAmountPercent / 100),
          maxSellAmount
        );
        
        if (sellAmount > 0) {
          return {
            action: "sell",
            amount: sellAmount,
            reason: `Trimming at extreme greed (+${portfolio.unrealizedPnlPercent.toFixed(0)}% profit, RSI ${market.rsi.toFixed(0)})`,
          };
        }
      }
    }
    
    return { action: "hold", reason: `Staying invested (${positionPercent.toFixed(0)}% position)` };
  },
  
  interpretRegime(market): MarketRegime {
    const { percentFromAth, rsi } = market;
    const p = this.config.params;
    
    if (percentFromAth <= p.extremeFearThreshold || rsi <= 30) return "extreme_fear";
    if (percentFromAth <= p.fearThreshold || rsi <= 40) return "fear";
    if (rsi >= p.extremeGreedRsiThreshold) return "extreme_greed";
    if (rsi >= p.greedRsiThreshold) return "greed";
    return "neutral";
  },
};

/**
 * Momentum Strategy - Follow the trend
 * Buy when price is above MA, sell when below
 */
export const momentumStrategy: TradingStrategy = {
  config: {
    id: "momentum",
    name: "Momentum (Trend Following)",
    description: "Buy when price is above 50-day MA, sell when below. Follows the trend.",
    category: "aggressive",
    params: {
      maxPositionPercent: 90,
      minPositionPercent: 10,
      buyAmountPercent: 30,
      buyFrequencyHours: 24,
      sellAmountPercent: 30,
      minProfitToSell: 0,        // Sell regardless of profit if trend breaks
      fearThreshold: -30,
      extremeFearThreshold: -50,
      greedRsiThreshold: 70,
      extremeGreedRsiThreshold: 85,
      maType: "50",              // Use 50-day MA
    },
  },
  
  decide(market, portfolio): TradeDecision {
    const hoursSinceLastBuy = (Date.now() - portfolio.lastBuyTime) / (1000 * 60 * 60);
    const positionPercent = (portfolio.cryptoValue / portfolio.totalValue) * 100;
    
    // No MA data yet
    if (!market.ma50) {
      return { action: "hold", reason: "Waiting for MA data" };
    }
    
    const aboveMA = market.price > market.ma50;
    const maDistance = ((market.price - market.ma50) / market.ma50) * 100;
    
    // Buy when price is above MA (uptrend)
    if (aboveMA && positionPercent < this.config.params.maxPositionPercent) {
      if (hoursSinceLastBuy >= this.config.params.buyFrequencyHours && portfolio.cash > 100) {
        const buyAmount = portfolio.cash * (this.config.params.buyAmountPercent / 100);
        return {
          action: "buy",
          amount: buyAmount,
          reason: `Uptrend confirmed (${maDistance.toFixed(1)}% above 50MA)`,
        };
      }
    }
    
    // Sell when price drops below MA (downtrend)
    if (!aboveMA && portfolio.cryptoAmount > 0) {
      const minCrypto = (portfolio.totalValue * this.config.params.minPositionPercent / 100) / market.price;
      const maxSellAmount = portfolio.cryptoAmount - minCrypto;
      
      if (maxSellAmount > 0) {
        const sellAmount = Math.min(
          portfolio.cryptoAmount * (this.config.params.sellAmountPercent / 100),
          maxSellAmount
        );
        return {
          action: "sell",
          amount: sellAmount,
          reason: `Downtrend detected (${Math.abs(maDistance).toFixed(1)}% below 50MA)`,
        };
      }
    }
    
    return { action: "hold", reason: `Trend: ${aboveMA ? "UP" : "DOWN"} (${maDistance.toFixed(1)}% from 50MA)` };
  },
  
  interpretRegime(market): MarketRegime {
    if (!market.ma50) return "neutral";
    const aboveMA = market.price > market.ma50;
    const distance = Math.abs((market.price - market.ma50) / market.ma50) * 100;
    
    if (aboveMA && distance > 20) return "extreme_greed";
    if (aboveMA) return "greed";
    if (!aboveMA && distance > 20) return "extreme_fear";
    if (!aboveMA) return "fear";
    return "neutral";
  },
};

/**
 * Buy the Dip - Only buy on significant drops, hold otherwise
 */
export const buyTheDip: TradingStrategy = {
  config: {
    id: "buy-the-dip",
    name: "Buy the Dip",
    description: "Only buy after 10%+ drops from recent highs. Never sell. Accumulate on weakness.",
    category: "aggressive",
    params: {
      maxPositionPercent: 100,
      minPositionPercent: 0,
      buyAmountPercent: 20,
      buyFrequencyHours: 48,
      sellAmountPercent: 0,
      minProfitToSell: 999999,
      fearThreshold: -10,         // 10% dip triggers buy
      extremeFearThreshold: -20,  // 20% dip = aggressive buy
      greedRsiThreshold: 70,
      extremeGreedRsiThreshold: 85,
      dipThreshold: -10,          // Custom: minimum dip to buy
    },
  },
  
  decide(market, portfolio): TradeDecision {
    const hoursSinceLastBuy = (Date.now() - portfolio.lastBuyTime) / (1000 * 60 * 60);
    const positionPercent = (portfolio.cryptoValue / portfolio.totalValue) * 100;
    const dipThreshold = this.config.params.dipThreshold as number;
    
    // Check if we're in a dip
    const inDip = market.percentFromAth <= dipThreshold;
    const inBigDip = market.percentFromAth <= dipThreshold * 2;
    
    if (inDip && positionPercent < this.config.params.maxPositionPercent) {
      if (hoursSinceLastBuy >= this.config.params.buyFrequencyHours && portfolio.cash > 100) {
        const multiplier = inBigDip ? 2 : 1;
        const buyAmount = portfolio.cash * (this.config.params.buyAmountPercent / 100) * multiplier;
        return {
          action: "buy",
          amount: Math.min(buyAmount, portfolio.cash * 0.95),
          reason: `Buying the dip (${market.percentFromAth.toFixed(0)}% from ATH)`,
        };
      }
    }
    
    // Never sell
    return { action: "hold", reason: `Waiting for dip (currently ${market.percentFromAth.toFixed(0)}% from ATH)` };
  },
  
  interpretRegime(market): MarketRegime {
    if (market.percentFromAth <= -20) return "extreme_fear";
    if (market.percentFromAth <= -10) return "fear";
    return "neutral";
  },
};

// ============================================================================
// STRATEGY REGISTRY
// ============================================================================

export const STRATEGY_REGISTRY: Record<string, TradingStrategy> = {
  "hodl": hodlStrategy,
  "dca": dcaStrategy,
  "fear-greed-conservative": fearGreedConservative,
  "fear-greed-moderate": fearGreedModerate,
  "fear-greed-aggressive": fearGreedAggressive,
  "momentum": momentumStrategy,
  "buy-the-dip": buyTheDip,
};

export const STRATEGY_LIST = Object.values(STRATEGY_REGISTRY).map(s => s.config);

export function getStrategy(id: string): TradingStrategy | null {
  return STRATEGY_REGISTRY[id] || null;
}

export function listStrategies(): StrategyConfig[] {
  return STRATEGY_LIST;
}
