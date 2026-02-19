import { useState, useEffect } from "react";
import useSWR from "swr";
import { api } from "../api";
import type { Strategy, RiskProfile } from "../types";

// Available coins to trade
const AVAILABLE_COINS = [
  { symbol: "BTC/USD", name: "Bitcoin", icon: "₿" },
  { symbol: "ETH/USD", name: "Ethereum", icon: "Ξ" },
  { symbol: "SOL/USD", name: "Solana", icon: "◎" },
  { symbol: "XRP/USD", name: "Ripple", icon: "✕" },
  { symbol: "DOGE/USD", name: "Dogecoin", icon: "Ð" },
  { symbol: "ADA/USD", name: "Cardano", icon: "₳" },
  { symbol: "AVAX/USD", name: "Avalanche", icon: "▲" },
  { symbol: "LINK/USD", name: "Chainlink", icon: "⬡" },
  { symbol: "DOT/USD", name: "Polkadot", icon: "●" },
  { symbol: "ATOM/USD", name: "Cosmos", icon: "⚛" },
];

const RISK_CONFIG: Record<
  RiskProfile,
  { color: string; bg: string; border: string; icon: string }
> = {
  conservative: {
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "🐢",
  },
  moderate: {
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    icon: "⚖️",
  },
  aggressive: {
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    icon: "🚀",
  },
};

interface PortfolioPanelProps {
  onUpdate: () => void;
}

export function PortfolioPanel({ onUpdate }: PortfolioPanelProps) {
  const { data: strategies, mutate: mutateStrategies } = useSWR(
    "strategies",
    api.getStrategies
  );
  const { data: balanceData, mutate: mutateBalance } = useSWR(
    "balance",
    api.getBalance
  );

  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Initialize allocations from strategies
  useEffect(() => {
    if (strategies) {
      const allocs: Record<string, number> = {};
      strategies.forEach((s) => {
        allocs[s.id] = s.allocationPercent;
      });
      setAllocations(allocs);
    }
  }, [strategies]);

  const totalAllocation = Object.values(allocations).reduce(
    (sum, val) => sum + val,
    0
  );

  const handleAllocationChange = (strategyId: string, value: number) => {
    setAllocations((prev) => ({
      ...prev,
      [strategyId]: Math.max(0, Math.min(100, value)),
    }));
  };

  const handleSaveAllocations = async () => {
    if (totalAllocation !== 100) {
      setMessage({
        type: "error",
        text: `Allocations must total 100% (currently ${totalAllocation}%)`,
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      for (const [strategyId, allocation] of Object.entries(allocations)) {
        await api.updateStrategy(strategyId, { allocationPercent: allocation });
      }
      mutateStrategies();
      onUpdate();
      setMessage({ type: "success", text: "Allocations saved!" });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: "error", text: "Failed to save allocations" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!strategies) {
    return (
      <div className="bg-white rounded-xl border border-surface-200 py-12 text-center text-surface-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance Overview */}
      <div className="bg-white rounded-xl border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-surface-900">
              Portfolio Balance
            </h2>
            <p className="text-sm text-surface-500">
              Connected to {balanceData?.exchange || "Exchange"}
            </p>
          </div>
          <button
            onClick={() => mutateBalance()}
            className="px-4 py-2 text-sm border border-surface-200 rounded-lg hover:bg-surface-50"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-surface-50 rounded-xl">
            <div className="text-sm text-surface-500 mb-1">Total Balance</div>
            <div className="text-2xl font-bold text-surface-900">
              ${balanceData?.total?.toLocaleString() ?? "—"}
            </div>
          </div>
          <div className="p-4 bg-surface-50 rounded-xl">
            <div className="text-sm text-surface-500 mb-1">Available Cash</div>
            <div className="text-2xl font-bold text-surface-900">
              ${balanceData?.available?.toLocaleString() ?? "—"}
            </div>
          </div>
          <div className="p-4 bg-surface-50 rounded-xl">
            <div className="text-sm text-surface-500 mb-1">In Positions</div>
            <div className="text-2xl font-bold text-surface-900">
              ${balanceData?.inPositions?.toLocaleString() ?? "—"}
            </div>
          </div>
        </div>

        {balanceData?.isTestMode && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            🧪 Running in test mode - showing simulated balance
          </div>
        )}
      </div>

      {/* Strategy Allocation */}
      <div className="bg-white rounded-xl border border-surface-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-surface-900">
              Strategy Allocation
            </h2>
            <p className="text-sm text-surface-500">
              Distribute your capital across risk profiles
            </p>
          </div>
          <div
            className={`text-sm font-medium ${
              totalAllocation === 100 ? "text-emerald-600" : "text-red-500"
            }`}
          >
            Total: {totalAllocation}%
          </div>
        </div>

        {/* Allocation Bar */}
        <div className="h-8 rounded-lg overflow-hidden flex mb-6">
          {strategies.map((strategy) => {
            const config = RISK_CONFIG[strategy.riskProfile];
            const width = allocations[strategy.id] || 0;
            return (
              <div
                key={strategy.id}
                className={`${config.bg} ${config.border} border-r-2 last:border-r-0 flex items-center justify-center transition-all`}
                style={{ width: `${width}%` }}
              >
                {width > 10 && (
                  <span className={`text-xs font-medium ${config.color}`}>
                    {width}%
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Allocation Sliders */}
        <div className="space-y-4">
          {strategies.map((strategy) => {
            const config = RISK_CONFIG[strategy.riskProfile];
            return (
              <div
                key={strategy.id}
                className={`p-4 rounded-xl ${config.bg} ${config.border} border`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{config.icon}</span>
                    <div>
                      <div className={`font-medium ${config.color}`}>
                        {strategy.name}
                      </div>
                      <div className="text-xs text-surface-500">
                        {strategy.riskProfile.charAt(0).toUpperCase() +
                          strategy.riskProfile.slice(1)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={allocations[strategy.id] || 0}
                      onChange={(e) =>
                        handleAllocationChange(
                          strategy.id,
                          parseInt(e.target.value)
                        )
                      }
                      className="w-32 accent-current"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={allocations[strategy.id] || 0}
                      onChange={(e) =>
                        handleAllocationChange(
                          strategy.id,
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="w-16 px-2 py-1 text-center border border-surface-200 rounded-lg text-sm"
                    />
                    <span className="text-sm text-surface-500">%</span>
                  </div>
                </div>

                {/* Allocated Amount */}
                {balanceData?.total && (
                  <div className="text-sm text-surface-600">
                    ≈ $
                    {(
                      (balanceData.total * (allocations[strategy.id] || 0)) /
                      100
                    ).toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                    allocated
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleSaveAllocations}
          disabled={isSaving || totalAllocation !== 100}
          className="mt-4 w-full py-3 bg-surface-900 text-white rounded-lg font-medium hover:bg-surface-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving..." : "Save Allocations"}
        </button>

        {message && (
          <div
            className={`mt-4 p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* DCA Settings */}
      <div className="bg-white rounded-xl border border-surface-200 p-6">
        <h2 className="text-xl font-semibold text-surface-900 mb-2">
          DCA Settings
        </h2>
        <p className="text-sm text-surface-500 mb-6">
          Configure automatic buying for each strategy
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {strategies.map((strategy) => (
            <DCASettingsCard
              key={strategy.id}
              strategy={strategy}
              onUpdate={() => {
                mutateStrategies();
                onUpdate();
              }}
            />
          ))}
        </div>
      </div>

      {/* Coin Selection */}
      <div className="bg-white rounded-xl border border-surface-200 p-6">
        <h2 className="text-xl font-semibold text-surface-900 mb-2">
          Coins to Trade
        </h2>
        <p className="text-sm text-surface-500 mb-6">
          Select which coins each strategy should trade
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {strategies.map((strategy) => (
            <CoinSelectionCard
              key={strategy.id}
              strategy={strategy}
              onUpdate={() => {
                mutateStrategies();
                onUpdate();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// DCA Settings Card Component
function DCASettingsCard({
  strategy,
  onUpdate,
}: {
  strategy: Strategy;
  onUpdate: () => void;
}) {
  const config = RISK_CONFIG[strategy.riskProfile];
  const [dcaAmount, setDcaAmount] = useState(strategy.dcaAmountUsdt);
  const [dcaFrequency, setDcaFrequency] = useState(strategy.dcaFrequencyHours);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateStrategy(strategy.id, {
        dcaAmountUsdt: dcaAmount,
        dcaFrequencyHours: dcaFrequency,
      });
      onUpdate();
    } catch (e) {
      console.error("Failed to save DCA settings:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    dcaAmount !== strategy.dcaAmountUsdt ||
    dcaFrequency !== strategy.dcaFrequencyHours;

  return (
    <div className={`p-4 rounded-xl ${config.bg} ${config.border} border`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{config.icon}</span>
        <span className={`font-medium ${config.color}`}>{strategy.name}</span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1">
            Amount per buy
          </label>
          <div className="flex items-center gap-2">
            <span className="text-surface-400">$</span>
            <input
              type="number"
              value={dcaAmount}
              onChange={(e) => setDcaAmount(parseFloat(e.target.value) || 0)}
              className="flex-1 px-3 py-2 border border-surface-200 rounded-lg text-sm"
              min="10"
              step="10"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1">
            Buy every
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={dcaFrequency}
              onChange={(e) => setDcaFrequency(parseInt(e.target.value) || 1)}
              className="flex-1 px-3 py-2 border border-surface-200 rounded-lg text-sm"
              min="1"
            />
            <span className="text-surface-400">hours</span>
          </div>
        </div>

        <div className="text-xs text-surface-500">
          ≈ ${((dcaAmount * 24) / dcaFrequency).toFixed(0)}/day • $
          {((dcaAmount * 24 * 30) / dcaFrequency).toFixed(0)}/month
        </div>

        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-2 bg-surface-900 text-white rounded-lg text-sm font-medium hover:bg-surface-800 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}

// Coin Selection Card Component
function CoinSelectionCard({
  strategy,
  onUpdate,
}: {
  strategy: Strategy;
  onUpdate: () => void;
}) {
  const config = RISK_CONFIG[strategy.riskProfile];
  // For now, we'll use a simple approach - all strategies trade the same coin (from botConfig)
  // In future, this could be expanded to per-strategy coin selection

  const [selectedCoins, setSelectedCoins] = useState<string[]>(["BTC/USD"]);
  const [isSaving, setIsSaving] = useState(false);

  const toggleCoin = (symbol: string) => {
    setSelectedCoins((prev) =>
      prev.includes(symbol)
        ? prev.filter((c) => c !== symbol)
        : [...prev, symbol]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // TODO: Implement per-strategy coin selection in backend
      // For now, just show the UI
      await new Promise((resolve) => setTimeout(resolve, 500));
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`p-4 rounded-xl ${config.bg} ${config.border} border`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{config.icon}</span>
        <span className={`font-medium ${config.color}`}>{strategy.name}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {AVAILABLE_COINS.slice(0, 6).map((coin) => {
          const isSelected = selectedCoins.includes(coin.symbol);
          return (
            <button
              key={coin.symbol}
              onClick={() => toggleCoin(coin.symbol)}
              className={`p-2 rounded-lg text-xs font-medium transition-all ${
                isSelected
                  ? "bg-white border-2 border-surface-900 text-surface-900"
                  : "bg-white/50 border border-surface-200 text-surface-500 hover:border-surface-300"
              }`}
            >
              <span className="mr-1">{coin.icon}</span>
              {coin.symbol.split("/")[0]}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-surface-500">
        {selectedCoins.length} coin{selectedCoins.length !== 1 ? "s" : ""}{" "}
        selected
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="mt-3 w-full py-2 bg-surface-900 text-white rounded-lg text-sm font-medium hover:bg-surface-800 disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Save Coins"}
      </button>
    </div>
  );
}
