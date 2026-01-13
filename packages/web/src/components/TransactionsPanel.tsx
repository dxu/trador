import { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { api } from "../api";
import type { Transaction, RiskProfile } from "../types";

type FilterAction = "all" | "buy" | "sell";

const RISK_STYLES: Record<RiskProfile, string> = {
  conservative: "bg-blue-50 text-blue-700",
  moderate: "bg-purple-50 text-purple-700",
  aggressive: "bg-orange-50 text-orange-700",
};

export function TransactionsPanel() {
  const [actionFilter, setActionFilter] = useState<FilterAction>("all");

  const { data: transactions, isLoading } = useSWR(
    ["transactions", actionFilter],
    () =>
      api.getTransactions({
        limit: 100,
        action: actionFilter === "all" ? undefined : actionFilter,
      }),
    { refreshInterval: 30000 }
  );

  const { data: stats } = useSWR("transaction-stats", api.getTransactionStats, {
    refreshInterval: 60000,
  });

  const filters: { id: FilterAction; label: string }[] = [
    { id: "all", label: "All" },
    { id: "buy", label: "Buys" },
    { id: "sell", label: "Sells" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Invested"
          value={`$${(stats?.totalInvested || 0).toFixed(2)}`}
          subtitle={`${stats?.totalBuys || 0} buys`}
        />
        <StatCard
          label="Realized Profit"
          value={`${(stats?.realizedProfit || 0) >= 0 ? "+" : ""}$${(
            stats?.realizedProfit || 0
          ).toFixed(2)}`}
          subtitle={`${stats?.totalSells || 0} sells`}
          positive={(stats?.realizedProfit || 0) >= 0}
        />
        <StatCard
          label="Win Rate"
          value={`${(stats?.winRate || 0).toFixed(1)}%`}
          subtitle="Profitable sells"
        />
        <StatCard
          label="Total Fees"
          value={`$${(stats?.totalFees || 0).toFixed(2)}`}
          subtitle="Exchange fees"
        />
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-100 flex items-center justify-between">
          <h2 className="font-semibold text-surface-900">
            Transaction History
          </h2>

          {/* Filters */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1">
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActionFilter(filter.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  actionFilter === filter.id
                    ? "bg-white text-surface-900 shadow-sm"
                    : "text-surface-500 hover:text-surface-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-surface-400">Loading...</div>
          ) : transactions && transactions.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 text-surface-500 text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-6 font-medium">Date</th>
                  <th className="text-left py-3 px-6 font-medium">Action</th>
                  <th className="text-right py-3 px-6 font-medium">Amount</th>
                  <th className="text-right py-3 px-6 font-medium">Price</th>
                  <th className="text-right py-3 px-6 font-medium">Value</th>
                  <th className="text-right py-3 px-6 font-medium">Profit</th>
                  <th className="text-left py-3 px-6 font-medium">Regime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {transactions.map((tx) => (
                  <TransactionRow key={tx.id} transaction={tx} />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center text-surface-400">
              No transactions found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  positive,
}: {
  label: string;
  value: string;
  subtitle?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4">
      <div className="text-sm text-surface-500">{label}</div>
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

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isBuy = transaction.action === "buy";

  return (
    <tr className="hover:bg-surface-50">
      <td className="py-3 px-6">
        <div className="text-surface-900">
          {format(new Date(transaction.executedAt), "MMM d, yyyy")}
        </div>
        <div className="text-xs text-surface-400">
          {format(new Date(transaction.executedAt), "HH:mm")}
        </div>
      </td>
      <td className="py-3 px-6">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            isBuy
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning-dark"
          }`}
        >
          {transaction.action}
        </span>
      </td>
      <td className="py-3 px-6 text-right font-mono text-surface-600">
        {transaction.amount.toFixed(6)}
      </td>
      <td className="py-3 px-6 text-right font-mono">
        ${transaction.price.toFixed(0)}
      </td>
      <td className="py-3 px-6 text-right font-mono">
        ${transaction.valueUsdt.toFixed(2)}
      </td>
      <td className="py-3 px-6 text-right font-mono">
        {transaction.profitUsdt !== null ? (
          <span
            className={
              transaction.profitUsdt >= 0 ? "text-success" : "text-danger"
            }
          >
            {transaction.profitUsdt >= 0 ? "+" : ""}$
            {transaction.profitUsdt.toFixed(2)}
          </span>
        ) : (
          <span className="text-surface-300">—</span>
        )}
      </td>
      <td className="py-3 px-6">
        {transaction.regime ? (
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              transaction.regime.includes("fear")
                ? "bg-emerald-50 text-emerald-700"
                : transaction.regime.includes("greed")
                ? "bg-orange-50 text-orange-700"
                : "bg-surface-100 text-surface-600"
            }`}
          >
            {transaction.regime.replace("_", " ")}
          </span>
        ) : (
          <span className="text-surface-300">—</span>
        )}
      </td>
    </tr>
  );
}
