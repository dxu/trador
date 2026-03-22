import { useState, useEffect } from "react";
import { api, getAuthToken } from "./api";
import { DataPanel } from "./components/DataPanel";
import BacktestPanel from "./components/BacktestPanel";
import { Login } from "./components/Login";

type Tab = "data" | "backtest";

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("data");

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

  const handleLogin = () => setIsAuthenticated(true);

  const handleLogout = async () => {
    await api.logout();
    setIsAuthenticated(false);
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-300">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-base-300">
      <div className="navbar bg-base-100 border-b border-base-content/5 sticky top-0 z-50 px-4">
        <div className="flex-1 gap-4">
          <span className="font-bold tracking-tight text-base-content/90">
            trador
          </span>
          <div className="flex gap-1">
            <button
              className={`btn btn-sm btn-ghost ${activeTab === "data" ? "btn-active" : "opacity-50"}`}
              onClick={() => setActiveTab("data")}
            >
              Data
            </button>
            <button
              className={`btn btn-sm btn-ghost ${activeTab === "backtest" ? "btn-active" : "opacity-50"}`}
              onClick={() => setActiveTab("backtest")}
            >
              Backtest
            </button>
          </div>
        </div>
        <div className="flex-none">
          <button onClick={handleLogout} className="btn btn-ghost btn-xs text-base-content/50">
            Logout
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "data" && <DataPanel />}
        {activeTab === "backtest" && <BacktestPanel />}
      </main>
    </div>
  );
}
