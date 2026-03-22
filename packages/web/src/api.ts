import type {
  IngestionStatus,
  IngestionConfig,
  DataSummary,
  OHLCVData,
  MarketOverviewItem,
  Strategy,
  BacktestRun,
  BacktestTrade,
  BacktestSnapshot,
} from "./types";

const API_BASE = "/api";

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

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
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
  // Auth
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

  // Data Ingestion
  getIngestionStatus: () => fetchApi<IngestionStatus>("/ingestion/status"),

  getIngestionConfigs: () => fetchApi<IngestionConfig[]>("/ingestion/configs"),

  getDataSummary: () => fetchApi<DataSummary[]>("/ingestion/summary"),

  getMarketOverview: () => fetchApi<MarketOverviewItem[]>("/ingestion/market-overview"),

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

  addIngestionConfig: (config: { symbol: string; timeframe: string; retentionDays?: number }) =>
    fetchApi<{ success: boolean; config: IngestionConfig }>("/ingestion/config", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  toggleIngestionConfig: (id: string, enabled: boolean) =>
    fetchApi<{ success: boolean }>(`/ingestion/config/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),

  deleteIngestionConfig: (id: string) =>
    fetchApi<{ success: boolean }>(`/ingestion/config/${id}`, {
      method: "DELETE",
    }),

  backfillData: (params: { symbol: string; timeframe: string; startDate: string; endDate?: string }) =>
    fetchApi<{ success: boolean; totalCandles: number; errors: number }>("/ingestion/backfill", {
      method: "POST",
      body: JSON.stringify(params),
    }),

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
    fetchApi<{ success: boolean; deletedCount: number }>("/ingestion/cleanup-duplicates", {
      method: "POST",
    }),

  // Strategies
  getStrategies: () => fetchApi<Strategy[]>("/strategies"),

  // Backtests
  startBacktest: (config: {
    strategySlug: string;
    symbol: string;
    timeframe: string;
    startDate: string;
    endDate: string;
    initialCapital: number;
    paramOverrides?: Record<string, any>;
  }) =>
    fetchApi<{ success: boolean; id: string }>("/backtests", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  getBacktestRuns: () => fetchApi<BacktestRun[]>("/backtests"),

  getBacktestResult: (id: string) => fetchApi<BacktestRun>(`/backtests/${id}`),

  getBacktestTrades: (id: string) => fetchApi<BacktestTrade[]>(`/backtests/${id}/trades`),

  getBacktestSnapshots: (id: string) => fetchApi<BacktestSnapshot[]>(`/backtests/${id}/snapshots`),

  deleteBacktest: (id: string) =>
    fetchApi<{ success: boolean }>(`/backtests/${id}`, { method: "DELETE" }),
};
