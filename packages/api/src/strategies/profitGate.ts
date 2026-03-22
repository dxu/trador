import type { PortfolioState } from "./index";

export interface ProfitTier {
  profitPercent: number;
  sellFraction: number;
}

export const DEFAULT_TIERS: ProfitTier[] = [
  { profitPercent: 5, sellFraction: 0.25 },
  { profitPercent: 10, sellFraction: 0.25 },
  { profitPercent: 20, sellFraction: 0.25 },
  { profitPercent: 35, sellFraction: 0.25 },
];

export function evaluateProfitGate(
  portfolio: PortfolioState,
  tiers: ProfitTier[],
  tiersTriggered: boolean[],
  thresholdShift: number = 0
): {
  shouldSell: boolean;
  sellFraction: number;
  tierIndex: number;
  reason: string;
} | null {
  if (portfolio.cryptoAmount <= 0 || portfolio.unrealizedPnlPercent <= 0) {
    return null;
  }

  for (let i = 0; i < tiers.length; i++) {
    if (tiersTriggered[i]) continue;

    const threshold = tiers[i].profitPercent + thresholdShift;
    if (portfolio.unrealizedPnlPercent >= threshold) {
      return {
        shouldSell: true,
        sellFraction: tiers[i].sellFraction,
        tierIndex: i,
        reason: `Profit tier ${i + 1}: +${portfolio.unrealizedPnlPercent.toFixed(1)}% (threshold: +${threshold}%)`,
      };
    }
  }

  return null;
}
