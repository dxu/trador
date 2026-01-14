import type {
  DashboardData,
  BotConfig,
  Strategy,
  MarketAnalysis,
  MarketSnapshot,
  Position,
  CombinedPosition,
  Transaction,
  TransactionStats,
  PerformanceSnapshot,
  BotLog,
  Backtest,
  BacktestResult,
  BacktestConfig,
  StrategyConfig,
  HistoricalDataInfo,
  IngestionStatus,
  IngestionConfig,
  DataSummary,
  OHLCVData,
} from "./types";

const API_BASE = "/api";

// Auth token management
const TOKEN_KEY = "trador_auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = getAuthToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    clearAuthToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // ============================================================================
  // AUTH
  // ============================================================================

  login: async (
    password: string
  ): Promise<{ success: boolean; token?: string; error?: string }> => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return response.json();
  },

  logout: async (): Promise<void> => {
    const token = getAuthToken();
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    clearAuthToken();
  },

  checkAuth: async (): Promise<boolean> => {
    const token = getAuthToken();
    if (!token) return false;

    try {
      const response = await fetch(`${API_BASE}/auth/check`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      return data.authenticated;
    } catch {
      return false;
    }
  },

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  getDashboard: () => fetchApi<DashboardData>("/dashboard"),

  // ============================================================================
  // BOT CONTROL
  // ============================================================================

  getBotStatus: () =>
    fetchApi<{ isRunning: boolean; status: string; config: BotConfig | null }>(
      "/bot/status"
    ),
  startBot: () =>
    fetchApi<{ success: boolean; message: string }>("/bot/start", {
      method: "POST",
    }),
  stopBot: () =>
    fetchApi<{ success: boolean; message: string }>("/bot/stop", {
      method: "POST",
    }),
  pauseBot: () =>
    fetchApi<{ success: boolean; message: string }>("/bot/pause", {
      method: "POST",
    }),
  runCycle: () =>
    fetchApi<{ success: boolean; message: string }>("/bot/run-cycle", {
      method: "POST",
    }),

  // ============================================================================
  // BOT CONFIG
  // ============================================================================

  getBotConfig: () => fetchApi<BotConfig>("/bot/config"),
  updateBotConfig: (config: Partial<BotConfig>) =>
    fetchApi<BotConfig>("/bot/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  // ============================================================================
  // STRATEGIES
  // ============================================================================

  getStrategies: () => fetchApi<Strategy[]>("/strategies"),

  getStrategy: (id: string) =>
    fetchApi<{ strategy: Strategy; position: Position | null }>(
      `/strategies/${id}`
    ),

  updateStrategy: (id: string, updates: Partial<Strategy>) =>
    fetchApi<Strategy>(`/strategies/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),

  toggleStrategy: (id: string, enabled: boolean) =>
    fetchApi<Strategy>(`/strategies/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),

  // ============================================================================
  // MARKET
  // ============================================================================

  getMarketAnalysis: (symbol?: string) => {
    const params = new URLSearchParams();
    if (symbol) params.set("symbol", symbol);
    return fetchApi<MarketAnalysis>(`/market/analysis?${params}`);
  },

  getMarketSnapshots: (params?: { symbol?: string; days?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.symbol) searchParams.set("symbol", params.symbol);
    if (params?.days) searchParams.set("days", params.days.toString());
    return fetchApi<MarketSnapshot[]>(`/market/snapshots?${searchParams}`);
  },

  getCurrentPrice: (symbol?: string) => {
    const params = new URLSearchParams();
    if (symbol) params.set("symbol", symbol);
    return fetchApi<{ symbol: string; price: number; change24h: number }>(
      `/market/current-price?${params}`
    );
  },

  // ============================================================================
  // POSITIONS
  // ============================================================================

  getPositions: () => fetchApi<Position[]>("/positions"),

  getPositionsByStrategy: () =>
    fetchApi<
      Array<{
        strategy: Strategy;
        position: Position | null;
        currentPrice: number;
        currentValue: number;
        unrealizedPnl: number;
        unrealizedPnlPercent: number;
      }>
    >("/positions/by-strategy"),

  getCombinedPosition: () => fetchApi<CombinedPosition>("/positions/combined"),

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================

  getTransactions: (params?: {
    limit?: number;
    action?: string;
    strategyId?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.action) searchParams.set("action", params.action);
    if (params?.strategyId) searchParams.set("strategyId", params.strategyId);
    return fetchApi<Transaction[]>(`/transactions?${searchParams}`);
  },

  getTransactionStats: (strategyId?: string) => {
    const params = new URLSearchParams();
    if (strategyId) params.set("strategyId", strategyId);
    return fetchApi<TransactionStats>(`/transactions/stats?${params}`);
  },

  // ============================================================================
  // PERFORMANCE
  // ============================================================================

  getPerformanceHistory: (params?: { limit?: number; strategyId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.strategyId) searchParams.set("strategyId", params.strategyId);
    return fetchApi<PerformanceSnapshot[]>(
      `/performance/history?${searchParams}`
    );
  },

  getCurrentPerformance: () =>
    fetchApi<PerformanceSnapshot>("/performance/current"),

  // ============================================================================
  // LOGS
  // ============================================================================

  getLogs: (params?: {
    limit?: number;
    level?: string;
    category?: string;
    strategyId?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.level) searchParams.set("level", params.level);
    if (params?.category) searchParams.set("category", params.category);
    if (params?.strategyId) searchParams.set("strategyId", params.strategyId);
    return fetchApi<BotLog[]>(`/logs?${searchParams}`);
  },

  // ============================================================================
  // BACKTESTING
  // ============================================================================

  listBacktests: (limit?: number) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", limit.toString());
    return fetchApi<Backtest[]>(`/backtest/list?${params}`);
  },

  getBacktest: (id: string) => fetchApi<BacktestResult>(`/backtest/${id}`),

  deleteBacktest: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(`/backtest/${id}`, {
      method: "DELETE",
    }),

  runBacktest: (config: BacktestConfig) =>
    fetchApi<BacktestResult>("/backtest/run", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  getBacktestStrategies: () =>
    fetchApi<StrategyConfig[]>("/backtest/strategies"),

  getBacktestStrategy: (id: string) =>
    fetchApi<StrategyConfig>(`/backtest/strategies/${id}`),

  getHistoricalDataInfo: (symbol?: string) => {
    const params = new URLSearchParams();
    if (symbol) params.set("symbol", symbol);
    return fetchApi<HistoricalDataInfo>(`/backtest/historical-data?${params}`);
  },

  fetchHistoricalData: (params: {
    symbol?: string;
    startDate: string;
    endDate: string;
    timeframe?: string;
  }) =>
    fetchApi<{ success: boolean; count: number; message: string }>(
      "/backtest/fetch-historical",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    ),

  // ============================================================================
  // HEALTH
  // ============================================================================

  getHealth: () =>
    fetchApi<{ status: string; bot: string; exchange: object }>("/health"),

  // ============================================================================
  // DATA INGESTION
  // ============================================================================

  getIngestionStatus: () => fetchApi<IngestionStatus>("/ingestion/status"),

  getIngestionConfigs: () => fetchApi<IngestionConfig[]>("/ingestion/configs"),

  getDataSummary: () => fetchApi<DataSummary[]>("/ingestion/summary"),

  startIngestion: () =>
    fetchApi<{ success: boolean; message: string }>("/ingestion/start", {
      method: "POST",
    }),

  stopIngestion: () =>
    fetchApi<{ success: boolean; message: string }>("/ingestion/stop", {
      method: "POST",
    }),

  fetchAllData: () =>
    fetchApi<{ success: boolean; message: string }>("/ingestion/fetch-all", {
      method: "POST",
    }),

  addIngestionConfig: (config: {
    symbol: string;
    timeframe: string;
    retentionDays?: number;
  }) =>
    fetchApi<{ success: boolean; config: IngestionConfig }>(
      "/ingestion/config",
      {
        method: "POST",
        body: JSON.stringify(config),
      }
    ),

  toggleIngestionConfig: (id: string, enabled: boolean) =>
    fetchApi<{ success: boolean }>(`/ingestion/config/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),

  deleteIngestionConfig: (id: string) =>
    fetchApi<{ success: boolean }>(`/ingestion/config/${id}`, {
      method: "DELETE",
    }),

  backfillData: (params: {
    symbol: string;
    timeframe: string;
    startDate: string;
    endDate?: string;
  }) =>
    fetchApi<{ success: boolean; totalCandles: number; errors: number }>(
      "/ingestion/backfill",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    ),

  getAvailableSymbols: () => fetchApi<string[]>("/ingestion/symbols"),

  getAvailableTimeframes: (symbol: string) =>
    fetchApi<string[]>(`/ingestion/timeframes/${encodeURIComponent(symbol)}`),

  getHistoricalData: (
    symbol: string,
    timeframe: string,
    limit?: number,
    startDate?: string,
    endDate?: string
  ) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", limit.toString());
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return fetchApi<OHLCVData[]>(
      `/ingestion/data/${encodeURIComponent(symbol)}/${timeframe}?${params}`
    );
  },

  cleanupDuplicates: () =>
    fetchApi<{ success: boolean; deletedCount: number }>(
      "/ingestion/cleanup-duplicates",
      { method: "POST" }
    ),
};
