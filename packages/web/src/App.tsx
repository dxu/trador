import { useState, useEffect } from "react";
import { api, getAuthToken } from "./api";
import { DataPanel } from "./components/DataPanel";
import { Login } from "./components/Login";

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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
        <div className="flex-1 gap-2">
          <span className="font-bold tracking-tight text-base-content/90">
            trador
          </span>
        </div>
        <div className="flex-none">
          <button onClick={handleLogout} className="btn btn-ghost btn-xs text-base-content/50">
            Logout
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <DataPanel />
      </main>
    </div>
  );
}
