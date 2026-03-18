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
