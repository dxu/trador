import { useState, useEffect } from "react";
import useSWR from "swr";
import { api, getAuthToken, clearAuthToken } from "./api";
import { Dashboard } from "./components/Dashboard";
import { TransactionsPanel } from "./components/TransactionsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { LogsPanel } from "./components/LogsPanel";
import { BacktestPanel } from "./components/BacktestPanel";
import { DataPanel } from "./components/DataPanel";
import { Login } from "./components/Login";

type Tab =
  | "dashboard"
  | "backtest"
  | "data"
  | "transactions"
  | "logs"
  | "settings";

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const { data: dashboard, mutate } = useSWR(
    isAuthenticated ? "dashboard" : null, // Only fetch when authenticated
    api.getDashboard,
    { refreshInterval: 30000 }
  );

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      const isValid = await api.checkAuth();
      setIsAuthenticated(isValid);
    };

    checkAuth();
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    await api.logout();
    setIsAuthenticated(false);
  };

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard" },
    { id: "backtest" as const, label: "Backtest" },
    { id: "data" as const, label: "Data" },
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

              <button
                onClick={handleLogout}
                className="ml-2 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Logout"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
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
        {activeTab === "data" && (
          <div className="max-w-6xl mx-auto px-6 py-8">
            <DataPanel />
          </div>
        )}
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
