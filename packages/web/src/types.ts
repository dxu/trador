// ============================================================================
// DATA INGESTION
// ============================================================================

export interface IngestionConfig {
  id: string;
  symbol: string;
  timeframe: string;
  enabled: boolean;
  lastFetchAt: string | null;
  lastDataTimestamp: string | null;
  retentionDays: number | null;
  totalCandles: number;
  fetchErrorCount: number;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngestionStatus {
  isRunning: boolean;
  queueLength: number;
  configs: Array<{
    symbol: string;
    timeframe: string;
    enabled: boolean;
    totalCandles: number;
    lastFetch: string | null;
    lastData: string | null;
    hasError: boolean;
  }>;
}

export interface DataSummary {
  symbol: string;
  timeframe: string;
  count: number;
  firstCandle: string | null;
  lastCandle: string | null;
  enabled: boolean;
  lastFetch: string | null;
}

export interface OHLCVData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketOverviewItem {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  sparkline: number[];
}

// ============================================================================
// STRATEGIES
// ============================================================================

export interface Strategy {
  id: string;
  name: string;
  description: string;
  category: "conservative" | "moderate" | "aggressive";
  defaultParams: Record<string, number | string | boolean>;
  paramLabels: Record<string, string>;
  paramDescriptions: Record<string, string>;
  minCandles: number;
}

// ============================================================================
// BACKTESTING
// ============================================================================

export interface BacktestRun {
  id: string;
  strategySlug: string;
  strategyParams: string;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalValue: number | null;
  totalReturn: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
  winRate: number | null;
  totalTrades: number | null;
  buyHoldReturn: number | null;
  timeLocked: number | null;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface BacktestTrade {
  id: string;
  backtestId: string;
  timestamp: string;
  side: string;
  price: number;
  amount: number;
  cost: number;
  fee: number;
  reason: string;
  portfolioValueAfter: number;
  avgEntryAfter: number;
  avgEntryBefore: number | null;
}

export interface BacktestSnapshot {
  id: string;
  backtestId: string;
  timestamp: string;
  portfolioValue: number;
  cashBalance: number;
  cryptoValue: number;
  cryptoAmount: number;
  drawdownPercent: number;
}
