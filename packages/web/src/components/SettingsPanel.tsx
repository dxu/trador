import { useState } from 'react';
import useSWR from 'swr';
import { api } from '../api';
import type { Strategy, RiskProfile } from '../types';
import { 
  Save, 
  RefreshCw, 
  AlertTriangle,
  Info,
  Turtle,
  Scale,
  Rocket,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

interface SettingsPanelProps {
  onUpdate: () => void;
}

const RISK_ICONS: Record<RiskProfile, React.ReactNode> = {
  conservative: <Turtle className="w-5 h-5" />,
  moderate: <Scale className="w-5 h-5" />,
  aggressive: <Rocket className="w-5 h-5" />,
};

const RISK_COLORS: Record<RiskProfile, { bg: string; border: string; text: string }> = {
  conservative: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  moderate: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400' },
  aggressive: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
};

const RISK_DESCRIPTIONS: Record<RiskProfile, string> = {
  conservative: 'Patient approach. Waits for deeper dips, holds for bigger gains. Best for long-term wealth building.',
  moderate: 'Balanced approach. Standard thresholds, regular DCA. Good all-around strategy.',
  aggressive: 'Active approach. Buys smaller dips, takes profits earlier. More trades, faster compounding.',
};

export function SettingsPanel({ onUpdate }: SettingsPanelProps) {
  const { data: strategies, mutate } = useSWR('strategies', api.getStrategies);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleToggle = async (strategy: Strategy) => {
    try {
      await api.toggleStrategy(strategy.id, !strategy.enabled);
      mutate();
      onUpdate();
    } catch (error) {
      console.error('Toggle failed:', error);
    }
  };

  const handleSave = async () => {
    if (!editingStrategy) return;
    
    setIsSaving(true);
    setSaveMessage(null);
    
    try {
      await api.updateStrategy(editingStrategy.id, editingStrategy);
      mutate();
      onUpdate();
      setEditingStrategy(null);
      setSaveMessage({ type: 'success', text: 'Strategy saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage({ type: 'error', text: 'Failed to save strategy.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!strategies) {
    return (
      <div className="card p-8 text-center text-midnight-400">
        <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" />
        <p>Loading strategies...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-stagger">
      {/* Strategy Explanation */}
      <div className="card p-5 bg-indigo-500/5 border-indigo-500/20">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-indigo-400">Multi-Strategy Portfolio</h3>
            <p className="text-sm text-midnight-300 mt-2">
              Your capital is split across three risk profiles. Each strategy has its own thresholds 
              and operates independently. This diversification helps capture both quick gains and big moves.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded flex items-center gap-1">
                <Turtle className="w-3 h-3" /> Conservative — Patient, big moves
              </span>
              <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded flex items-center gap-1">
                <Scale className="w-3 h-3" /> Moderate — Balanced
              </span>
              <span className="text-xs px-2 py-1 bg-orange-500/20 text-orange-400 rounded flex items-center gap-1">
                <Rocket className="w-3 h-3" /> Aggressive — Quick profits
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Strategy Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {strategies.map((strategy) => (
          <StrategySettingsCard
            key={strategy.id}
            strategy={strategy}
            isEditing={editingStrategy?.id === strategy.id}
            editingData={editingStrategy?.id === strategy.id ? editingStrategy : null}
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

      {/* Save Message */}
      {saveMessage && (
        <div className={`card p-4 ${
          saveMessage.type === 'success' ? 'border-volt-500/30 bg-volt-500/5' : 'border-red-500/30 bg-red-500/5'
        }`}>
          <p className={`text-sm font-medium ${saveMessage.type === 'success' ? 'text-volt-400' : 'text-red-400'}`}>
            {saveMessage.text}
          </p>
        </div>
      )}

      {/* Warning */}
      <div className="card p-4 border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-400">Important Notes</h3>
            <ul className="text-sm text-midnight-300 mt-2 space-y-1 list-disc list-inside">
              <li>Allocation % should total 100% across enabled strategies.</li>
              <li>Changes apply to future trades only. Open positions use original settings.</li>
              <li>The bot runs in TEST MODE by default. Set EXCHANGE_TEST_MODE=false for live trading.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StrategySettingsCardProps {
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

function StrategySettingsCard({
  strategy,
  isEditing,
  editingData,
  onEdit,
  onCancel,
  onChange,
  onToggle,
  onSave,
  isSaving,
}: StrategySettingsCardProps) {
  const colors = RISK_COLORS[strategy.riskProfile];
  const icon = RISK_ICONS[strategy.riskProfile];
  const data = editingData || strategy;

  return (
    <div className={`card p-6 ${colors.bg} border ${colors.border} ${!strategy.enabled && !isEditing ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={colors.text}>{icon}</span>
          <h3 className="font-semibold text-lg">{strategy.name}</h3>
        </div>
        <button
          onClick={onToggle}
          className={`p-1 rounded transition-colors ${strategy.enabled ? 'text-volt-400' : 'text-midnight-500'}`}
        >
          {strategy.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
        </button>
      </div>

      <p className="text-xs text-midnight-400 mb-4">{RISK_DESCRIPTIONS[strategy.riskProfile]}</p>

      {isEditing ? (
        /* Edit Mode */
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-midnight-400 mb-1">Allocation %</label>
            <input
              type="number"
              value={data.allocationPercent}
              onChange={(e) => onChange('allocationPercent', parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-midnight-900/50 border border-midnight-700 rounded-lg text-sm font-mono"
              min="0"
              max="100"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-midnight-400 mb-1">DCA Amount ($)</label>
              <input
                type="number"
                value={data.dcaAmountUsdt}
                onChange={(e) => onChange('dcaAmountUsdt', parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-midnight-900/50 border border-midnight-700 rounded-lg text-sm font-mono"
                min="10"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-midnight-400 mb-1">Frequency (hrs)</label>
              <input
                type="number"
                value={data.dcaFrequencyHours}
                onChange={(e) => onChange('dcaFrequencyHours', parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-midnight-900/50 border border-midnight-700 rounded-lg text-sm font-mono"
                min="1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-midnight-400 mb-1">Min Profit %</label>
              <input
                type="number"
                value={data.minProfitToSell}
                onChange={(e) => onChange('minProfitToSell', parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-midnight-900/50 border border-midnight-700 rounded-lg text-sm font-mono"
                min="1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-midnight-400 mb-1">Sell %</label>
              <input
                type="number"
                value={data.sellPercentage}
                onChange={(e) => onChange('sellPercentage', parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-midnight-900/50 border border-midnight-700 rounded-lg text-sm font-mono"
                min="5"
                max="50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-midnight-400 mb-1">Max Position ($)</label>
            <input
              type="number"
              value={data.maxPositionUsdt}
              onChange={(e) => onChange('maxPositionUsdt', parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-midnight-900/50 border border-midnight-700 rounded-lg text-sm font-mono"
              min="100"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 btn-ghost text-sm py-2"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-1"
            >
              <Save className="w-3 h-3" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        /* View Mode */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-2 bg-midnight-900/30 rounded-lg">
              <div className="text-xs text-midnight-500">Allocation</div>
              <div className="font-mono">{strategy.allocationPercent}%</div>
            </div>
            <div className="p-2 bg-midnight-900/30 rounded-lg">
              <div className="text-xs text-midnight-500">Max Position</div>
              <div className="font-mono">${strategy.maxPositionUsdt}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-2 bg-midnight-900/30 rounded-lg">
              <div className="text-xs text-midnight-500">DCA</div>
              <div className="font-mono">${strategy.dcaAmountUsdt} / {strategy.dcaFrequencyHours}h</div>
            </div>
            <div className="p-2 bg-midnight-900/30 rounded-lg">
              <div className="text-xs text-midnight-500">Take Profit</div>
              <div className="font-mono">{strategy.minProfitToSell}% → sell {strategy.sellPercentage}%</div>
            </div>
          </div>

          <div className="text-xs text-midnight-500 pt-2 border-t border-midnight-700/50">
            Thresholds: Fear @ {strategy.fearThreshold}% • Greed RSI @ {strategy.greedRsiThreshold}
          </div>

          <button
            onClick={onEdit}
            className="w-full btn-ghost text-sm py-2 mt-2"
          >
            Edit Settings
          </button>
        </div>
      )}
    </div>
  );
}
