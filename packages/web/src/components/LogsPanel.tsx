import { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { api } from "../api";
import type { BotLog } from "../types";

type FilterLevel = "all" | "info" | "warn" | "error" | "action";

export function LogsPanel() {
  const [levelFilter, setLevelFilter] = useState<FilterLevel>("all");

  const { data: logs, isLoading } = useSWR(
    ["logs", levelFilter],
    () =>
      api.getLogs({
        limit: 200,
        level: levelFilter === "all" ? undefined : levelFilter,
      }),
    { refreshInterval: 10000 }
  );

  const filters: { id: FilterLevel; label: string }[] = [
    { id: "all", label: "All" },
    { id: "action", label: "Actions" },
    { id: "info", label: "Info" },
    { id: "warn", label: "Warnings" },
    { id: "error", label: "Errors" },
  ];

  const levelStyles: Record<string, string> = {
    info: "bg-blue-50 text-blue-700 border-blue-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    error: "bg-red-50 text-red-700 border-red-200",
    action: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  // Group logs by date
  const groupedLogs =
    logs?.reduce((acc, log) => {
      const date = format(new Date(log.createdAt), "yyyy-MM-dd");
      if (!acc[date]) acc[date] = [];
      acc[date].push(log);
      return acc;
    }, {} as Record<string, BotLog[]>) || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-surface-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-surface-900">Activity Log</h2>
            <span className="text-sm text-surface-400">
              {logs?.length || 0} entries
            </span>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1">
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setLevelFilter(filter.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  levelFilter === filter.id
                    ? "bg-white text-surface-900 shadow-sm"
                    : "text-surface-500 hover:text-surface-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Logs */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-surface-200 py-12 text-center text-surface-400">
          Loading...
        </div>
      ) : logs && logs.length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedLogs).map(([date, dayLogs]) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-surface-500 mb-3">
                {format(new Date(date), "EEEE, MMMM d, yyyy")}
              </h3>

              <div className="bg-white rounded-xl border border-surface-200 divide-y divide-surface-100">
                {dayLogs.map((log) => {
                  const style = levelStyles[log.level] || levelStyles.info;

                  return (
                    <div key={log.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded border ${style}`}
                        >
                          {log.level}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-surface-400 mb-1">
                            <span>{log.category}</span>
                            <span>·</span>
                            <span className="font-mono">
                              {format(new Date(log.createdAt), "HH:mm:ss")}
                            </span>
                            {log.price && (
                              <>
                                <span>·</span>
                                <span className="font-mono">
                                  ${log.price.toFixed(0)}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-sm text-surface-700">
                            {log.message}
                          </p>
                          {log.regime && (
                            <span
                              className={`inline-block mt-2 text-xs px-2 py-0.5 rounded ${
                                log.regime.includes("fear")
                                  ? "bg-emerald-50 text-emerald-700"
                                  : log.regime.includes("greed")
                                  ? "bg-orange-50 text-orange-700"
                                  : "bg-surface-100 text-surface-600"
                              }`}
                            >
                              {log.regime.replace("_", " ")}
                            </span>
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
        <div className="bg-white rounded-xl border border-surface-200 py-12 text-center text-surface-400">
          No logs found
        </div>
      )}
    </div>
  );
}
