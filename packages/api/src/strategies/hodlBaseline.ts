import type { TradingStrategy, MarketState, PortfolioState, StrategySignal } from "./index";

export const hodlBaselineStrategy: TradingStrategy = {
  id: "hodl-baseline",
  name: "HODL Baseline",
  description:
    "Buys 100% of capital on the first candle and never sells. Pure buy-and-hold benchmark — every other strategy should beat this to justify its complexity.",
  category: "conservative",
  minCandles: 2,

  defaultParams: {},
  paramLabels: {},
  paramDescriptions: {},

  evaluate(
    _market: MarketState,
    portfolio: PortfolioState,
    _params: Record<string, any>
  ): StrategySignal {
    if (portfolio.cryptoAmount === 0 && portfolio.cash > 10) {
      return {
        action: "buy",
        amount: portfolio.cash * 0.99,
        confidence: 1,
        reason: "HODL: initial buy",
      };
    }
    return { action: "hold", confidence: 1, reason: "HODL: holding" };
  },
};
