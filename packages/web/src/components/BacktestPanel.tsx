import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api } from "../api";
import type { StrategyConfig } from "../types";

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(decimals);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ============================================================================
// STRATEGY SELECTOR
// ============================================================================

const CATEGORY_STYLES: Record<string, string> = {
  conservative: "bg-blue-100 text-blue-800 border border-blue-300",
  moderate: "bg-purple-100 text-purple-800 border border-purple-300",
  aggressive: "bg-orange-100 text-orange-800 border border-orange-300",
  experimental: "bg-pink-100 text-pink-800 border border-pink-300",
};

function StrategyOption({
  strategy,
  isSelected,
  onSelect,
}: {
  strategy: StrategyConfig;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
        isSelected
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20"
          : "border-gray-200 hover:border-gray-300 bg-white"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`font-semibold ${
            isSelected ? "text-blue-900" : "text-gray-900"
          }`}
        >
          {strategy.name}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            CATEGORY_STYLES[strategy.category]
          }`}
        >
          {strategy.category}
        </span>
      </div>
      <p
        className={`text-sm line-clamp-2 ${
          isSelected ? "text-blue-700" : "text-gray-500"
        }`}
      >
        {strategy.description}
      </p>
    </button>
  );
}

// ============================================================================
// MINI CHART
// ============================================================================

function MiniChart({
  data,
  height = 80,
}: {
  data: { timestamp: string; value: number }[];
  height?: number;
}) {
  if (!data || data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d.value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  const isPositive = values[values.length - 1] >= values[0];

  return (
    <svg
      width="100%"
      height={height}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop
            offset="0%"
            stopColor={isPositive ? "#10b981" : "#ef4444"}
            stopOpacity="0.15"
          />
          <stop
            offset="100%"
            stopColor={isPositive ? "#10b981" : "#ef4444"}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${points} 100,100`} fill="url(#chartGradient)" />
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? "#10b981" : "#ef4444"}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ============================================================================
// BACKTEST CONFIGURATION
// ============================================================================

function BacktestConfig({ onRun }: { onRun: () => void }) {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialCapital, setInitialCapital] = useState(1000);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("hodl");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: strategies } = useSWR(
    "backtest-strategies",
    api.getBacktestStrategies
  );

  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);

    setEndDate(end.toISOString().split("T")[0]);
    setStartDate(start.toISOString().split("T")[0]);
  }, []);

  const selectedStrategy = strategies?.find((s) => s.id === selectedStrategyId);

  const handleRun = async () => {
    setError(null);
    setIsRunning(true);

    try {
      await api.runBacktest({
        name: `${selectedStrategy?.name || "Backtest"} - ${symbol}`,
        symbol,
        startDate,
        endDate,
        initialCapital,
        strategyId: selectedStrategyId,
      });

      mutate("backtest-list");
      onRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run backtest");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg">
      <div className="p-6 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
        <h2 className="text-xl font-bold text-gray-900">New Backtest</h2>
        <p className="text-sm text-gray-600 mt-1">
          Test a strategy against historical data
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Configuration Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Asset
            </label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-medium"
            >
              <option value="BTC/USDT">Bitcoin</option>
              <option value="ETH/USDT">Ethereum</option>
              <option value="SOL/USDT">Solana</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Start
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              End
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Capital
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                $
              </span>
              <input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
                min={100}
                className="w-full pl-7 pr-3 py-2.5 rounded-lg border-2 border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Strategy Selection */}
        <div>
          <label className="block text-base font-semibold text-gray-800 mb-3">
            Select Strategy
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {strategies?.map((s) => (
              <StrategyOption
                key={s.id}
                strategy={s}
                isSelected={selectedStrategyId === s.id}
                onSelect={() => setSelectedStrategyId(s.id)}
              />
            ))}
          </div>
        </div>

        {/* Run Button */}
        <div className="flex items-center gap-4 pt-4">
          <button
            onClick={handleRun}
            disabled={
              isRunning || !startDate || !endDate || !selectedStrategyId
            }
            className="px-8 py-3 rounded-lg bg-blue-600 text-white font-semibold text-base hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors shadow-md"
          >
            {isRunning ? "Running..." : "Run Backtest"}
          </button>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BACKTEST LIST
// ============================================================================

function BacktestList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: backtests, isLoading } = useSWR("backtest-list", () =>
    api.listBacktests(20)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-surface-300 border-t-surface-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!backtests || backtests.length === 0) {
    return (
      <div className="text-center py-16 text-surface-400">
        No backtests yet. Run one above to get started.
      </div>
    );
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Delete this backtest?")) {
      await api.deleteBacktest(id);
      mutate("backtest-list");
    }
  };

  return (
    <div className="divide-y divide-surface-100">
      {backtests.map((bt) => (
        <div
          key={bt.id}
          onClick={() => bt.status === "completed" && onSelect(bt.id)}
          className={`px-6 py-4 flex items-center justify-between transition-colors ${
            bt.status === "completed"
              ? "cursor-pointer hover:bg-surface-50"
              : "opacity-50"
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h4 className="font-medium text-surface-900 truncate">
                {bt.name}
              </h4>
              {bt.status === "running" && (
                <span className="text-xs text-surface-500">{bt.progress}%</span>
              )}
              {bt.status === "failed" && (
                <span className="text-xs text-danger">Failed</span>
              )}
            </div>
            <p className="text-sm text-surface-500 mt-0.5">
              {bt.symbol} · {formatDate(bt.startDate)} →{" "}
              {formatDate(bt.endDate)}
            </p>
          </div>

          <div className="flex items-center gap-6">
            {bt.status === "completed" && (
              <>
                <div className="text-right">
                  <div
                    className={`text-lg font-semibold tabular-nums ${
                      (bt.totalReturn || 0) >= 0
                        ? "text-success"
                        : "text-danger"
                    }`}
                  >
                    {formatPercent(bt.totalReturn)}
                  </div>
                  <div className="text-xs text-surface-400">
                    vs HODL:{" "}
                    <span
                      className={
                        (bt.outperformance || 0) >= 0
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      {formatPercent(bt.outperformance)}
                    </span>
                  </div>
                </div>

                <div className="text-right hidden md:block">
                  <div className="text-sm text-surface-600">
                    {bt.totalTrades} trades
                  </div>
                  <div className="text-xs text-surface-400">
                    {formatNumber(bt.winRate, 0)}% win rate
                  </div>
                </div>
              </>
            )}

            <button
              onClick={(e) => handleDelete(e, bt.id)}
              className="p-2 text-surface-300 hover:text-danger transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// BACKTEST DETAIL VIEW
// ============================================================================

function BacktestDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading, error } = useSWR(`backtest-${id}`, () =>
    api.getBacktest(id)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-surface-300 border-t-surface-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-danger">
        Failed to load backtest
      </div>
    );
  }

  const { backtest, trades, snapshots } = data;
  const buys = trades.filter((t) => t.action === "buy");
  const sells = trades.filter((t) => t.action === "sell");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-sm text-surface-500 hover:text-surface-700 mb-2 flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-semibold text-surface-900">
            {backtest.name}
          </h1>
          <p className="text-surface-500 mt-1">
            {backtest.symbol} · {formatDate(backtest.startDate)} →{" "}
            {formatDate(backtest.endDate)}
          </p>
        </div>

        <div className="text-right">
          <div
            className={`text-3xl font-bold tabular-nums ${
              (backtest.totalReturn || 0) >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {formatPercent(backtest.totalReturn)}
          </div>
          <div className="text-sm text-surface-500">
            {formatUsd(backtest.finalCapital)}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-surface-200 p-4">
          <div className="text-sm text-surface-500">Initial</div>
          <div className="text-xl font-semibold text-surface-900 mt-1">
            {formatUsd(backtest.initialCapital)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-4">
          <div className="text-sm text-surface-500">Final</div>
          <div className="text-xl font-semibold text-surface-900 mt-1">
            {formatUsd(backtest.finalCapital)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-4">
          <div className="text-sm text-surface-500">Max Drawdown</div>
          <div className="text-xl font-semibold text-danger mt-1">
            -{formatNumber(backtest.maxDrawdown, 1)}%
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-4">
          <div className="text-sm text-surface-500">vs Buy & Hold</div>
          <div
            className={`text-xl font-semibold mt-1 ${
              (backtest.outperformance || 0) >= 0
                ? "text-success"
                : "text-danger"
            }`}
          >
            {formatPercent(backtest.outperformance)}
          </div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="bg-white rounded-xl border border-surface-200 p-6">
        <h3 className="text-sm font-medium text-surface-700 mb-4">
          Portfolio Value
        </h3>
        <MiniChart
          data={snapshots.map((s) => ({
            timestamp: s.timestamp,
            value: s.portfolioValue,
          }))}
          height={160}
        />
        <div className="flex justify-between text-xs text-surface-400 mt-2">
          <span>{formatDate(backtest.startDate)}</span>
          <span>{formatDate(backtest.endDate)}</span>
        </div>
      </div>

      {/* Trade Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-200 p-6">
          <h3 className="text-sm font-medium text-surface-700 mb-4">
            Trade Statistics
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Total Trades</span>
              <span className="font-medium">{backtest.totalTrades}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Buy Orders</span>
              <span className="font-medium text-success">{buys.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Sell Orders</span>
              <span className="font-medium text-warning-dark">
                {sells.length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Win Rate</span>
              <span className="font-medium">
                {formatNumber(backtest.winRate, 1)}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Sharpe Ratio</span>
              <span className="font-medium">
                {formatNumber(backtest.sharpeRatio, 2)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-6">
          <h3 className="text-sm font-medium text-surface-700 mb-4">
            Strategy
          </h3>
          <div className="space-y-3">
            {backtest.riskProfile && (
              <div className="flex justify-between text-sm">
                <span className="text-surface-500">Type</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    CATEGORY_STYLES[backtest.riskProfile] ||
                    "bg-surface-100 text-surface-600"
                  }`}
                >
                  {backtest.riskProfile}
                </span>
              </div>
            )}
            {Object.entries(backtest.strategyParams || {})
              .slice(0, 6)
              .map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-surface-500">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span className="font-mono text-xs">
                    {typeof value === "number"
                      ? key.toLowerCase().includes("percent")
                        ? `${value}%`
                        : value
                      : String(value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Trade History */}
      <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-100">
          <h3 className="text-sm font-medium text-surface-700">
            Trade History
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50 text-surface-500 text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-6 font-medium">Date</th>
                <th className="text-left py-3 px-6 font-medium">Action</th>
                <th className="text-right py-3 px-6 font-medium">Price</th>
                <th className="text-right py-3 px-6 font-medium">Amount</th>
                <th className="text-right py-3 px-6 font-medium">Value</th>
                <th className="text-right py-3 px-6 font-medium">P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {trades.slice(0, 30).map((trade) => (
                <tr key={trade.id} className="hover:bg-surface-50">
                  <td className="py-3 px-6 text-surface-600">
                    {formatDate(trade.timestamp)}
                  </td>
                  <td className="py-3 px-6">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        trade.action === "buy"
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning-dark"
                      }`}
                    >
                      {trade.action}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-right font-mono">
                    ${formatNumber(trade.price, 0)}
                  </td>
                  <td className="py-3 px-6 text-right font-mono text-surface-500">
                    {formatNumber(trade.amount, 6)}
                  </td>
                  <td className="py-3 px-6 text-right font-mono">
                    ${formatNumber(trade.valueUsdt, 2)}
                  </td>
                  <td className="py-3 px-6 text-right font-mono">
                    {trade.action === "sell" && trade.profitUsdt !== null ? (
                      <span
                        className={
                          trade.profitUsdt >= 0 ? "text-success" : "text-danger"
                        }
                      >
                        {trade.profitUsdt >= 0 ? "+" : ""}$
                        {formatNumber(trade.profitUsdt, 2)}
                      </span>
                    ) : (
                      <span className="text-surface-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {trades.length > 30 && (
            <div className="text-center text-surface-400 text-sm py-4 border-t border-surface-100">
              Showing 30 of {trades.length} trades
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BacktestPanel() {
  const [selectedBacktest, setSelectedBacktest] = useState<string | null>(null);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {selectedBacktest ? (
        <BacktestDetail
          id={selectedBacktest}
          onBack={() => setSelectedBacktest(null)}
        />
      ) : (
        <>
          <BacktestConfig onRun={() => {}} />

          <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-100">
              <h2 className="font-semibold text-surface-900">Past Backtests</h2>
            </div>
            <BacktestList onSelect={setSelectedBacktest} />
          </div>
        </>
      )}
    </div>
  );
}
