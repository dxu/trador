import { useState, useRef, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { api } from "../api";
import type { DataSummary, IngestionStatus, OHLCVData, MarketOverviewItem } from "../types";

// ============================================================================
// HELPERS
// ============================================================================

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function formatPrice(n: number): string {
  if (n >= 10_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function formatUsd(n: number): string {
  return "$" + formatPrice(n);
}

// ============================================================================
// SPARKLINE
// ============================================================================

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 20;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#22c55e" : "#ef4444"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ============================================================================
// INTERACTIVE CHART
// ============================================================================

const CHART_PADDING = { top: 16, right: 64, bottom: 32, left: 12 };
const CHART_HEIGHT = 320;
const VOLUME_HEIGHT = 48;
const TOTAL_HEIGHT = CHART_HEIGHT + VOLUME_HEIGHT;

function InteractiveChart({ data, timeframe }: { data: OHLCVData[]; timeframe: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    x: number;
    index: number;
    candle: OHLCVData;
  } | null>(null);

  const sorted = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Price range
  const closes = sorted.map((d) => d.close);
  const allHighs = sorted.map((d) => d.high);
  const allLows = sorted.map((d) => d.low);
  const priceMin = Math.min(...allLows) * 0.998;
  const priceMax = Math.max(...allHighs) * 1.002;
  const priceRange = priceMax - priceMin || 1;

  // Volume range
  const volumes = sorted.map((d) => d.volume);
  const volMax = Math.max(...volumes) || 1;

  // Overall change
  const isUp = closes.length > 1 && closes[closes.length - 1] >= closes[0];
  const color = isUp ? "#22c55e" : "#ef4444";

  // Chart dimensions in viewBox coords
  const chartW = 1000;
  const plotLeft = 10;
  const plotRight = chartW - 60;
  const plotW = plotRight - plotLeft;
  const plotTop = CHART_PADDING.top;
  const plotBottom = CHART_HEIGHT - 4;
  const plotH = plotBottom - plotTop;

  const xAt = (i: number) => plotLeft + (i / Math.max(sorted.length - 1, 1)) * plotW;
  const yAt = (price: number) => plotTop + (1 - (price - priceMin) / priceRange) * plotH;
  const volYAt = (vol: number) =>
    CHART_HEIGHT + VOLUME_HEIGHT - (vol / volMax) * (VOLUME_HEIGHT - 4);

  // Line points
  const linePoints = sorted.map((d, i) => `${xAt(i)},${yAt(d.close)}`).join(" ");

  // Area polygon
  const areaPoints = `${xAt(0)},${plotBottom} ${linePoints} ${xAt(sorted.length - 1)},${plotBottom}`;

  // Y-axis gridlines (5 levels)
  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    yTicks.push(priceMin + (priceRange * i) / 4);
  }

  // X-axis labels (~6 labels)
  const xLabelCount = Math.min(6, sorted.length);
  const xLabels: { index: number; label: string }[] = [];
  const showTime = ["1m", "5m", "15m", "1h", "4h"].includes(timeframe);
  for (let i = 0; i < xLabelCount; i++) {
    const idx = Math.round((i / (xLabelCount - 1)) * (sorted.length - 1));
    const d = new Date(sorted[idx].timestamp);
    const label = showTime
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
    xLabels.push({ index: idx, label });
  }

  // Mouse handling
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * chartW;

      // Find nearest candle
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < sorted.length; i++) {
        const dist = Math.abs(xAt(i) - mouseX);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      setHover({ x: xAt(bestIdx), index: bestIdx, candle: sorted[bestIdx] });
    },
    [sorted, chartW]
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  if (sorted.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-base-content/30 text-sm">
        Not enough data to display chart
      </div>
    );
  }

  const displayCandle = hover?.candle || sorted[sorted.length - 1];
  const displayChange =
    ((displayCandle.close - displayCandle.open) / displayCandle.open) * 100;
  const displayUp = displayChange >= 0;

  return (
    <div ref={containerRef}>
      {/* OHLCV header */}
      <div className="flex items-baseline gap-4 mb-2 flex-wrap">
        <span className="text-2xl font-bold tabular-nums">{formatUsd(displayCandle.close)}</span>
        <div className="flex gap-3 text-xs tabular-nums">
          <span className="text-base-content/40">
            O <span className="text-base-content/70">{formatUsd(displayCandle.open)}</span>
          </span>
          <span className="text-base-content/40">
            H <span className="text-success/70">{formatUsd(displayCandle.high)}</span>
          </span>
          <span className="text-base-content/40">
            L <span className="text-error/70">{formatUsd(displayCandle.low)}</span>
          </span>
          <span className="text-base-content/40">
            V <span className="text-base-content/70">{formatNum(displayCandle.volume)}</span>
          </span>
          <span className={displayUp ? "text-success" : "text-error"}>
            {displayUp ? "+" : ""}{displayChange.toFixed(2)}%
          </span>
        </div>
        {hover && (
          <span className="text-xs text-base-content/40">
            {new Date(displayCandle.timestamp).toLocaleString()}
          </span>
        )}
      </div>

      {/* SVG Chart */}
      <svg
        width="100%"
        viewBox={`0 0 ${chartW} ${TOTAL_HEIGHT}`}
        className="overflow-visible cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines */}
        {yTicks.map((tick, i) => {
          const y = yAt(tick);
          return (
            <g key={i}>
              <line
                x1={plotLeft}
                y1={y}
                x2={plotRight}
                y2={y}
                stroke="#a1a1aa"
                strokeOpacity="0.06"
                strokeWidth="1"
              />
              <text
                x={plotRight + 6}
                y={y + 3}
                fill="#a1a1aa"
                fillOpacity="0.3"
                fontSize="10"
                fontFamily="monospace"
              >
                {formatUsd(tick)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <polygon points={areaPoints} fill="url(#areaGrad)" />

        {/* Price line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth="2"
        />

        {/* Volume bars */}
        {sorted.map((d, i) => {
          const barW = Math.max(plotW / sorted.length * 0.6, 1);
          const barH = TOTAL_HEIGHT - volYAt(d.volume);
          const up = d.close >= d.open;
          return (
            <rect
              key={i}
              x={xAt(i) - barW / 2}
              y={volYAt(d.volume)}
              width={barW}
              height={barH}
              fill={up ? "#22c55e" : "#ef4444"}
              fillOpacity="0.3"
            />
          );
        })}

        {/* Volume separator line */}
        <line
          x1={plotLeft}
          y1={CHART_HEIGHT}
          x2={plotRight}
          y2={CHART_HEIGHT}
          stroke="#a1a1aa"
          strokeOpacity="0.06"
          strokeWidth="1"
        />

        {/* X-axis labels */}
        {xLabels.map(({ index, label }) => (
          <text
            key={index}
            x={xAt(index)}
            y={TOTAL_HEIGHT + 14}
            fill="#a1a1aa"
            fillOpacity="0.3"
            fontSize="10"
            textAnchor="middle"
            fontFamily="monospace"
          >
            {label}
          </text>
        ))}

        {/* Crosshair */}
        {hover && (
          <>
            {/* Vertical line */}
            <line
              x1={hover.x}
              y1={plotTop}
              x2={hover.x}
              y2={TOTAL_HEIGHT}
              stroke="#a1a1aa"
              strokeOpacity="0.3"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            {/* Horizontal line at price */}
            <line
              x1={plotLeft}
              y1={yAt(hover.candle.close)}
              x2={plotRight}
              y2={yAt(hover.candle.close)}
              stroke="#a1a1aa"
              strokeOpacity="0.2"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            {/* Price dot */}
            <circle
              cx={hover.x}
              cy={yAt(hover.candle.close)}
              r="3"
              fill={color}
              stroke="#1d232a"
              strokeWidth="1.5"
            />
            {/* Price label on y-axis */}
            <rect
              x={plotRight + 2}
              y={yAt(hover.candle.close) - 8}
              width="54"
              height="16"
              rx="2"
              fill="#a1a1aa"
              fillOpacity="0.8"
            />
            <text
              x={plotRight + 6}
              y={yAt(hover.candle.close) + 3}
              fill="#1d232a"
              fontSize="10"
              fontFamily="monospace"
            >
              {formatUsd(hover.candle.close)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// ============================================================================
// OHLCV TABLE
// ============================================================================

function DataTable({ data, timeframe }: { data: OHLCVData[]; timeframe: string }) {
  if (!data || data.length === 0) {
    return <div className="text-center py-6 text-base-content/30 text-sm">No data</div>;
  }

  const showTime = ["1m", "5m", "15m", "1h", "4h"].includes(timeframe);

  return (
    <div className="overflow-x-auto max-h-96">
      <table className="table table-xs">
        <thead className="sticky top-0 bg-base-100">
          <tr className="text-base-content/40">
            <th>{showTime ? "Time" : "Date"}</th>
            <th className="text-right">Open</th>
            <th className="text-right">High</th>
            <th className="text-right">Low</th>
            <th className="text-right">Close</th>
            <th className="text-right">Volume</th>
            <th className="text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const chg = ((row.close - row.open) / row.open) * 100;
            const up = chg >= 0;
            return (
              <tr key={row.timestamp} className="hover">
                <td className="text-base-content/50 whitespace-nowrap">
                  {showTime
                    ? new Date(row.timestamp).toLocaleString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })
                    : new Date(row.timestamp).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", year: "2-digit",
                      })}
                </td>
                <td className="text-right font-mono">{formatUsd(row.open)}</td>
                <td className="text-right font-mono text-success/70">{formatUsd(row.high)}</td>
                <td className="text-right font-mono text-error/70">{formatUsd(row.low)}</td>
                <td className="text-right font-mono font-medium">{formatUsd(row.close)}</td>
                <td className="text-right font-mono text-base-content/40">{formatNum(row.volume)}</td>
                <td className={`text-right font-mono ${up ? "text-success" : "text-error"}`}>
                  {up ? "+" : ""}{chg.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// MARKET OVERVIEW
// ============================================================================

function MarketOverview({ onSelectSymbol }: { onSelectSymbol: (symbol: string) => void }) {
  const { data: market } = useSWR<MarketOverviewItem[]>(
    "market-overview",
    api.getMarketOverview,
    { refreshInterval: 30000 }
  );

  if (!market || market.length === 0) return null;

  return (
    <div className="card bg-base-100">
      <div className="card-body p-4">
        <div className="overflow-x-auto">
          <table className="table table-xs">
            <thead>
              <tr className="text-base-content/40">
                <th>Asset</th>
                <th className="text-right">Price</th>
                <th className="text-right">24h</th>
                <th className="text-right">24h High</th>
                <th className="text-right">24h Low</th>
                <th className="text-right">Volume</th>
                <th className="text-right w-16">24h</th>
              </tr>
            </thead>
            <tbody>
              {market.map((item) => {
                const up = item.change24h >= 0;
                return (
                  <tr
                    key={item.symbol}
                    className="hover cursor-pointer"
                    onClick={() => onSelectSymbol(item.symbol)}
                  >
                    <td className="font-medium">{item.symbol.replace("/USD", "")}</td>
                    <td className="text-right font-mono">{formatUsd(item.price)}</td>
                    <td className={`text-right font-mono font-medium ${up ? "text-success" : "text-error"}`}>
                      {up ? "+" : ""}{item.change24h.toFixed(2)}%
                    </td>
                    <td className="text-right font-mono text-base-content/50">{formatUsd(item.high24h)}</td>
                    <td className="text-right font-mono text-base-content/50">{formatUsd(item.low24h)}</td>
                    <td className="text-right font-mono text-base-content/50">{formatNum(item.volume24h)}</td>
                    <td className="text-right">
                      <Sparkline data={item.sparkline} positive={up} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

export function DataPanel() {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USD");

  const { data: status } = useSWR<IngestionStatus>(
    "ingestion-status",
    api.getIngestionStatus,
    { refreshInterval: 5000 }
  );

  const { data: summary } = useSWR<DataSummary[]>(
    "data-summary",
    api.getDataSummary,
    { refreshInterval: 30000 }
  );

  const handleAction = async (action: string, fn: () => Promise<unknown>) => {
    setActionLoading(action);
    try {
      await fn();
      mutate("ingestion-status");
      mutate("data-summary");
    } finally {
      setActionLoading(null);
    }
  };

  const totalCandles = summary?.reduce((sum, d) => sum + d.count, 0) || 0;
  const activeFeeds = summary?.filter((d) => d.enabled).length || 0;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${status?.isRunning ? "bg-success animate-pulse" : "bg-base-content/20"}`} />
            <span className={status?.isRunning ? "text-success/80" : "text-base-content/40"}>
              {status?.isRunning ? "Ingesting" : "Stopped"}
            </span>
          </div>
          <span className="text-base-content/30">
            {activeFeeds} feeds &middot; {formatNum(totalCandles)} candles
          </span>
        </div>
        <div className="flex gap-1">
          {status?.isRunning ? (
            <button
              onClick={() => handleAction("stop", api.stopIngestion)}
              disabled={actionLoading === "stop"}
              className="btn btn-ghost btn-xs text-base-content/40 hover:text-error"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => handleAction("start", api.startIngestion)}
              disabled={actionLoading === "start"}
              className="btn btn-ghost btn-xs text-base-content/40 hover:text-success"
            >
              Start
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      {summary && summary.length > 0 && (
        <ChartPanelWithSymbol summary={summary} symbol={selectedSymbol} />
      )}

      {/* Market overview */}
      <MarketOverview
        onSelectSymbol={(symbol) => setSelectedSymbol(symbol)}
      />
    </div>
  );
}

// Wrapper to pass selected symbol into ChartPanel
function ChartPanelWithSymbol({ summary, symbol }: { summary: DataSummary[]; symbol: string }) {
  const [selectedSymbol, setSelectedSymbol] = useState(symbol);
  const [selectedTimeframe, setSelectedTimeframe] = useState("1d");
  const [view, setView] = useState<"chart" | "table">("chart");

  // Sync when parent changes symbol (clicking market overview row)
  const prevSymbol = useRef(symbol);
  if (symbol !== prevSymbol.current) {
    prevSymbol.current = symbol;
    if (symbol !== selectedSymbol) {
      setSelectedSymbol(symbol);
    }
  }

  const symbols = [...new Set(summary.map((d) => d.symbol))].sort();
  const timeframes =
    summary
      .filter((d) => d.symbol === selectedSymbol)
      .map((d) => d.timeframe)
      .sort((a, b) => {
        const order = ["1d", "4h", "1h", "15m", "5m", "1m"];
        return order.indexOf(a) - order.indexOf(b);
      });

  const { data: ohlcvData, isLoading } = useSWR<OHLCVData[]>(
    selectedSymbol && selectedTimeframe
      ? `ohlcv-${selectedSymbol}-${selectedTimeframe}`
      : null,
    () => api.getHistoricalData(selectedSymbol, selectedTimeframe, 500)
  );

  const handleSymbolChange = (s: string) => {
    setSelectedSymbol(s);
    const available = summary.filter((d) => d.symbol === s).map((d) => d.timeframe);
    if (available.length > 0 && !available.includes(selectedTimeframe)) {
      setSelectedTimeframe(available[0]);
    }
  };

  return (
    <div className="card bg-base-100">
      <div className="card-body p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedSymbol}
            onChange={(e) => handleSymbolChange(e.target.value)}
            className="select select-bordered select-xs font-medium"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>{s.replace("/USD", "")}</option>
            ))}
          </select>

          <div className="join">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`join-item btn btn-xs ${selectedTimeframe === tf ? "btn-primary" : "btn-ghost"}`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="ml-auto join">
            <button
              onClick={() => setView("chart")}
              className={`join-item btn btn-xs ${view === "chart" ? "btn-active" : "btn-ghost"}`}
            >
              Chart
            </button>
            <button
              onClick={() => setView("table")}
              className={`join-item btn btn-xs ${view === "table" ? "btn-active" : "btn-ghost"}`}
            >
              Table
            </button>
          </div>
        </div>

        <div className="mt-3">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <span className="loading loading-spinner loading-sm" />
            </div>
          ) : view === "chart" ? (
            <InteractiveChart data={ohlcvData || []} timeframe={selectedTimeframe} />
          ) : (
            <DataTable data={ohlcvData || []} timeframe={selectedTimeframe} />
          )}
        </div>
      </div>
    </div>
  );
}

