import { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { api } from "../api";
import type {
  DashboardData,
  Transaction,
  StrategyWithPosition,
  RiskProfile,
} from "../types";

interface DashboardProps {
  dashboard: DashboardData | undefined;
  onRefresh: () => void;
}

const RISK_STYLES: Record<RiskProfile, string> = {
  conservative: "bg-blue-50 text-blue-700",
  moderate: "bg-purple-50 text-purple-700",
  aggressive: "bg-orange-50 text-orange-700",
};

export function Dashboard({ dashboard, onRefresh }: DashboardProps) {
  const [isControlling, setIsControlling] = useState(false);

  const { data: performanceHistory } = useSWR(
    "performance-history",
    () => api.getPerformanceHistory({ limit: 50 }),
    { refreshInterval: 60000 }
  );

  const handleBotControl = async (action: "start" | "stop" | "pause") => {
    setIsControlling(true);
    try {
      if (action === "start") await api.startBot();
      else if (action === "stop") await api.stopBot();
      else await api.pauseBot();
      onRefresh();
    } finally {
      setIsControlling(false);
    }
  };

  const handleRunCycle = async () => {
    setIsControlling(true);
    try {
      await api.runCycle();
      onRefresh();
    } finally {
      setIsControlling(false);
    }
  };

  const chartData =
    performanceHistory?.map((p) => ({
      time: format(new Date(p.snapshotAt), "MMM d"),
      value: p.totalValueUsdt,
      cost: p.totalCostBasisUsdt,
    })) || [];

  const isRunning = dashboard?.bot.status === "running";
  const hasError = dashboard?.bot.status === "error";

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {hasError && dashboard?.bot.config?.lastError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <h3 className="font-medium text-red-800">Bot Error</h3>
              <p className="text-sm text-red-600 mt-1">
                {dashboard.bot.config.lastError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Position Value"
          value={`$${(dashboard?.combined.currentValue || 0).toLocaleString(
            undefined,
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          )}`}
          subtitle={`Cost: $${(dashboard?.combined.totalCostUsdt || 0).toFixed(
            2
          )}`}
        />
        <StatCard
          label="Unrealized P&L"
          value={`${
            (dashboard?.combined.unrealizedPnl || 0) >= 0 ? "+" : ""
          }$${Math.abs(dashboard?.combined.unrealizedPnl || 0).toFixed(2)}`}
          change={dashboard?.combined.unrealizedPnlPercent}
          positive={(dashboard?.combined.unrealizedPnl || 0) >= 0}
        />
        <StatCard
          label="Realized Profit"
          value={`$${(dashboard?.combined.realizedProfitUsdt || 0).toFixed(2)}`}
          subtitle={`${dashboard?.stats.totalSells || 0} sells`}
        />
        <StatCard
          label="Total P&L"
          value={`${
            (dashboard?.combined.totalPnl || 0) >= 0 ? "+" : ""
          }$${Math.abs(dashboard?.combined.totalPnl || 0).toFixed(2)}`}
          positive={(dashboard?.combined.totalPnl || 0) >= 0}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-surface-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-surface-900">Portfolio</h2>
            <button
              onClick={onRefresh}
              className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
            >
              <svg
                className="w-4 h-4 text-surface-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>

          {chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#71717a", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#71717a", fontSize: 12 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e4e4e7",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="#d4d4d8"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    fill="none"
                    name="Cost Basis"
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#valueGrad)"
                    name="Value"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-surface-400">
              <div className="text-center">
                <svg
                  className="w-12 h-12 mx-auto mb-3 text-surface-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <p>No data yet</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border border-surface-200 p-6">
          <h2 className="font-semibold text-surface-900 mb-4">Bot Control</h2>

          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between p-4 bg-surface-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    isRunning
                      ? "bg-success"
                      : hasError
                      ? "bg-danger"
                      : "bg-surface-400"
                  }`}
                />
                <span className="font-medium text-surface-700 capitalize">
                  {dashboard?.bot.status || "Unknown"}
                </span>
              </div>
            </div>

            {/* Price */}
            {dashboard?.market && (
              <div className="p-4 bg-surface-50 rounded-xl">
                <div className="text-sm text-surface-500 mb-1">
                  {dashboard.market.symbol}
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold text-surface-900 tabular-nums">
                    $
                    {dashboard.market.price?.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      dashboard.market.percentFromAth >= -10
                        ? "text-success"
                        : "text-surface-500"
                    }`}
                  >
                    {dashboard.market.percentFromAth.toFixed(0)}% from ATH
                  </span>
                </div>
              </div>
            )}

            {/* Strategies */}
            <div className="p-4 bg-surface-50 rounded-xl">
              <div className="text-sm text-surface-500 mb-2">Strategies</div>
              <div className="flex flex-wrap gap-2">
                {dashboard?.strategies.map((s) => (
                  <span
                    key={s.id}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      s.enabled
                        ? RISK_STYLES[s.riskProfile]
                        : "bg-surface-100 text-surface-400"
                    }`}
                  >
                    {s.riskProfile}
                  </span>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleBotControl("start")}
                disabled={isControlling || isRunning}
                className={`py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  isRunning
                    ? "bg-surface-100 text-surface-400"
                    : "bg-success text-white hover:bg-success-dark"
                }`}
              >
                Start
              </button>
              <button
                onClick={() => handleBotControl("pause")}
                disabled={isControlling || !isRunning}
                className={`py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  !isRunning
                    ? "bg-surface-100 text-surface-400"
                    : "bg-warning text-white hover:bg-warning-dark"
                }`}
              >
                Pause
              </button>
              <button
                onClick={() => handleBotControl("stop")}
                disabled={isControlling}
                className="py-2.5 rounded-lg font-medium text-sm bg-surface-100 text-surface-600 hover:bg-surface-200 transition-colors"
              >
                Stop
              </button>
            </div>

            <button
              onClick={handleRunCycle}
              disabled={isControlling}
              className="w-full py-2.5 rounded-lg font-medium text-sm border border-surface-200 text-surface-600 hover:bg-surface-50 transition-colors"
            >
              {isControlling ? "Running..." : "Run Analysis"}
            </button>
          </div>
        </div>
      </div>

      {/* Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dashboard?.strategies.map((strategy) => (
          <StrategyCard key={strategy.id} strategy={strategy} />
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-100">
            <h2 className="font-semibold text-surface-900">
              Recent Transactions
            </h2>
          </div>
          {dashboard?.recentTransactions &&
          dashboard.recentTransactions.length > 0 ? (
            <div className="divide-y divide-surface-100">
              {dashboard.recentTransactions.slice(0, 5).map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  strategies={dashboard.strategies}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-surface-400">
              No transactions yet
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-100">
            <h2 className="font-semibold text-surface-900">Activity Log</h2>
          </div>
          {dashboard?.recentLogs && dashboard.recentLogs.length > 0 ? (
            <div className="divide-y divide-surface-100 max-h-80 overflow-y-auto">
              {dashboard.recentLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="px-6 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-surface-400 font-mono text-xs">
                      {format(new Date(log.createdAt), "HH:mm")}
                    </span>
                    <span className="text-surface-600">{log.message}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-surface-400">
              No activity yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  change,
  subtitle,
  positive,
}: {
  label: string;
  value: string;
  change?: number;
  subtitle?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-surface-500">{label}</span>
        {change !== undefined && (
          <span
            className={`text-xs font-medium ${
              change >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        )}
      </div>
      <div
        className={`text-xl font-semibold mt-1 tabular-nums ${
          positive !== undefined
            ? positive
              ? "text-success"
              : "text-danger"
            : "text-surface-900"
        }`}
      >
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-surface-400 mt-1">{subtitle}</div>
      )}
    </div>
  );
}

function StrategyCard({ strategy }: { strategy: StrategyWithPosition }) {
  return (
    <div
      className={`bg-white rounded-xl border border-surface-200 p-5 ${
        !strategy.enabled ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              RISK_STYLES[strategy.riskProfile]
            }`}
          >
            {strategy.riskProfile}
          </span>
          <h3 className="font-medium text-surface-900">{strategy.name}</h3>
        </div>
        <span
          className={`text-xs ${
            strategy.enabled ? "text-success" : "text-surface-400"
          }`}
        >
          {strategy.enabled ? "Active" : "Paused"}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-surface-500">Position</span>
          <span className="font-medium tabular-nums">
            ${strategy.position?.totalCostUsdt.toFixed(2) || "0.00"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-surface-500">Value</span>
          <span className="font-medium tabular-nums">
            ${strategy.currentValue.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-surface-500">P&L</span>
          <span
            className={`font-medium tabular-nums ${
              strategy.unrealizedPnl >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {strategy.unrealizedPnl >= 0 ? "+" : ""}$
            {strategy.unrealizedPnl.toFixed(2)}
            <span className="text-xs ml-1">
              ({strategy.unrealizedPnlPercent.toFixed(1)}%)
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function TransactionRow({
  transaction,
  strategies,
}: {
  transaction: Transaction;
  strategies: StrategyWithPosition[];
}) {
  const isBuy = transaction.action === "buy";
  const strategy = strategies.find((s) => s.id === transaction.strategyId);

  return (
    <div className="px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isBuy ? "bg-success/10" : "bg-warning/10"
          }`}
        >
          {isBuy ? (
            <svg
              className="w-4 h-4 text-success"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 text-warning-dark"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          )}
        </div>
        <div>
          <div className="text-sm font-medium text-surface-900">
            {isBuy ? "Buy" : "Sell"} ${transaction.valueUsdt.toFixed(2)}
            {strategy && (
              <span
                className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                  RISK_STYLES[strategy.riskProfile]
                }`}
              >
                {strategy.riskProfile.slice(0, 3)}
              </span>
            )}
          </div>
          <div className="text-xs text-surface-400">
            {format(new Date(transaction.executedAt), "MMM d, HH:mm")}
          </div>
        </div>
      </div>
      {transaction.profitUsdt !== null && (
        <span
          className={`font-medium text-sm tabular-nums ${
            transaction.profitUsdt >= 0 ? "text-success" : "text-danger"
          }`}
        >
          {transaction.profitUsdt >= 0 ? "+" : ""}$
          {transaction.profitUsdt.toFixed(2)}
        </span>
      )}
    </div>
  );
}
