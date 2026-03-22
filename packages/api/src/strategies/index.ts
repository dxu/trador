import type { OHLCV } from "./indicators";

export type { OHLCV } from "./indicators";

export interface StrategySignal {
  action: "buy" | "sell" | "hold";
  /** USD amount for buy, fraction of position (0-1) for sell */
  amount?: number;
  /** 0-1 confidence score */
  confidence: number;
  reason: string;
}

export interface MarketState {
  symbol: string;
  price: number;
  timestamp: number;
  candles: OHLCV[];
  indicators: Record<string, number | null>;
}

export interface PortfolioState {
  cash: number;
  cryptoAmount: number;
  avgEntryPrice: number;
  unrealizedPnlPercent: number;
  totalValue: number;
  lastBuyTimestamp: number | null;
  profitTiersTriggered: boolean[];
}

export interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  category: "conservative" | "moderate" | "aggressive";
  defaultParams: Record<string, number | string | boolean>;
  paramLabels: Record<string, string>;
  paramDescriptions: Record<string, string>;
  minCandles: number;

  evaluate(
    market: MarketState,
    portfolio: PortfolioState,
    params: Record<string, any>
  ): StrategySignal;
}

// Import all strategies
import { hodlBaselineStrategy } from "./hodlBaseline";
import { smartDcaStrategy } from "./smartDca";
import { volatilityHarvesterStrategy } from "./volatilityHarvester";

export const strategies: Record<string, TradingStrategy> = {
  [hodlBaselineStrategy.id]: hodlBaselineStrategy,
  [smartDcaStrategy.id]: smartDcaStrategy,
  [volatilityHarvesterStrategy.id]: volatilityHarvesterStrategy,
};

export const strategyList: TradingStrategy[] = Object.values(strategies);
