import { useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { api } from '../api';
import type { Transaction, Strategy, RiskProfile } from '../types';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Target,
  Percent,
  Turtle,
  Scale,
  Rocket,
} from 'lucide-react';

type FilterAction = 'all' | 'buy' | 'sell';

const RISK_COLORS: Record<RiskProfile, string> = {
  conservative: 'bg-blue-500/20 text-blue-400',
  moderate: 'bg-indigo-500/20 text-indigo-400',
  aggressive: 'bg-orange-500/20 text-orange-400',
};

export function TransactionsPanel() {
  const [actionFilter, setActionFilter] = useState<FilterAction>('all');
  
  const { data: transactions, isLoading } = useSWR(
    ['transactions', actionFilter],
    () => api.getTransactions({ 
      limit: 100, 
      action: actionFilter === 'all' ? undefined : actionFilter 
    }),
    { refreshInterval: 30000 }
  );
  
  const { data: stats } = useSWR('transaction-stats', api.getTransactionStats, {
    refreshInterval: 60000,
  });

  const filters: { id: FilterAction; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'buy', label: 'Buys' },
    { id: 'sell', label: 'Sells' },
  ];

  return (
    <div className="space-y-6 animate-stagger">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-midnight-400 mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Total Invested</span>
          </div>
          <p className="text-2xl font-mono font-bold">${(stats?.totalInvested || 0).toFixed(2)}</p>
          <p className="text-xs text-midnight-500 mt-1">{stats?.totalBuys || 0} buy orders</p>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center gap-2 text-midnight-400 mb-2">
            <Target className="w-4 h-4" />
            <span className="text-sm">Realized Profit</span>
          </div>
          <p className={`text-2xl font-mono font-bold ${(stats?.realizedProfit || 0) >= 0 ? 'text-volt-400' : 'text-red-400'}`}>
            {(stats?.realizedProfit || 0) >= 0 ? '+' : ''}${(stats?.realizedProfit || 0).toFixed(2)}
          </p>
          <p className="text-xs text-midnight-500 mt-1">{stats?.totalSells || 0} sell orders</p>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center gap-2 text-midnight-400 mb-2">
            <Percent className="w-4 h-4" />
            <span className="text-sm">Win Rate</span>
          </div>
          <p className="text-2xl font-mono font-bold text-indigo-400">
            {(stats?.winRate || 0).toFixed(1)}%
          </p>
          <p className="text-xs text-midnight-500 mt-1">Profitable sells</p>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center gap-2 text-midnight-400 mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-sm">Total Fees</span>
          </div>
          <p className="text-2xl font-mono font-bold text-midnight-300">
            ${(stats?.totalFees || 0).toFixed(2)}
          </p>
          <p className="text-xs text-midnight-500 mt-1">Exchange fees paid</p>
        </div>
      </div>

      {/* Avg Trade Sizes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-medium text-midnight-400 mb-3">Average Trade Sizes</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-midnight-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-volt-400" />
                Avg Buy
              </span>
              <span className="font-mono text-volt-400">${(stats?.avgBuySize || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-midnight-300 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                Avg Sell
              </span>
              <span className="font-mono">${(stats?.avgSellSize || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <div className="card p-5">
          <h3 className="text-sm font-medium text-midnight-400 mb-3">Net Flow</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-midnight-300">Invested</span>
              <span className="font-mono text-red-400">-${(stats?.totalInvested || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-midnight-300">Withdrawn</span>
              <span className="font-mono text-volt-400">+${(stats?.totalSold || 0).toFixed(2)}</span>
            </div>
            <div className="border-t border-midnight-700 pt-2 flex justify-between items-center">
              <span className="text-white font-medium">Net</span>
              <span className={`font-mono font-bold ${((stats?.totalSold || 0) - (stats?.totalInvested || 0)) >= 0 ? 'text-volt-400' : 'text-red-400'}`}>
                {((stats?.totalSold || 0) - (stats?.totalInvested || 0)) >= 0 ? '+' : ''}${((stats?.totalSold || 0) - (stats?.totalInvested || 0)).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card">
        <div className="p-4 border-b border-midnight-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Transaction History</h2>
          
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-midnight-900/50 rounded-lg p-1">
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActionFilter(filter.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  actionFilter === filter.id
                    ? 'bg-indigo-500 text-white'
                    : 'text-midnight-400 hover:text-white'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-midnight-400">Loading transactions...</div>
          ) : transactions && transactions.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr className="text-left">
                  <th className="pl-4">Date</th>
                  <th>Action</th>
                  <th>Amount</th>
                  <th>Price</th>
                  <th>Value</th>
                  <th>Fee</th>
                  <th>Profit</th>
                  <th>Regime</th>
                  <th className="pr-4">Reason</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <TransactionRow key={tx.id} transaction={tx} />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-midnight-400">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No transactions found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isBuy = transaction.action === 'buy';
  const profitClass = transaction.profitUsdt !== null 
    ? transaction.profitUsdt >= 0 ? 'text-volt-400' : 'text-red-400'
    : 'text-midnight-500';

  return (
    <tr className="hover:bg-midnight-900/30 transition-colors border-b border-midnight-800/50 last:border-0">
      <td className="pl-4 text-midnight-300">
        <div>
          <div>{format(new Date(transaction.executedAt), 'MMM d, yyyy')}</div>
          <div className="text-xs text-midnight-500">{format(new Date(transaction.executedAt), 'HH:mm:ss')}</div>
        </div>
      </td>
      <td>
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
          isBuy 
            ? 'bg-volt-500/20 text-volt-400' 
            : 'bg-red-500/20 text-red-400'
        }`}>
          {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {transaction.action.toUpperCase()}
        </span>
      </td>
      <td className="font-mono">{transaction.amount.toFixed(6)}</td>
      <td className="font-mono">${transaction.price.toFixed(2)}</td>
      <td className="font-mono">${transaction.valueUsdt.toFixed(2)}</td>
      <td className="font-mono text-midnight-500">${(transaction.fee || 0).toFixed(4)}</td>
      <td className={`font-mono ${profitClass}`}>
        {transaction.profitUsdt !== null 
          ? `${transaction.profitUsdt >= 0 ? '+' : ''}$${transaction.profitUsdt.toFixed(2)}`
          : '—'
        }
        {transaction.profitPercent !== null && (
          <span className="text-xs ml-1">({transaction.profitPercent.toFixed(1)}%)</span>
        )}
      </td>
      <td>
        {transaction.regime ? (
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            transaction.regime.includes('fear') ? 'bg-volt-500/20 text-volt-400' :
            transaction.regime.includes('greed') ? 'bg-red-500/20 text-red-400' :
            'bg-midnight-700 text-midnight-300'
          }`}>
            {transaction.regime.replace('_', ' ')}
          </span>
        ) : '—'}
      </td>
      <td className="pr-4 max-w-xs">
        <span className="text-xs text-midnight-400 truncate block" title={transaction.reason || ''}>
          {transaction.reason || '—'}
        </span>
      </td>
    </tr>
  );
}
