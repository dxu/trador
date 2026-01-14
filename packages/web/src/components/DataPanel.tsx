import { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "../api";
import type { DataSummary, IngestionStatus, OHLCVData } from "../types";

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(date: string | null): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

const TIMEFRAME_LABELS: Record<string, string> = {
  "1m": "1 Minute",
  "5m": "5 Minutes",
  "15m": "15 Minutes",
  "1h": "1 Hour",
  "4h": "4 Hours",
  "1d": "Daily",
};

// ============================================================================
// PRICE CHART
// ============================================================================

function PriceChart({ data }: { data: OHLCVData[] }) {
  if (!data || data.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        Not enough data to display chart
      </div>
    );
  }

  // Sort by timestamp ascending for chart
  const sorted = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const closes = sorted.map((d) => d.close);
  const min = Math.min(...closes) * 0.995;
  const max = Math.max(...closes) * 1.005;
  const range = max - min || 1;

  const points = sorted
    .map((d, i) => {
      const x = (i / (sorted.length - 1)) * 100;
      const y = 100 - ((d.close - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  const isPositive = closes[closes.length - 1] >= closes[0];
  const currentPrice = closes[closes.length - 1];
  const startPrice = closes[0];
  const changePercent = ((currentPrice - startPrice) / startPrice) * 100;

  return (
    <div className="relative">
      {/* Price labels */}
      <div className="absolute top-0 right-0 text-right">
        <div className="text-2xl font-bold text-gray-900">
          $
          {currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div
          className={`text-sm font-medium ${
            isPositive ? "text-green-600" : "text-red-600"
          }`}
        >
          {isPositive ? "+" : ""}
          {changePercent.toFixed(2)}%
        </div>
      </div>

      {/* Chart */}
      <svg
        width="100%"
        height={200}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="priceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop
              offset="0%"
              stopColor={isPositive ? "#10b981" : "#ef4444"}
              stopOpacity="0.2"
            />
            <stop
              offset="100%"
              stopColor={isPositive ? "#10b981" : "#ef4444"}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        <polygon
          points={`0,100 ${points} 100,100`}
          fill="url(#priceGradient)"
        />
        <polyline
          points={points}
          fill="none"
          stroke={isPositive ? "#10b981" : "#ef4444"}
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Date range */}
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>{formatDate(sorted[0].timestamp)}</span>
        <span>{formatDate(sorted[sorted.length - 1].timestamp)}</span>
      </div>
    </div>
  );
}

// ============================================================================
// DATA TABLE
// ============================================================================

function DataTable({ data }: { data: OHLCVData[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">No data available</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-2 font-semibold text-gray-700">
              Date
            </th>
            <th className="text-right py-3 px-2 font-semibold text-gray-700">
              Open
            </th>
            <th className="text-right py-3 px-2 font-semibold text-gray-700">
              High
            </th>
            <th className="text-right py-3 px-2 font-semibold text-gray-700">
              Low
            </th>
            <th className="text-right py-3 px-2 font-semibold text-gray-700">
              Close
            </th>
            <th className="text-right py-3 px-2 font-semibold text-gray-700">
              Volume
            </th>
            <th className="text-right py-3 px-2 font-semibold text-gray-700">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const change = ((row.close - row.open) / row.open) * 100;
            const isPositive = change >= 0;
            return (
              <tr
                key={row.timestamp}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-2 px-2 text-gray-600">
                  {new Date(row.timestamp).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "2-digit",
                  })}
                </td>
                <td className="py-2 px-2 text-right font-mono text-gray-900">
                  $
                  {row.open.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="py-2 px-2 text-right font-mono text-green-600">
                  $
                  {row.high.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="py-2 px-2 text-right font-mono text-red-600">
                  $
                  {row.low.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="py-2 px-2 text-right font-mono font-medium text-gray-900">
                  $
                  {row.close.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="py-2 px-2 text-right font-mono text-gray-500">
                  {formatNumber(row.volume)}
                </td>
                <td
                  className={`py-2 px-2 text-right font-mono font-medium ${
                    isPositive ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {change.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ isRunning }: { isRunning: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
        isRunning ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isRunning ? "bg-green-500 animate-pulse" : "bg-gray-400"
        }`}
      />
      {isRunning ? "Running" : "Stopped"}
    </span>
  );
}

// ============================================================================
// DATA CARD
// ============================================================================

function DataCard({ data }: { data: DataSummary }) {
  const hasData = data.count > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">
            {data.symbol.replace("/USD", "")}
          </h3>
          <span className="text-xs text-gray-500">
            {TIMEFRAME_LABELS[data.timeframe] || data.timeframe}
          </span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            data.enabled
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {data.enabled ? "Active" : "Disabled"}
        </span>
      </div>

      {hasData ? (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Candles</span>
            <span className="font-medium text-gray-900">
              {formatNumber(data.count)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Range</span>
            <span className="font-medium text-gray-900 text-right">
              {formatDate(data.firstCandle)}
              <br />
              <span className="text-gray-400">→</span>{" "}
              {formatDate(data.lastCandle)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Last Fetch</span>
            <span className="text-gray-600">
              {formatDateTime(data.lastFetch)}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-gray-400 text-sm">
          No data yet
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DATA VIEWER
// ============================================================================

function DataViewer({ summary }: { summary: DataSummary[] | undefined }) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTC/USD");
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("1d");
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");

  // Get available symbols
  const symbols = [...new Set(summary?.map((d) => d.symbol) || [])].sort();

  // Get available timeframes for selected symbol
  const timeframes =
    summary
      ?.filter((d) => d.symbol === selectedSymbol)
      .map((d) => d.timeframe)
      .sort((a, b) => {
        const order = ["1d", "4h", "1h", "15m", "5m", "1m"];
        return order.indexOf(a) - order.indexOf(b);
      }) || [];

  // Fetch data for selected symbol/timeframe
  const { data: ohlcvData, isLoading } = useSWR<OHLCVData[]>(
    selectedSymbol && selectedTimeframe
      ? `ohlcv-${selectedSymbol}-${selectedTimeframe}`
      : null,
    () => api.getHistoricalData(selectedSymbol, selectedTimeframe, 100)
  );

  // Update timeframe when symbol changes
  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
    const available =
      summary?.filter((d) => d.symbol === symbol).map((d) => d.timeframe) || [];
    if (available.length > 0 && !available.includes(selectedTimeframe)) {
      setSelectedTimeframe(available[0]);
    }
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg overflow-hidden">
      <div className="p-6 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-xl font-bold text-gray-900">Price Data</h2>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Symbol Selector */}
            <select
              value={selectedSymbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              className="px-3 py-2 rounded-lg border-2 border-gray-300 bg-white text-gray-900 font-medium"
            >
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s.replace("/USD", "")}
                </option>
              ))}
            </select>

            {/* Timeframe Selector */}
            <div className="flex rounded-lg border-2 border-gray-300 overflow-hidden">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    selectedTimeframe === tf
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* View Mode Toggle */}
            <div className="flex rounded-lg border-2 border-gray-300 overflow-hidden">
              <button
                onClick={() => setViewMode("chart")}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  viewMode === "chart"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                Chart
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  viewMode === "table"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                Table
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : viewMode === "chart" ? (
          <PriceChart data={ohlcvData || []} />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <DataTable data={ohlcvData || []} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

export function DataPanel() {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  const { data: status, isLoading: statusLoading } = useSWR<IngestionStatus>(
    "ingestion-status",
    api.getIngestionStatus,
    { refreshInterval: 5000 }
  );

  const { data: summary, isLoading: summaryLoading } = useSWR<DataSummary[]>(
    "data-summary",
    api.getDataSummary,
    { refreshInterval: 10000 }
  );

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await api.startIngestion();
      mutate("ingestion-status");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await api.stopIngestion();
      mutate("ingestion-status");
    } finally {
      setIsStopping(false);
    }
  };

  const handleFetchAll = async () => {
    setIsFetching(true);
    try {
      await api.fetchAllData();
      mutate("data-summary");
    } finally {
      setIsFetching(false);
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    setCleanupMessage(null);
    try {
      const result = await api.cleanupDuplicates();
      setCleanupMessage(`Removed ${result.deletedCount} duplicate entries`);
      mutate("data-summary");
    } catch (e) {
      setCleanupMessage("Failed to cleanup duplicates");
    } finally {
      setIsCleaning(false);
    }
  };

  const isLoading = statusLoading || summaryLoading;

  // Group data by symbol
  const groupedData =
    summary?.reduce((acc, item) => {
      if (!acc[item.symbol]) acc[item.symbol] = [];
      acc[item.symbol].push(item);
      return acc;
    }, {} as Record<string, DataSummary[]>) || {};

  // Calculate totals
  const totalCandles = summary?.reduce((sum, d) => sum + d.count, 0) || 0;
  const activeConfigs = summary?.filter((d) => d.enabled).length || 0;
  const totalSymbols = Object.keys(groupedData).length;

  return (
    <div className="space-y-6">
      {/* Data Viewer - Chart/Table */}
      {summary && summary.length > 0 && <DataViewer summary={summary} />}

      {/* Header */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Historical Data
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Market data ingestion and storage
              </p>
            </div>
            <StatusBadge isRunning={status?.isRunning || false} />
          </div>
        </div>

        <div className="p-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {totalSymbols}
              </div>
              <div className="text-sm text-gray-500">Symbols</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {activeConfigs}
              </div>
              <div className="text-sm text-gray-500">Active Feeds</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {formatNumber(totalCandles)}
              </div>
              <div className="text-sm text-gray-500">Total Candles</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {status?.queueLength || 0}
              </div>
              <div className="text-sm text-gray-500">In Queue</div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-3">
            {status?.isRunning ? (
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isStopping ? "Stopping..." : "Stop Ingestion"}
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={isStarting}
                className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isStarting ? "Starting..." : "Start Ingestion"}
              </button>
            )}

            <button
              onClick={handleFetchAll}
              disabled={isFetching}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isFetching ? "Fetching..." : "Fetch All Now"}
            </button>

            <button
              onClick={handleCleanup}
              disabled={isCleaning}
              className="px-4 py-2 rounded-lg bg-gray-600 text-white font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {isCleaning ? "Cleaning..." : "Remove Duplicates"}
            </button>
          </div>

          {cleanupMessage && (
            <p className="text-sm text-green-600 mt-2">{cleanupMessage}</p>
          )}
        </div>
      </div>

      {/* Data Grid by Symbol */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedData).map(([symbol, items]) => (
            <div key={symbol}>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                {symbol}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {items
                  .sort((a, b) => {
                    const order = ["1d", "4h", "1h", "15m", "5m", "1m"];
                    return (
                      order.indexOf(a.timeframe) - order.indexOf(b.timeframe)
                    );
                  })
                  .map((item) => (
                    <DataCard
                      key={`${item.symbol}-${item.timeframe}`}
                      data={item}
                    />
                  ))}
              </div>
            </div>
          ))}

          {Object.keys(groupedData).length === 0 && (
            <div className="text-center py-16 text-gray-400">
              No data ingestion configured yet. Start the ingestion service to
              begin collecting data.
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <h3 className="font-semibold text-blue-900 mb-2">
          📊 About Data Ingestion
        </h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>
            The data ingestion service automatically fetches and stores
            historical OHLCV (Open, High, Low, Close, Volume) data from Kraken
            for multiple cryptocurrencies and timeframes.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Daily (1d):</strong> Kept forever for long-term
              backtesting
            </li>
            <li>
              <strong>Hourly (1h):</strong> 90 days retention for medium-term
              analysis
            </li>
            <li>
              <strong>5-minute (5m):</strong> 7 days retention for fine-grained
              analysis
            </li>
          </ul>
          <p className="mt-2">
            Data is fetched respecting Kraken's rate limits (2 second delay
            between requests).
          </p>
        </div>
      </div>
    </div>
  );
}
