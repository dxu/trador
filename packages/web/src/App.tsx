import { useState } from "react";
import useSWR from "swr";
import { api } from "./api";
import { Dashboard } from "./components/Dashboard";
import { TransactionsPanel } from "./components/TransactionsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { LogsPanel } from "./components/LogsPanel";
import { BacktestPanel } from "./components/BacktestPanel";

type Tab = "dashboard" | "backtest" | "transactions" | "logs" | "settings";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("backtest");
  const { data: dashboard, mutate } = useSWR("dashboard", api.getDashboard, {
    refreshInterval: 30000,
  });

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard" },
    { id: "backtest" as const, label: "Backtest" },
    { id: "transactions" as const, label: "Transactions" },
    { id: "logs" as const, label: "Logs" },
    { id: "settings" as const, label: "Settings" },
  ];

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "running":
        return "bg-success";
      case "paused":
        return "bg-warning";
      case "error":
        return "bg-danger";
      default:
        return "bg-surface-400";
    }
  };

  const getRegimeLabel = (regime?: string) => {
    if (!regime) return null;
    const labels: Record<string, { text: string; color: string }> = {
      extreme_fear: {
        text: "Extreme Fear",
        color: "bg-emerald-100 text-emerald-700",
      },
      fear: { text: "Fear", color: "bg-emerald-50 text-emerald-600" },
      neutral: { text: "Neutral", color: "bg-surface-100 text-surface-600" },
      greed: { text: "Greed", color: "bg-orange-50 text-orange-600" },
      extreme_greed: {
        text: "Extreme Greed",
        color: "bg-red-100 text-red-700",
      },
    };
    return labels[regime] || null;
  };

  const regime = getRegimeLabel(dashboard?.market?.regime);

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <header className="bg-white border-b border-surface-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-900 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              </div>
              <span className="font-semibold text-surface-900">Trador</span>
            </div>

            {/* Status */}
            <div className="flex items-center gap-4">
              {regime && (
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${regime.color}`}
                >
                  {regime.text}
                </span>
              )}

              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${getStatusColor(
                    dashboard?.bot.status
                  )}`}
                />
                <span className="text-sm text-surface-600 capitalize">
                  {dashboard?.bot.status || "Loading"}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex gap-6 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-surface-900 text-surface-900"
                    : "border-transparent text-surface-500 hover:text-surface-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {activeTab === "dashboard" && (
          <div className="max-w-6xl mx-auto px-6 py-8">
            <Dashboard dashboard={dashboard} onRefresh={mutate} />
          </div>
        )}
        {activeTab === "backtest" && <BacktestPanel />}
        {activeTab === "transactions" && (
          <div className="max-w-6xl mx-auto px-6 py-8">
            <TransactionsPanel />
          </div>
        )}
        {activeTab === "logs" && (
          <div className="max-w-6xl mx-auto px-6 py-8">
            <LogsPanel />
          </div>
        )}
        {activeTab === "settings" && (
          <div className="max-w-6xl mx-auto px-6 py-8">
            <SettingsPanel onUpdate={mutate} />
          </div>
        )}
      </main>
    </div>
  );
}
