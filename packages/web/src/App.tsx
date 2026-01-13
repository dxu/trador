import { useState } from "react";
import useSWR from "swr";
import { api } from "./api";
import { Dashboard } from "./components/Dashboard";
import { TransactionsPanel } from "./components/TransactionsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { LogsPanel } from "./components/LogsPanel";
import { BacktestPanel } from "./components/BacktestPanel";
import {
  Activity,
  LayoutDashboard,
  Settings,
  TrendingUp,
  ScrollText,
  FlaskConical,
} from "lucide-react";

type Tab = "dashboard" | "backtest" | "transactions" | "logs" | "settings";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const { data: dashboard, mutate } = useSWR("dashboard", api.getDashboard, {
    refreshInterval: 30000, // Refresh every 30 seconds (patient strategy)
  });

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { id: "backtest" as const, label: "Backtest", icon: FlaskConical },
    { id: "transactions" as const, label: "Transactions", icon: Activity },
    { id: "logs" as const, label: "Activity Log", icon: ScrollText },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "running":
        return "bg-volt-400";
      case "paused":
        return "bg-amber-400";
      case "error":
        return "bg-red-400";
      default:
        return "bg-midnight-500";
    }
  };

  const getRegimeColor = (regime?: string) => {
    switch (regime) {
      case "extreme_fear":
        return "text-volt-400 bg-volt-400/10";
      case "fear":
        return "text-emerald-400 bg-emerald-400/10";
      case "neutral":
        return "text-midnight-300 bg-midnight-700";
      case "greed":
        return "text-amber-400 bg-amber-400/10";
      case "extreme_greed":
        return "text-red-400 bg-red-400/10";
      default:
        return "text-midnight-400 bg-midnight-800";
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-midnight-950/80 border-b border-midnight-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-volt-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-midnight-950" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Trador</h1>
                <p className="text-xs text-midnight-400">
                  Patient Regime-Based Trading
                </p>
              </div>
            </div>

            {/* Status Indicators */}
            <div className="flex items-center gap-3">
              {/* Market Regime Badge */}
              {dashboard?.market && (
                <div
                  className={`px-3 py-1.5 rounded-full text-sm font-medium ${getRegimeColor(
                    dashboard.market.regime
                  )}`}
                >
                  {dashboard.market.regime.replace("_", " ").toUpperCase()}
                </div>
              )}

              {/* Bot Status */}
              <div className="flex items-center gap-2 px-4 py-2 bg-midnight-900/50 rounded-full border border-midnight-800">
                <div
                  className={`w-2 h-2 rounded-full ${getStatusColor(
                    dashboard?.bot.status
                  )} ${
                    dashboard?.bot.status === "running" ? "animate-pulse" : ""
                  }`}
                  style={
                    dashboard?.bot.status === "running"
                      ? { boxShadow: "0 0 8px rgb(163 230 53 / 0.6)" }
                      : {}
                  }
                />
                <span className="text-sm font-medium capitalize">
                  {dashboard?.bot.status || "Loading..."}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex gap-1 mt-4 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors
                  ${
                    activeTab === tab.id
                      ? "bg-midnight-900/50 text-white border-b-2 border-indigo-500"
                      : "text-midnight-400 hover:text-white hover:bg-midnight-900/30"
                  }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "dashboard" && (
          <Dashboard dashboard={dashboard} onRefresh={mutate} />
        )}
        {activeTab === "backtest" && <BacktestPanel />}
        {activeTab === "transactions" && <TransactionsPanel />}
        {activeTab === "logs" && <LogsPanel />}
        {activeTab === "settings" && <SettingsPanel onUpdate={mutate} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-midnight-800/50 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 text-center text-sm text-midnight-500">
          <p>Trador v2.0 • Buy Fear, Sell Greed • Not financial advice</p>
        </div>
      </footer>
    </div>
  );
}
