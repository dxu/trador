import { useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { api } from '../api';
import type { BotLog } from '../types';
import { 
  ScrollText,
  Filter,
  AlertTriangle,
  Info,
  Zap,
  AlertCircle,
} from 'lucide-react';

type FilterLevel = 'all' | 'info' | 'warn' | 'error' | 'action';

export function LogsPanel() {
  const [levelFilter, setLevelFilter] = useState<FilterLevel>('all');
  
  const { data: logs, isLoading } = useSWR(
    ['logs', levelFilter],
    () => api.getLogs({ 
      limit: 200, 
      level: levelFilter === 'all' ? undefined : levelFilter 
    }),
    { refreshInterval: 10000 }
  );

  const filters: { id: FilterLevel; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'All', icon: <Filter className="w-3 h-3" /> },
    { id: 'action', label: 'Actions', icon: <Zap className="w-3 h-3" /> },
    { id: 'info', label: 'Info', icon: <Info className="w-3 h-3" /> },
    { id: 'warn', label: 'Warnings', icon: <AlertTriangle className="w-3 h-3" /> },
    { id: 'error', label: 'Errors', icon: <AlertCircle className="w-3 h-3" /> },
  ];

  const levelColors: Record<string, { bg: string; text: string; border: string }> = {
    info: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
    warn: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
    error: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
    action: { bg: 'bg-volt-500/10', text: 'text-volt-400', border: 'border-volt-500/30' },
  };

  const levelIcons: Record<string, React.ReactNode> = {
    info: <Info className="w-4 h-4" />,
    warn: <AlertTriangle className="w-4 h-4" />,
    error: <AlertCircle className="w-4 h-4" />,
    action: <Zap className="w-4 h-4" />,
  };

  // Group logs by date
  const groupedLogs = logs?.reduce((acc, log) => {
    const date = format(new Date(log.createdAt), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {} as Record<string, BotLog[]>) || {};

  return (
    <div className="space-y-6 animate-stagger">
      {/* Header with Filters */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ScrollText className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold">Activity Log</h2>
            <span className="text-sm text-midnight-400">
              {logs?.length || 0} entries
            </span>
          </div>
          
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-midnight-900/50 rounded-lg p-1">
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setLevelFilter(filter.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  levelFilter === filter.id
                    ? 'bg-indigo-500 text-white'
                    : 'text-midnight-400 hover:text-white'
                }`}
              >
                {filter.icon}
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Logs List */}
      {isLoading ? (
        <div className="card p-8 text-center text-midnight-400">Loading logs...</div>
      ) : logs && logs.length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedLogs).map(([date, dayLogs]) => (
            <div key={date}>
              {/* Date Header */}
              <div className="sticky top-20 z-10 bg-midnight-950/90 backdrop-blur-sm py-2 mb-3">
                <h3 className="text-sm font-medium text-midnight-400">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                </h3>
              </div>
              
              {/* Logs for this day */}
              <div className="space-y-2">
                {dayLogs.map((log) => {
                  const colors = levelColors[log.level] || levelColors.info;
                  const icon = levelIcons[log.level] || levelIcons.info;
                  
                  return (
                    <div
                      key={log.id}
                      className={`card p-4 ${colors.bg} border ${colors.border}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${colors.text}`}>
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium uppercase ${colors.text}`}>
                              {log.level}
                            </span>
                            <span className="text-xs text-midnight-500">
                              {log.category}
                            </span>
                            <span className="text-xs text-midnight-600">•</span>
                            <span className="text-xs text-midnight-500 font-mono">
                              {format(new Date(log.createdAt), 'HH:mm:ss')}
                            </span>
                            {log.price && (
                              <>
                                <span className="text-xs text-midnight-600">•</span>
                                <span className="text-xs text-midnight-400 font-mono">
                                  ${log.price.toFixed(2)}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-sm text-midnight-200">{log.message}</p>
                          
                          {/* Regime Badge */}
                          {log.regime && (
                            <div className="mt-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                log.regime.includes('fear') ? 'bg-volt-500/20 text-volt-400' :
                                log.regime.includes('greed') ? 'bg-red-500/20 text-red-400' :
                                'bg-midnight-700 text-midnight-300'
                              }`}>
                                {log.regime.replace('_', ' ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center text-midnight-400">
          <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No logs found.</p>
          <p className="text-sm mt-1">Start the bot to see activity.</p>
        </div>
      )}
    </div>
  );
}
