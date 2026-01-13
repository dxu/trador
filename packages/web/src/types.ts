// ============================================================================
// MARKET REGIME TYPES
// ============================================================================

export type MarketRegime =
  | "extreme_fear"
  | "fear"
  | "neutral"
  | "greed"
  | "extreme_greed";
export type ActionType = "buy" | "sell" | "hold";
export type BotStatus = "running" | "paused" | "stopped" | "error";
export type Recommendation =
  | "strong_buy"
  | "buy"
  | "hold"
  | "sell"
  | "strong_sell";
export type RiskProfile = "conservative" | "moderate" | "aggressive";

// ============================================================================
// BOT CONFIGURATION
// ============================================================================

export interface BotConfig {
  id: string;
  symbol: string;
  status: BotStatus;
  enabled: boolean;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveErrors: number;
  maxConsecutiveErrors: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// STRATEGIES
// ============================================================================

export interface Strategy {
  id: string;
  name: string;
  riskProfile: RiskProfile;
  enabled: boolean;

  // Allocation
  allocationPercent: number;

  // DCA settings
  dcaAmountUsdt: number;
  dcaFrequencyHours: number;
  maxPositionUsdt: number;

  // Profit taking
  minProfitToSell: number;
  sellPercentage: number;

  // Thresholds
  fearThreshold: number;
  extremeFearThreshold: number;
  greedRsiThreshold: number;
  extremeGreedRsiThreshold: number;

  lastDcaAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyWithPosition extends Strategy {
  position: Position | null;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

// ============================================================================
// MARKET ANALYSIS
// ============================================================================

export interface MarketAnalysis {
  symbol: string;
  price: number;
  priceHigh24h: number;
  priceLow24h: number;
  volume24h: number;

  ma200: number | null;
  ma50: number | null;
  rsi14: number;

  allTimeHigh: number;
  percentFromAth: number;
  daysSinceAth: number;

  regime: MarketRegime;
  regimeScore: number;
  regimeDescription: string;

  signals: string[];
  recommendation: Recommendation;
}

export interface MarketSnapshot {
  id: string;
  symbol: string;
  price: number;
  ma200: number | null;
  ma50: number | null;
  rsi14: number | null;
  regime: MarketRegime;
  regimeScore: number | null;
  percentFromAth: number | null;
  snapshotAt: string;
}

// ============================================================================
// POSITIONS & TRANSACTIONS
// ============================================================================

export interface Position {
  id: string;
  strategyId: string | null;
  symbol: string;
  status: "open" | "partial" | "closed";

  totalAmount: number;
  totalCostUsdt: number;
  averageEntryPrice: number | null;

  realizedProfitUsdt: number;
  realizedProfitPercent: number | null;

  totalBuys: number;
  totalSells: number;
  firstBuyAt: string | null;
  lastActivityAt: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface CombinedPosition {
  symbol: string;
  totalAmount: number;
  totalCostUsdt: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedProfitUsdt: number;
  totalPnl: number;
}

export interface Transaction {
  id: string;
  positionId: string | null;
  strategyId: string | null;
  symbol: string;

  action: ActionType;
  amount: number;
  price: number;
  valueUsdt: number;
  fee: number | null;

  regime: MarketRegime | null;
  regimeScore: number | null;
  reason: string | null;

  costBasisUsdt: number | null;
  profitUsdt: number | null;
  profitPercent: number | null;

  exchangeOrderId: string | null;
  executedAt: string;
  createdAt: string;
}

// ============================================================================
// PERFORMANCE
// ============================================================================

export interface PerformanceSnapshot {
  id: string;
  strategyId: string | null;

  totalValueUsdt: number;
  totalCostBasisUsdt: number;
  cashUsdt: number;

  cryptoAmount: number;
  cryptoValueUsdt: number;
  currentPrice: number;

  unrealizedProfitUsdt: number | null;
  unrealizedProfitPercent: number | null;
  realizedProfitUsdt: number;
  totalProfitUsdt: number | null;
  totalProfitPercent: number | null;

  regime: MarketRegime | null;
  regimeScore: number | null;

  snapshotAt: string;
}

// ============================================================================
// BOT LOGS
// ============================================================================

export interface BotLog {
  id: string;
  strategyId: string | null;
  level: string;
  category: string;
  message: string;
  data: object | null;
  regime: MarketRegime | null;
  price: number | null;
  createdAt: string;
}

// ============================================================================
// DASHBOARD
// ============================================================================

export interface DashboardData {
  bot: {
    status: BotStatus;
    isRunning: boolean;
    config: BotConfig | null;
  };
  market: {
    symbol: string;
    price: number;
    regime: MarketRegime;
    regimeScore: number;
    regimeDescription: string;
    rsi: number;
    percentFromAth: number;
    signals: string[];
    recommendation: Recommendation;
  } | null;
  strategies: StrategyWithPosition[];
  combined: {
    totalAmount: number;
    totalCostUsdt: number;
    currentValue: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    realizedProfitUsdt: number;
    totalPnl: number;
  };
  performance: PerformanceSnapshot | null;
  stats: {
    totalTransactions: number;
    totalBuys: number;
    totalSells: number;
    realizedProfit: number;
  };
  recentTransactions: Transaction[];
  recentLogs: BotLog[];
}

export interface TransactionStats {
  totalTransactions: number;
  totalBuys: number;
  totalSells: number;
  totalInvested: number;
  totalSold: number;
  totalFees: number;
  realizedProfit: number;
  winRate: number;
  avgBuySize: number;
  avgSellSize: number;
}

// ============================================================================
// BACKTESTING
// ============================================================================

export type StrategyCategory =
  | "conservative"
  | "moderate"
  | "aggressive"
  | "experimental";

export interface StrategyConfig {
  id: string;
  name: string;
  description: string;
  category: StrategyCategory;
  params: Record<string, number | string | boolean>;
}

export interface StrategyParams {
  name: string;
  dcaAmountUsdt: number;
  dcaFrequencyHours: number;
  maxPositionUsdt: number;
  minProfitToSell: number;
  sellPercentage: number;
  fearThreshold: number;
  extremeFearThreshold: number;
  greedRsiThreshold: number;
  extremeGreedRsiThreshold: number;
}

export interface Backtest {
  id: string;
  name: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  strategyParams: StrategyParams | Record<string, number | string | boolean>;
  riskProfile: RiskProfile | StrategyCategory | null;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  error: string | null;

  // Results
  finalCapital: number | null;
  totalReturn: number | null;
  totalReturnUsdt: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
  winRate: number | null;
  totalTrades: number | null;
  profitableTrades: number | null;
  avgTradeReturn: number | null;
  avgWinSize: number | null;
  avgLossSize: number | null;
  buyAndHoldReturn: number | null;
  outperformance: number | null;

  createdAt: string;
  completedAt: string | null;
}

export interface BacktestTrade {
  id: string;
  backtestId: string;
  action: ActionType;
  timestamp: string;
  price: number;
  amount: number;
  valueUsdt: number;
  fee: number;

  regime: MarketRegime | null;
  regimeScore: number | null;
  rsi: number | null;
  percentFromAth: number | null;
  reason: string | null;

  costBasis: number | null;
  profitUsdt: number | null;
  profitPercent: number | null;

  portfolioValue: number | null;
  cashBalance: number | null;
  cryptoBalance: number | null;

  createdAt: string;
}

export interface BacktestSnapshot {
  id: string;
  backtestId: string;
  timestamp: string;
  price: number;
  portfolioValue: number;
  cashBalance: number;
  cryptoBalance: number;
  cryptoValue: number;
  regime: MarketRegime | null;
  regimeScore: number | null;
  rsi: number | null;
  createdAt: string;
}

export interface BacktestResult {
  backtest: Backtest;
  trades: BacktestTrade[];
  snapshots: BacktestSnapshot[];
  equityCurve: { timestamp: string; value: number }[];
}

export interface BacktestConfig {
  name?: string;
  symbol?: string;
  startDate: string;
  endDate: string;
  initialCapital?: number;
  strategyId?: string;
}

export interface HistoricalDataInfo {
  earliest: string | null;
  latest: string | null;
  count: number;
}
