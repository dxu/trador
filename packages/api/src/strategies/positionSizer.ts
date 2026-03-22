import type { PortfolioState } from "./index";
import type { RegimeState } from "./regimeDetector";
import { regimeBuyMultiplier } from "./regimeDetector";

export function calculateBuyAmount(
  portfolio: PortfolioState,
  regime: RegimeState,
  baseAmountUsd: number,
  maxPositionPercent: number,
  useRegimeScaling: boolean = true
): number {
  // Regime scaling
  let amount = baseAmountUsd;
  if (useRegimeScaling) {
    amount *= regimeBuyMultiplier(regime.regime);
  }

  // Volatility scaling — reduce in high-vol environments
  if (regime.volatilityNorm > 5) {
    amount *= 0.7;
  } else if (regime.volatilityNorm > 3) {
    amount *= 0.85;
  }

  // Cap by available cash
  amount = Math.min(amount, portfolio.cash);

  // Cap by max position %
  const currentPositionPercent =
    portfolio.totalValue > 0
      ? ((portfolio.cryptoAmount * (portfolio.avgEntryPrice || 0)) /
          portfolio.totalValue) *
        100
      : 0;
  if (currentPositionPercent >= maxPositionPercent) {
    return 0;
  }

  // Minimum viable trade
  if (amount < 10) return 0;

  return amount;
}
