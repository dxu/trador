import { useState } from "react";
import useSWR from "swr";
import { api } from "../api";
import type { Strategy, RiskProfile } from "../types";

interface SettingsPanelProps {
  onUpdate: () => void;
}

const RISK_STYLES: Record<RiskProfile, string> = {
  conservative: "bg-blue-50 text-blue-700 border-blue-200",
  moderate: "bg-purple-50 text-purple-700 border-purple-200",
  aggressive: "bg-orange-50 text-orange-700 border-orange-200",
};

const RISK_DESCRIPTIONS: Record<RiskProfile, string> = {
  conservative:
    "Patient approach. Waits for deeper dips, holds for bigger gains.",
  moderate: "Balanced approach. Standard thresholds, regular DCA.",
  aggressive: "Active approach. Buys smaller dips, takes profits earlier.",
};

export function SettingsPanel({ onUpdate }: SettingsPanelProps) {
  const { data: strategies, mutate } = useSWR("strategies", api.getStrategies);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleToggle = async (strategy: Strategy) => {
    try {
      await api.toggleStrategy(strategy.id, !strategy.enabled);
      mutate();
      onUpdate();
    } catch (error) {
      console.error("Toggle failed:", error);
    }
  };

  const handleSave = async () => {
    if (!editingStrategy) return;

    setIsSaving(true);
    setMessage(null);

    try {
      await api.updateStrategy(editingStrategy.id, editingStrategy);
      mutate();
      onUpdate();
      setEditingStrategy(null);
      setMessage({ type: "success", text: "Settings saved" });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: "error", text: "Failed to save" });
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
      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800">Multi-Strategy Portfolio</h3>
        <p className="text-sm text-blue-600 mt-1">
          Your capital is split across three risk profiles. Each strategy
          operates independently.
        </p>
      </div>

      {/* Strategies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {strategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            isEditing={editingStrategy?.id === strategy.id}
            editingData={
              editingStrategy?.id === strategy.id ? editingStrategy : null
            }
            onEdit={() => setEditingStrategy({ ...strategy })}
            onCancel={() => setEditingStrategy(null)}
            onChange={(field, value) => {
              if (editingStrategy) {
                setEditingStrategy({ ...editingStrategy, [field]: value });
              }
            }}
            onToggle={() => handleToggle(strategy)}
            onSave={handleSave}
            isSaving={isSaving}
          />
        ))}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded-xl p-4 ${
            message.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="font-medium text-amber-800">Notes</h3>
        <ul className="text-sm text-amber-700 mt-1 space-y-1 list-disc list-inside">
          <li>Allocation should total 100% across enabled strategies</li>
          <li>Changes apply to future trades only</li>
          <li>Running in TEST MODE by default</li>
        </ul>
      </div>
    </div>
  );
}

interface StrategyCardProps {
  strategy: Strategy;
  isEditing: boolean;
  editingData: Strategy | null;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (field: keyof Strategy, value: number | string | boolean) => void;
  onToggle: () => void;
  onSave: () => void;
  isSaving: boolean;
}

function StrategyCard({
  strategy,
  isEditing,
  editingData,
  onEdit,
  onCancel,
  onChange,
  onToggle,
  onSave,
  isSaving,
}: StrategyCardProps) {
  const data = editingData || strategy;
  const style = RISK_STYLES[strategy.riskProfile];

  return (
    <div
      className={`bg-white rounded-xl border border-surface-200 p-6 ${
        !strategy.enabled && !isEditing ? "opacity-50" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${style}`}>
            {strategy.riskProfile}
          </span>
          <h3 className="font-semibold text-surface-900">{strategy.name}</h3>
        </div>
        <button
          onClick={onToggle}
          className={`relative w-10 h-6 rounded-full transition-colors ${
            strategy.enabled ? "bg-success" : "bg-surface-200"
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${
              strategy.enabled ? "left-5" : "left-1"
            }`}
          />
        </button>
      </div>

      <p className="text-xs text-surface-500 mb-4">
        {RISK_DESCRIPTIONS[strategy.riskProfile]}
      </p>

      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">
              Allocation %
            </label>
            <input
              type="number"
              value={data.allocationPercent}
              onChange={(e) =>
                onChange("allocationPercent", parseFloat(e.target.value))
              }
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
              min="0"
              max="100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">
                DCA Amount
              </label>
              <input
                type="number"
                value={data.dcaAmountUsdt}
                onChange={(e) =>
                  onChange("dcaAmountUsdt", parseFloat(e.target.value))
                }
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
                min="10"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">
                Hours
              </label>
              <input
                type="number"
                value={data.dcaFrequencyHours}
                onChange={(e) =>
                  onChange("dcaFrequencyHours", parseInt(e.target.value))
                }
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
                min="1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">
                Min Profit %
              </label>
              <input
                type="number"
                value={data.minProfitToSell}
                onChange={(e) =>
                  onChange("minProfitToSell", parseFloat(e.target.value))
                }
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
                min="1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">
                Sell %
              </label>
              <input
                type="number"
                value={data.sellPercentage}
                onChange={(e) =>
                  onChange("sellPercentage", parseFloat(e.target.value))
                }
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
                min="5"
                max="50"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2 text-sm border border-surface-200 rounded-lg hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex-1 py-2 text-sm bg-surface-900 text-white rounded-lg hover:bg-surface-800 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 bg-surface-50 rounded-lg">
              <div className="text-xs text-surface-400">Allocation</div>
              <div className="font-medium">{strategy.allocationPercent}%</div>
            </div>
            <div className="p-3 bg-surface-50 rounded-lg">
              <div className="text-xs text-surface-400">Max Position</div>
              <div className="font-medium">${strategy.maxPositionUsdt}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 bg-surface-50 rounded-lg">
              <div className="text-xs text-surface-400">DCA</div>
              <div className="font-medium">
                ${strategy.dcaAmountUsdt} / {strategy.dcaFrequencyHours}h
              </div>
            </div>
            <div className="p-3 bg-surface-50 rounded-lg">
              <div className="text-xs text-surface-400">Take Profit</div>
              <div className="font-medium">{strategy.minProfitToSell}%</div>
            </div>
          </div>

          <button
            onClick={onEdit}
            className="w-full py-2 text-sm border border-surface-200 rounded-lg hover:bg-surface-50 mt-2"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
