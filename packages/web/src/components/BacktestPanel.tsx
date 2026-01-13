import { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '../api';
import type { Backtest, BacktestResult, StrategyConfig } from '../types';
import { 
  Play, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  Target,
  Percent,
  DollarSign,
  BarChart3,
  Calendar,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from 'lucide-react';

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '-';
  return value.toFixed(decimals);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MetricCard({ label, value, subValue, icon: Icon, trend }: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColors = {
    up: 'text-volt-400',
    down: 'text-red-400',
    neutral: 'text-midnight-400',
  };

  return (
    <div className="bg-midnight-900/50 rounded-xl p-4 border border-midnight-800">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-midnight-400" />
        <span className="text-sm text-midnight-400">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${trend ? trendColors[trend] : 'text-white'}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-sm text-midnight-500 mt-1">{subValue}</div>
      )}
    </div>
  );
}

function MiniChart({ data, height = 60 }: { data: { timestamp: string; value: number }[]; height?: number }) {
  if (!data || data.length < 2) return null;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((d.value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const isPositive = values[values.length - 1] >= values[0];

  return (
    <svg width="100%" height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`chartGradient-${isPositive ? 'up' : 'down'}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isPositive ? '#a3e635' : '#f87171'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? '#a3e635' : '#f87171'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,100 ${points} 100,100`}
        fill={`url(#chartGradient-${isPositive ? 'up' : 'down'})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? '#a3e635' : '#f87171'}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ============================================================================
// STRATEGY CARD
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  conservative: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  moderate: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  aggressive: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  experimental: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
};

const CATEGORY_ICONS: Record<string, string> = {
  conservative: '🐢',
  moderate: '⚖️',
  aggressive: '🚀',
  experimental: '🧪',
};

function StrategyCard({ 
  strategy, 
  isSelected, 
  onSelect 
}: { 
  strategy: StrategyConfig; 
  isSelected: boolean; 
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        isSelected 
          ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20' 
          : 'border-midnight-700 bg-midnight-900/50 hover:border-midnight-600'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{CATEGORY_ICONS[strategy.category]}</span>
          <h4 className="font-medium text-white">{strategy.name}</h4>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[strategy.category]}`}>
          {strategy.category}
        </span>
      </div>
      <p className="text-sm text-midnight-400 line-clamp-2">{strategy.description}</p>
    </div>
  );
}

// ============================================================================
// BACKTEST CONFIGURATION
// ============================================================================

function BacktestConfig({ onRun }: { onRun: () => void }) {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [initialCapital, setInitialCapital] = useState(1000);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('fear-greed-moderate');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllStrategies, setShowAllStrategies] = useState(false);

  // Load strategies
  const { data: strategies } = useSWR('backtest-strategies', api.getBacktestStrategies);

  // Set default dates
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2); // 2 years back
    
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, []);

  const selectedStrategy = strategies?.find(s => s.id === selectedStrategyId);

  const handleRun = async () => {
    setError(null);
    setIsRunning(true);

    try {
      await api.runBacktest({
        name: name || `${selectedStrategy?.name || 'Backtest'} - ${new Date().toISOString().split('T')[0]}`,
        symbol,
        startDate,
        endDate,
        initialCapital,
        strategyId: selectedStrategyId,
      });
      
      mutate('backtest-list');
      onRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run backtest');
    } finally {
      setIsRunning(false);
    }
  };

  // Group strategies by category for display
  const strategyGroups = strategies?.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, StrategyConfig[]>);

  // Featured strategies (shown by default)
  const featuredIds = ['hodl', 'dca', 'fear-greed-moderate', 'fear-greed-aggressive'];
  const featuredStrategies = strategies?.filter(s => featuredIds.includes(s.id));

  return (
    <div className="bg-midnight-900/30 rounded-2xl border border-midnight-800 p-6">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-indigo-400" />
        New Backtest
      </h3>

      {/* Basic Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* Name */}
        <div>
          <label className="block text-sm text-midnight-400 mb-2">Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Backtest"
            className="w-full bg-midnight-900 border border-midnight-700 rounded-lg px-3 py-2 text-white placeholder-midnight-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Symbol */}
        <div>
          <label className="block text-sm text-midnight-400 mb-2">Symbol</label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full bg-midnight-900 border border-midnight-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="BTC/USDT">BTC/USDT</option>
            <option value="ETH/USDT">ETH/USDT</option>
            <option value="SOL/USDT">SOL/USDT</option>
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-sm text-midnight-400 mb-2">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-midnight-900 border border-midnight-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-sm text-midnight-400 mb-2">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-midnight-900 border border-midnight-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Initial Capital */}
        <div>
          <label className="block text-sm text-midnight-400 mb-2">Capital (USDT)</label>
          <input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(Number(e.target.value))}
            min={100}
            className="w-full bg-midnight-900 border border-midnight-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Strategy Selection */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm text-midnight-400 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Select Strategy
          </label>
          <button
            onClick={() => setShowAllStrategies(!showAllStrategies)}
            className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            {showAllStrategies ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show All ({strategies?.length || 0})
              </>
            )}
          </button>
        </div>

        {showAllStrategies ? (
          // Show all strategies grouped by category
          <div className="space-y-4">
            {strategyGroups && Object.entries(strategyGroups).map(([category, strats]) => (
              <div key={category}>
                <h4 className="text-xs uppercase tracking-wider text-midnight-500 mb-2">
                  {CATEGORY_ICONS[category]} {category}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {strats.map(s => (
                    <StrategyCard
                      key={s.id}
                      strategy={s}
                      isSelected={selectedStrategyId === s.id}
                      onSelect={() => setSelectedStrategyId(s.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Show featured strategies
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {featuredStrategies?.map(s => (
              <StrategyCard
                key={s.id}
                strategy={s}
                isSelected={selectedStrategyId === s.id}
                onSelect={() => setSelectedStrategyId(s.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Selected Strategy Info */}
      {selectedStrategy && (
        <div className="mb-6 p-4 rounded-xl bg-midnight-900/50 border border-midnight-700">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">{CATEGORY_ICONS[selectedStrategy.category]}</span>
            <div>
              <h4 className="font-semibold text-white">{selectedStrategy.name}</h4>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[selectedStrategy.category]}`}>
                {selectedStrategy.category}
              </span>
            </div>
          </div>
          <p className="text-sm text-midnight-400">{selectedStrategy.description}</p>
          
          {/* Show key params */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {selectedStrategy.params.maxPositionPercent !== undefined && (
              <div>
                <span className="text-midnight-500">Max Position:</span>
                <span className="ml-1 text-white">{selectedStrategy.params.maxPositionPercent}%</span>
              </div>
            )}
            {selectedStrategy.params.minPositionPercent !== undefined && (
              <div>
                <span className="text-midnight-500">Min Position:</span>
                <span className="ml-1 text-white">{selectedStrategy.params.minPositionPercent}%</span>
              </div>
            )}
            {selectedStrategy.params.minProfitToSell !== undefined && (
              <div>
                <span className="text-midnight-500">Min Profit:</span>
                <span className="ml-1 text-white">{selectedStrategy.params.minProfitToSell}%</span>
              </div>
            )}
            {selectedStrategy.params.sellAmountPercent !== undefined && (
              <div>
                <span className="text-midnight-500">Sell Amount:</span>
                <span className="ml-1 text-white">{selectedStrategy.params.sellAmountPercent}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Run Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleRun}
          disabled={isRunning || !startDate || !endDate || !selectedStrategyId}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-midnight-700 disabled:cursor-not-allowed text-white font-medium rounded-lg px-6 py-3 transition-colors"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running Backtest...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Backtest
            </>
          )}
        </button>
        
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// BACKTEST LIST
// ============================================================================

function BacktestList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: backtests, isLoading } = useSWR('backtest-list', () => api.listBacktests(20));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-midnight-400" />
      </div>
    );
  }

  if (!backtests || backtests.length === 0) {
    return (
      <div className="text-center py-12 text-midnight-400">
        No backtests yet. Run your first backtest above!
      </div>
    );
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this backtest?')) {
      await api.deleteBacktest(id);
      mutate('backtest-list');
    }
  };

  return (
    <div className="space-y-3">
      {backtests.map((bt) => (
        <div
          key={bt.id}
          onClick={() => bt.status === 'completed' && onSelect(bt.id)}
          className={`bg-midnight-900/30 rounded-xl border border-midnight-800 p-4 transition-all ${
            bt.status === 'completed' ? 'cursor-pointer hover:border-indigo-500/50 hover:bg-midnight-900/50' : 'opacity-60'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {bt.status === 'completed' && <CheckCircle className="w-5 h-5 text-volt-400" />}
              {bt.status === 'running' && <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />}
              {bt.status === 'failed' && <AlertCircle className="w-5 h-5 text-red-400" />}
              {bt.status === 'pending' && <Clock className="w-5 h-5 text-midnight-400" />}
              <div>
                <h4 className="font-medium">{bt.name}</h4>
                <div className="text-sm text-midnight-400">
                  {bt.symbol} • {formatDate(bt.startDate)} → {formatDate(bt.endDate)}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {bt.status === 'completed' && bt.totalReturn !== null && (
                <div className={`text-lg font-bold ${bt.totalReturn >= 0 ? 'text-volt-400' : 'text-red-400'}`}>
                  {formatPercent(bt.totalReturn)}
                </div>
              )}
              {bt.status === 'running' && (
                <div className="text-sm text-midnight-400">{bt.progress}%</div>
              )}
              <button
                onClick={(e) => handleDelete(e, bt.id)}
                className="p-2 text-midnight-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {bt.status === 'completed' && (
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-midnight-500">Win Rate</span>
                <span className="ml-2 text-white">{formatNumber(bt.winRate, 1)}%</span>
              </div>
              <div>
                <span className="text-midnight-500">Max DD</span>
                <span className="ml-2 text-red-400">-{formatNumber(bt.maxDrawdown, 1)}%</span>
              </div>
              <div>
                <span className="text-midnight-500">Trades</span>
                <span className="ml-2 text-white">{bt.totalTrades}</span>
              </div>
              <div>
                <span className="text-midnight-500">vs HODL</span>
                <span className={`ml-2 ${(bt.outperformance || 0) >= 0 ? 'text-volt-400' : 'text-red-400'}`}>
                  {formatPercent(bt.outperformance)}
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// BACKTEST DETAIL VIEW
// ============================================================================

function BacktestDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading, error } = useSWR(`backtest-${id}`, () => api.getBacktest(id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-midnight-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12 text-red-400">
        Failed to load backtest
      </div>
    );
  }

  const { backtest, trades, snapshots } = data;
  const buys = trades.filter(t => t.action === 'buy');
  const sells = trades.filter(t => t.action === 'sell');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-sm text-midnight-400 hover:text-white mb-2 flex items-center gap-1"
          >
            ← Back to list
          </button>
          <h2 className="text-xl font-bold">{backtest.name}</h2>
          <div className="text-midnight-400">
            {backtest.symbol} • {formatDate(backtest.startDate)} → {formatDate(backtest.endDate)}
          </div>
        </div>
        <div className={`text-3xl font-bold ${(backtest.totalReturn || 0) >= 0 ? 'text-volt-400' : 'text-red-400'}`}>
          {formatPercent(backtest.totalReturn)}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <MetricCard
          label="Initial Capital"
          value={`$${backtest.initialCapital.toLocaleString()}`}
          icon={DollarSign}
        />
        <MetricCard
          label="Final Capital"
          value={`$${formatNumber(backtest.finalCapital, 0)}`}
          subValue={formatUsd(backtest.totalReturnUsdt)}
          icon={DollarSign}
          trend={(backtest.totalReturnUsdt || 0) >= 0 ? 'up' : 'down'}
        />
        <MetricCard
          label="Win Rate"
          value={`${formatNumber(backtest.winRate, 1)}%`}
          subValue={`${backtest.profitableTrades}/${sells.length} trades`}
          icon={Target}
          trend={(backtest.winRate || 0) >= 50 ? 'up' : 'down'}
        />
        <MetricCard
          label="Max Drawdown"
          value={`-${formatNumber(backtest.maxDrawdown, 1)}%`}
          icon={TrendingDown}
          trend="down"
        />
        <MetricCard
          label="Sharpe Ratio"
          value={formatNumber(backtest.sharpeRatio, 2)}
          icon={BarChart3}
          trend={(backtest.sharpeRatio || 0) >= 1 ? 'up' : (backtest.sharpeRatio || 0) < 0 ? 'down' : 'neutral'}
        />
        <MetricCard
          label="vs Buy & Hold"
          value={formatPercent(backtest.outperformance)}
          subValue={`HODL: ${formatPercent(backtest.buyAndHoldReturn)}`}
          icon={(backtest.outperformance || 0) >= 0 ? ArrowUpRight : ArrowDownRight}
          trend={(backtest.outperformance || 0) >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* Equity Curve */}
      <div className="bg-midnight-900/30 rounded-2xl border border-midnight-800 p-6">
        <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
        <div className="h-48">
          <MiniChart
            data={snapshots.map(s => ({ timestamp: s.timestamp, value: s.portfolioValue }))}
            height={192}
          />
        </div>
        <div className="flex justify-between text-sm text-midnight-400 mt-2">
          <span>{formatDate(backtest.startDate)}</span>
          <span>{formatDate(backtest.endDate)}</span>
        </div>
      </div>

      {/* Trade Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trade Summary */}
        <div className="bg-midnight-900/30 rounded-2xl border border-midnight-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Trade Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-midnight-400">Total Trades</span>
              <span className="font-medium">{backtest.totalTrades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-midnight-400">Buy Orders</span>
              <span className="text-volt-400">{buys.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-midnight-400">Sell Orders</span>
              <span className="text-amber-400">{sells.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-midnight-400">Avg Trade Return</span>
              <span className={`${(backtest.avgTradeReturn || 0) >= 0 ? 'text-volt-400' : 'text-red-400'}`}>
                {formatPercent(backtest.avgTradeReturn)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-midnight-400">Avg Win Size</span>
              <span className="text-volt-400">${formatNumber(backtest.avgWinSize, 2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-midnight-400">Avg Loss Size</span>
              <span className="text-red-400">-${formatNumber(backtest.avgLossSize, 2)}</span>
            </div>
          </div>
        </div>

        {/* Strategy Parameters */}
        <div className="bg-midnight-900/30 rounded-2xl border border-midnight-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Strategy Parameters</h3>
          <div className="space-y-3 text-sm">
            {backtest.riskProfile && (
              <div className="flex justify-between">
                <span className="text-midnight-400">Category</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${CATEGORY_COLORS[backtest.riskProfile] || 'bg-midnight-700 text-white'}`}>
                  {CATEGORY_ICONS[backtest.riskProfile] || ''} {backtest.riskProfile}
                </span>
              </div>
            )}
            {Object.entries(backtest.strategyParams || {}).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-midnight-400">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                <span>{typeof value === 'number' ? (key.includes('Percent') ? `${value}%` : value) : String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trade History */}
      <div className="bg-midnight-900/30 rounded-2xl border border-midnight-800 p-6">
        <h3 className="text-lg font-semibold mb-4">Trade History</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-midnight-400 border-b border-midnight-800">
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-left py-2 px-3">Action</th>
                <th className="text-right py-2 px-3">Price</th>
                <th className="text-right py-2 px-3">Amount</th>
                <th className="text-right py-2 px-3">Value</th>
                <th className="text-right py-2 px-3">P&L</th>
                <th className="text-left py-2 px-3">Regime</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 50).map((trade) => (
                <tr key={trade.id} className="border-b border-midnight-800/50 hover:bg-midnight-800/30">
                  <td className="py-2 px-3 text-midnight-400">
                    {new Date(trade.timestamp).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      trade.action === 'buy' ? 'bg-volt-400/20 text-volt-400' : 'bg-amber-400/20 text-amber-400'
                    }`}>
                      {trade.action.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">${formatNumber(trade.price, 2)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(trade.amount, 6)}</td>
                  <td className="py-2 px-3 text-right">${formatNumber(trade.valueUsdt, 2)}</td>
                  <td className="py-2 px-3 text-right">
                    {trade.action === 'sell' && trade.profitUsdt !== null ? (
                      <span className={trade.profitUsdt >= 0 ? 'text-volt-400' : 'text-red-400'}>
                        {formatUsd(trade.profitUsdt)}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-xs ${
                      trade.regime?.includes('fear') ? 'text-volt-400' :
                      trade.regime?.includes('greed') ? 'text-amber-400' : 'text-midnight-400'
                    }`}>
                      {trade.regime?.replace('_', ' ') || '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {trades.length > 50 && (
            <div className="text-center text-midnight-400 text-sm py-4">
              Showing first 50 of {trades.length} trades
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BacktestPanel() {
  const [selectedBacktest, setSelectedBacktest] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {selectedBacktest ? (
        <BacktestDetail 
          id={selectedBacktest} 
          onBack={() => setSelectedBacktest(null)} 
        />
      ) : (
        <>
          {/* Configuration */}
          <BacktestConfig onRun={() => {}} />

          {/* Past Backtests */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-midnight-400" />
              Past Backtests
            </h3>
            <BacktestList onSelect={setSelectedBacktest} />
          </div>
        </>
      )}
    </div>
  );
}
