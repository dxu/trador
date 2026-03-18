import { useState } from "react";
import { api, setAuthToken } from "../api";

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await api.login(password);
      if (result.success && result.token) {
        setAuthToken(result.token);
        onLogin();
      } else {
        setError(result.error || "Login failed");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-300 flex items-center justify-center px-4">
      <div className="w-full max-w-xs">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold tracking-tight">trador</h1>
          <p className="text-sm text-base-content/40 mt-1">Market data platform</p>
        </div>

        <form onSubmit={handleSubmit} className="card bg-base-100">
          <div className="card-body p-5 gap-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="input input-bordered input-sm w-full"
              autoFocus
              required
            />

            {error && (
              <p className="text-error text-xs">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || !password}
              className="btn btn-primary btn-sm w-full"
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Sign in"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
