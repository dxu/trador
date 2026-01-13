import { useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import {
  Play,
  Pause,
  Square,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Zap,
  RefreshCw,
  AlertTriangle,
  Clock,
  Gauge,
  Turtle,
  Scale,
  Rocket,
} from 'lucide-react';
import { api } from '../api';
import type { DashboardData, Transaction, MarketRegime, StrategyWithPosition, RiskProfile } from '../types';

interface DashboardProps {
  dashboard: DashboardData | undefined;
  onRefresh: () => void;
}

const RISK_ICONS: Record<RiskProfile, React.ReactNode> = {
  conservative: <Turtle className="w-4 h-4" />,
  moderate: <Scale className="w-4 h-4" />,
  aggressive: <Rocket className="w-4 h-4" />,
};

const RISK_COLORS: Record<RiskProfile, { bg: string; border: string; text: string }> = {
  conservative: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  moderate: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400' },
  aggressive: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
};

export function Dashboard({ dashboard, onRefresh }: DashboardProps) {
  const [isControlling, setIsControlling] = useState(false);
  
  const { data: performanceHistory } = useSWR('performance-history', () => api.getPerformanceHistory({ limit: 50 }), {
    refreshInterval: 60000,
  });

  const handleBotControl = async (action: 'start' | 'stop' | 'pause') => {
    setIsControlling(true);
    try {
      if (action === 'start') await api.startBot();
      else if (action === 'stop') await api.stopBot();
      else await api.pauseBot();
      onRefresh();
    } catch (error) {
      console.error('Bot control failed:', error);
    } finally {
      setIsControlling(false);
    }
  };

  const handleRunCycle = async () => {
    setIsControlling(true);
    try {
      await api.runCycle();
      onRefresh();
    } catch (error) {
      console.error('Manual cycle failed:', error);
    } finally {
      setIsControlling(false);
    }
  };

  const chartData = performanceHistory?.map((p) => ({
    time: format(new Date(p.snapshotAt), 'MMM d HH:mm'),
    value: p.totalValueUsdt,
    cost: p.totalCostBasisUsdt,
  })) || [];

  const isRunning = dashboard?.bot.status === 'running';
  const isPaused = dashboard?.bot.status === 'paused';
  const hasError = dashboard?.bot.status === 'error';

  return (
    <div className="space-y-6 animate-stagger">
      {/* Error Banner */}
      {hasError && dashboard?.bot.config?.lastError && (
        <div className="card p-4 border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-400">Bot Error - Auto Paused</h3>
              <p className="text-sm text-midnight-300 mt-1">{dashboard.bot.config.lastError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Market Regime Banner */}
      {dashboard?.market && (
        <MarketRegimeBanner market={dashboard.market} />
      )}

      {/* Strategy Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dashboard?.strategies.map((strategy) => (
          <StrategyCard key={strategy.id} strategy={strategy} />
        ))}
      </div>

      {/* Combined Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Total Position"
          value={`$${(dashboard?.combined.currentValue || 0).toFixed(2)}`}
          subtitle={`Cost: $${(dashboard?.combined.totalCostUsdt || 0).toFixed(2)}`}
        />
        <StatCard
          icon={TrendingUp}
          label="Unrealized P&L"
          value={`${(dashboard?.combined.unrealizedPnl || 0) >= 0 ? '+' : ''}$${(dashboard?.combined.unrealizedPnl || 0).toFixed(2)}`}
          change={dashboard?.combined.unrealizedPnlPercent}
          positive={(dashboard?.combined.unrealizedPnl || 0) >= 0}
        />
        <StatCard
          icon={Activity}
          label="Realized Profit"
          value={`$${(dashboard?.combined.realizedProfitUsdt || 0).toFixed(2)}`}
          subtitle={`${dashboard?.stats.totalSells || 0} sells`}
        />
        <StatCard
          icon={Zap}
          label="Total P&L"
          value={`${(dashboard?.combined.totalPnl || 0) >= 0 ? '+' : ''}$${(dashboard?.combined.totalPnl || 0).toFixed(2)}`}
          positive={(dashboard?.combined.totalPnl || 0) >= 0}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Chart */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Combined Portfolio</h2>
            <button onClick={onRefresh} className="p-2 hover:bg-midnight-800 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-midnight-400" />
            </button>
          </div>
          
          {chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#312e81" opacity={0.3} />
                  <XAxis dataKey="time" stroke="#6366f1" tick={{ fill: '#a5b4fc', fontSize: 11 }} />
                  <YAxis stroke="#6366f1" tick={{ fill: '#a5b4fc', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: '#1a1840', border: '1px solid #312e81', borderRadius: '12px' }}
                    labelStyle={{ color: '#a5b4fc' }}
                  />
                  <Area type="monotone" dataKey="cost" stroke="#a3e635" strokeWidth={1} strokeDasharray="4 4" fill="none" name="Cost" />
                  <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#valueGradient)" name="Value" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-midnight-400">
              <div className="text-center">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No data yet. Start the bot to begin tracking.</p>
              </div>
            </div>
          )}
        </div>

        {/* Bot Control */}
        <div className="card p-6 card-glow">
          <h2 className="text-lg font-semibold mb-4">Bot Control</h2>
          
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between p-4 bg-midnight-900/50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  isRunning ? 'bg-volt-400 animate-pulse' : 
                  isPaused ? 'bg-amber-400' : 
                  hasError ? 'bg-red-400' : 'bg-midnight-500'
                }`} style={isRunning ? { boxShadow: '0 0 12px rgb(163 230 53 / 0.6)' } : {}} />
                <span className="font-medium capitalize">{dashboard?.bot.status || 'Unknown'}</span>
              </div>
              <Zap className={`w-5 h-5 ${isRunning ? 'text-volt-400' : 'text-midnight-500'}`} />
            </div>

            {/* Price */}
            {dashboard?.market && (
              <div className="p-4 bg-midnight-900/50 rounded-xl">
                <div className="text-sm text-midnight-400 mb-1">{dashboard.market.symbol}</div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-mono font-bold">
                    ${dashboard.market.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className={`text-sm font-medium ${
                    dashboard.market.percentFromAth >= -10 ? 'text-volt-400' : 'text-amber-400'
                  }`}>
                    {dashboard.market.percentFromAth.toFixed(1)}% ATH
                  </span>
                </div>
              </div>
            )}

            {/* Active Strategies */}
            <div className="p-4 bg-midnight-900/50 rounded-xl">
              <div className="text-sm text-midnight-400 mb-2">Active Strategies</div>
              <div className="flex gap-2">
                {dashboard?.strategies.map((s) => (
                  <span key={s.id} className={`px-2 py-1 rounded text-xs font-medium ${
                    s.enabled 
                      ? RISK_COLORS[s.riskProfile].bg + ' ' + RISK_COLORS[s.riskProfile].text
                      : 'bg-midnight-800 text-midnight-500'
                  }`}>
                    {s.enabled ? '●' : '○'} {s.riskProfile}
                  </span>
                ))}
              </div>
            </div>

            {/* Control Buttons */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                onClick={() => handleBotControl('start')}
                disabled={isControlling || isRunning}
                className={`flex items-center justify-center py-3 rounded-xl font-medium transition-all ${
                  isRunning ? 'bg-midnight-800 text-midnight-500 cursor-not-allowed' 
                  : 'bg-volt-500 text-midnight-950 hover:bg-volt-400 shadow-lg shadow-volt-500/20'
                }`}
              >
                <Play className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleBotControl('pause')}
                disabled={isControlling || !isRunning}
                className={`flex items-center justify-center py-3 rounded-xl font-medium transition-all ${
                  !isRunning ? 'bg-midnight-800 text-midnight-500 cursor-not-allowed' 
                  : 'bg-amber-500 text-midnight-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20'
                }`}
              >
                <Pause className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleBotControl('stop')}
                disabled={isControlling || dashboard?.bot.status === 'stopped'}
                className={`flex items-center justify-center py-3 rounded-xl font-medium transition-all ${
                  dashboard?.bot.status === 'stopped' ? 'bg-midnight-800 text-midnight-500 cursor-not-allowed' 
                  : 'bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/20'
                }`}
              >
                <Square className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleRunCycle}
              disabled={isControlling}
              className="w-full btn-ghost flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isControlling ? 'animate-spin' : ''}`} />
              Run Analysis Cycle
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
          {dashboard?.recentTransactions && dashboard.recentTransactions.length > 0 ? (
            <div className="space-y-3">
              {dashboard.recentTransactions.slice(0, 5).map((tx) => (
                <TransactionRow key={tx.id} transaction={tx} strategies={dashboard.strategies} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-midnight-400">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No transactions yet</p>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Activity Log</h2>
          {dashboard?.recentLogs && dashboard.recentLogs.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {dashboard.recentLogs.slice(0, 10).map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-midnight-400">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No activity yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StrategyCard({ strategy }: { strategy: StrategyWithPosition }) {
  const colors = RISK_COLORS[strategy.riskProfile];
  const icon = RISK_ICONS[strategy.riskProfile];
  
  return (
    <div className={`card p-5 ${colors.bg} border ${colors.border} ${!strategy.enabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={colors.text}>{icon}</span>
          <h3 className="font-semibold">{strategy.name}</h3>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${strategy.enabled ? 'bg-volt-500/20 text-volt-400' : 'bg-midnight-700 text-midnight-400'}`}>
          {strategy.enabled ? 'Active' : 'Paused'}
        </span>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-midnight-400">Allocation</span>
          <span className="font-mono">{strategy.allocationPercent}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-midnight-400">Position</span>
          <span className="font-mono">${strategy.position?.totalCostUsdt.toFixed(2) || '0.00'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-midnight-400">P&L</span>
          <span className={`font-mono ${strategy.unrealizedPnl >= 0 ? 'text-volt-400' : 'text-red-400'}`}>
            {strategy.unrealizedPnl >= 0 ? '+' : ''}${strategy.unrealizedPnl.toFixed(2)}
            <span className="text-xs ml-1">({strategy.unrealizedPnlPercent.toFixed(1)}%)</span>
          </span>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-midnight-700/50 text-xs text-midnight-500">
        <div className="flex justify-between">
          <span>DCA: ${strategy.dcaAmountUsdt} / {strategy.dcaFrequencyHours}h</span>
          <span>Target: {strategy.minProfitToSell}%</span>
        </div>
      </div>
    </div>
  );
}

function MarketRegimeBanner({ market }: { market: DashboardData['market'] }) {
  if (!market) return null;

  const regimeConfig: Record<MarketRegime, { bg: string; border: string }> = {
    extreme_fear: { bg: 'bg-volt-500/10', border: 'border-volt-500/30' },
    fear: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    neutral: { bg: 'bg-midnight-800', border: 'border-midnight-700' },
    greed: { bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    extreme_greed: { bg: 'bg-red-500/10', border: 'border-red-500/30' },
  };

  const config = regimeConfig[market.regime];

  return (
    <div className={`card p-4 ${config.bg} ${config.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gauge className="w-5 h-5 text-indigo-400" />
          <div>
            <span className="font-medium">{market.regimeDescription}</span>
            <p className="text-sm text-midnight-400 mt-0.5">
              RSI: {market.rsi.toFixed(0)} • Score: {market.regimeScore > 0 ? '+' : ''}{market.regimeScore.toFixed(0)}
            </p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          market.recommendation.includes('buy') ? 'bg-volt-500/20 text-volt-400' :
          market.recommendation.includes('sell') ? 'bg-red-500/20 text-red-400' :
          'bg-midnight-700 text-midnight-300'
        }`}>
          {market.recommendation.replace('_', ' ').toUpperCase()}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  change?: number;
  subtitle?: string;
  positive?: boolean;
}

function StatCard({ icon: Icon, label, value, change, subtitle }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="p-2 bg-indigo-500/10 rounded-lg">
          <Icon className="w-4 h-4 text-indigo-400" />
        </div>
        {change !== undefined && (
          <span className={`text-sm font-medium flex items-center gap-1 ${change >= 0 ? 'text-volt-400' : 'text-red-400'}`}>
            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-2">
        <p className="text-xs text-midnight-400">{label}</p>
        <p className={`text-xl font-mono font-bold mt-0.5 ${
          value.includes('-') ? 'text-red-400' : value.includes('+') ? 'text-volt-400' : ''
        }`}>
          {value}
        </p>
        {subtitle && <p className="text-xs text-midnight-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function TransactionRow({ transaction, strategies }: { transaction: Transaction; strategies: StrategyWithPosition[] }) {
  const isBuy = transaction.action === 'buy';
  const strategy = strategies.find(s => s.id === transaction.strategyId);
  
  return (
    <div className="flex items-center justify-between p-3 bg-midnight-900/30 rounded-lg">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          isBuy ? 'bg-volt-500/20' : 'bg-red-500/20'
        }`}>
          {isBuy ? <TrendingUp className="w-4 h-4 text-volt-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
        </div>
        <div>
          <div className="font-medium text-sm flex items-center gap-2">
            {isBuy ? 'Buy' : 'Sell'} ${transaction.valueUsdt.toFixed(2)}
            {strategy && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${RISK_COLORS[strategy.riskProfile].bg} ${RISK_COLORS[strategy.riskProfile].text}`}>
                {strategy.riskProfile.slice(0, 3)}
              </span>
            )}
          </div>
          <div className="text-xs text-midnight-400">
            {format(new Date(transaction.executedAt), 'MMM d, HH:mm')}
          </div>
        </div>
      </div>
      {transaction.profitUsdt !== null && (
        <span className={`font-mono text-sm ${transaction.profitUsdt >= 0 ? 'text-volt-400' : 'text-red-400'}`}>
          {transaction.profitUsdt >= 0 ? '+' : ''}${transaction.profitUsdt.toFixed(2)}
        </span>
      )}
    </div>
  );
}

function LogRow({ log }: { log: DashboardData['recentLogs'][0] }) {
  const levelColors: Record<string, string> = {
    info: 'text-indigo-400',
    warn: 'text-amber-400',
    error: 'text-red-400',
    action: 'text-volt-400',
  };

  return (
    <div className="flex gap-3 p-2 hover:bg-midnight-900/30 rounded-lg text-sm">
      <span className="text-midnight-500 font-mono text-xs whitespace-nowrap">
        {format(new Date(log.createdAt), 'HH:mm:ss')}
      </span>
      <span className={`font-medium uppercase text-xs w-12 ${levelColors[log.level] || 'text-midnight-400'}`}>
        {log.level}
      </span>
      <span className="text-midnight-300 truncate flex-1">{log.message}</span>
    </div>
  );
}
