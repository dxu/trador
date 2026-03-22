import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import type { Strategy, BacktestRun, BacktestTrade, BacktestSnapshot } from "../types";

// ============================================================================
// BACKTEST PANEL
// ============================================================================

export default function BacktestPanel() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);

  // Config form
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [symbol, setSymbol] = useState("BTC/USD");
  const [timeframe, setTimeframe] = useState("1h");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialCapital, setInitialCapital] = useState(10000);
  const [paramOverrides, setParamOverrides] = useState<Record<string, any>>({});
  const [running, setRunning] = useState(false);

  // Results
  const [activeRun, setActiveRun] = useState<BacktestRun | null>(null);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [snapshots, setSnapshots] = useState<BacktestSnapshot[]>([]);

  // Load initial data
  useEffect(() => {
    api.getStrategies().then((s) => {
      setStrategies(s);
      if (s.length > 0) setSelectedStrategy(s[0].id);
    });
    api.getAvailableSymbols().then(setSymbols);
    api.getBacktestRuns().then(setRuns);

    // Default dates: 90 days ago to now
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  }, []);

  // Reset param overrides when strategy changes
  useEffect(() => {
    const strat = strategies.find((s) => s.id === selectedStrategy);
    if (strat) setParamOverrides({ ...strat.defaultParams });
  }, [selectedStrategy, strategies]);

  const currentStrategy = strategies.find((s) => s.id === selectedStrategy);

  // Start backtest
  const handleStart = async () => {
    if (!selectedStrategy || running) return;
    setRunning(true);
    try {
      const { id } = await api.startBacktest({
        strategySlug: selectedStrategy,
        symbol,
        timeframe,
        startDate,
        endDate,
        initialCapital,
        paramOverrides,
      });
      // Poll until complete
      const poll = setInterval(async () => {
        const run = await api.getBacktestResult(id);
        if (run.status !== "running") {
          clearInterval(poll);
          setRunning(false);
          setActiveRun(run);
          if (run.status === "completed") {
            const [t, s] = await Promise.all([
              api.getBacktestTrades(id),
              api.getBacktestSnapshots(id),
            ]);
            setTrades(t);
            setSnapshots(s);
          }
          api.getBacktestRuns().then(setRuns);
        }
      }, 1000);
    } catch (e: any) {
      setRunning(false);
      alert("Backtest failed: " + e.message);
    }
  };

  // Load a past run
  const loadRun = async (run: BacktestRun) => {
    setActiveRun(run);
    if (run.status === "completed") {
      const [t, s] = await Promise.all([
        api.getBacktestTrades(run.id),
        api.getBacktestSnapshots(run.id),
      ]);
      setTrades(t);
      setSnapshots(s);
    } else {
      setTrades([]);
      setSnapshots([]);
    }
  };

  const deleteRun = async (id: string) => {
    await api.deleteBacktest(id);
    setRuns((r) => r.filter((run) => run.id !== id));
    if (activeRun?.id === id) {
      setActiveRun(null);
      setTrades([]);
      setSnapshots([]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Config Section */}
      <div className="card bg-base-200">
        <div className="card-body p-4">
          <h3 className="card-title text-sm">Run Backtest</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="form-control">
              <label className="label py-0.5">
                <span className="label-text text-xs">Strategy</span>
              </label>
              <select
                className="select select-bordered select-sm"
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0.5">
                <span className="label-text text-xs">Symbol</span>
              </label>
              <select
                className="select select-bordered select-sm"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              >
                {symbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0.5">
                <span className="label-text text-xs">Timeframe</span>
              </label>
              <select
                className="select select-bordered select-sm"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
              >
                <option value="5m">5m</option>
                <option value="1h">1h</option>
                <option value="1d">1d</option>
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0.5">
                <span className="label-text text-xs">Capital ($)</span>
              </label>
              <input
                type="number"
                className="input input-bordered input-sm"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
              />
            </div>
            <div className="form-control">
              <label className="label py-0.5">
                <span className="label-text text-xs">Start Date</span>
              </label>
              <input
                type="date"
                className="input input-bordered input-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="form-control">
              <label className="label py-0.5">
                <span className="label-text text-xs">End Date</span>
              </label>
              <input
                type="date"
                className="input input-bordered input-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Strategy explanation */}
          {currentStrategy && (
            <StrategyExplainer strategyId={currentStrategy.id} />
          )}

          {/* Strategy params */}
          {currentStrategy && (
            <div className="mt-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(currentStrategy.paramLabels).map(([key, label]) => (
                  <div key={key} className="form-control">
                    <label className="label py-0">
                      <span
                        className="label-text text-xs cursor-help"
                        title={currentStrategy.paramDescriptions[key]}
                      >
                        {label}
                      </span>
                    </label>
                    {typeof currentStrategy.defaultParams[key] === "boolean" ? (
                      <input
                        type="checkbox"
                        className="toggle toggle-sm"
                        checked={!!paramOverrides[key]}
                        onChange={(e) =>
                          setParamOverrides((p) => ({
                            ...p,
                            [key]: e.target.checked,
                          }))
                        }
                      />
                    ) : (
                      <input
                        type="number"
                        className="input input-bordered input-xs"
                        value={paramOverrides[key] ?? currentStrategy.defaultParams[key]}
                        step={
                          typeof currentStrategy.defaultParams[key] === "number" &&
                          Number(currentStrategy.defaultParams[key]) < 1
                            ? 0.01
                            : 1
                        }
                        onChange={(e) =>
                          setParamOverrides((p) => ({
                            ...p,
                            [key]: Number(e.target.value),
                          }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2">
            <button
              className={`btn btn-primary btn-sm ${running ? "loading" : ""}`}
              onClick={handleStart}
              disabled={running || !selectedStrategy}
            >
              {running ? "Running..." : "Run Backtest"}
            </button>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {activeRun && activeRun.status === "completed" && (
        <div className="space-y-4">
          {/* Summary stats */}
          <ResultStats run={activeRun} />

          {/* Equity curve */}
          {snapshots.length > 0 && (
            <EquityCurve
              snapshots={snapshots}
              trades={trades}
              initialCapital={activeRun.initialCapital}
            />
          )}

          {/* Trade log */}
          {trades.length > 0 && <TradeLog trades={trades} />}
        </div>
      )}

      {activeRun && activeRun.status === "failed" && (
        <div className="alert alert-error">
          <span>Backtest failed: {activeRun.error}</span>
        </div>
      )}

      {/* History */}
      {runs.length > 0 && (
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">History</h3>
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Symbol</th>
                    <th>TF</th>
                    <th>Return</th>
                    <th>B&H</th>
                    <th>Trades</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className={`cursor-pointer hover ${activeRun?.id === run.id ? "bg-base-300" : ""}`}
                      onClick={() => loadRun(run)}
                    >
                      <td className="font-mono text-xs">{run.strategySlug}</td>
                      <td>{run.symbol}</td>
                      <td>{run.timeframe}</td>
                      <td
                        className={
                          run.totalReturn !== null
                            ? run.totalReturn >= 0
                              ? "text-success"
                              : "text-error"
                            : ""
                        }
                      >
                        {run.totalReturn !== null
                          ? `${run.totalReturn >= 0 ? "+" : ""}${run.totalReturn.toFixed(1)}%`
                          : "-"}
                      </td>
                      <td className="opacity-60">
                        {run.buyHoldReturn !== null
                          ? `${run.buyHoldReturn >= 0 ? "+" : ""}${run.buyHoldReturn.toFixed(1)}%`
                          : "-"}
                      </td>
                      <td>{run.totalTrades ?? "-"}</td>
                      <td>
                        <span
                          className={`badge badge-xs ${
                            run.status === "completed"
                              ? "badge-success"
                              : run.status === "failed"
                                ? "badge-error"
                                : "badge-warning"
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRun(run.id);
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RESULT STATS
// ============================================================================

function ResultStats({ run }: { run: BacktestRun }) {
  const stats = [
    {
      label: "Total Return",
      value:
        run.totalReturn !== null
          ? `${run.totalReturn >= 0 ? "+" : ""}${run.totalReturn.toFixed(2)}%`
          : "-",
      color: run.totalReturn !== null && run.totalReturn >= 0 ? "text-success" : "text-error",
    },
    {
      label: "Buy & Hold",
      value:
        run.buyHoldReturn !== null
          ? `${run.buyHoldReturn >= 0 ? "+" : ""}${run.buyHoldReturn.toFixed(2)}%`
          : "-",
      color:
        run.buyHoldReturn !== null && run.buyHoldReturn >= 0 ? "text-success" : "text-error",
    },
    {
      label: "Max Drawdown",
      value: run.maxDrawdown !== null ? `-${run.maxDrawdown.toFixed(2)}%` : "-",
      color: "text-warning",
    },
    {
      label: "Sharpe Ratio",
      value: run.sharpeRatio !== null ? run.sharpeRatio.toFixed(2) : "-",
      color: "",
    },
    {
      label: "Win Rate",
      value: run.winRate !== null ? `${run.winRate.toFixed(0)}%` : "-",
      color: "",
    },
    {
      label: "Total Trades",
      value: run.totalTrades !== null ? run.totalTrades.toString() : "-",
      color: "",
    },
    {
      label: "Time Locked",
      value: run.timeLocked !== null ? `${run.timeLocked} candles` : "-",
      color: run.timeLocked !== null && run.timeLocked > 0 ? "text-warning" : "",
    },
    {
      label: "Final Value",
      value:
        run.finalValue !== null
          ? `$${run.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : "-",
      color: "",
    },
  ];

  const beatsBuyHold =
    run.totalReturn !== null &&
    run.buyHoldReturn !== null &&
    run.totalReturn > run.buyHoldReturn;

  return (
    <div className="card bg-base-200">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="card-title text-sm">Results</h3>
          {run.totalReturn !== null && run.buyHoldReturn !== null && (
            <span
              className={`badge badge-sm ${beatsBuyHold ? "badge-success" : "badge-error"}`}
            >
              {beatsBuyHold ? "Beats" : "Loses to"} Buy & Hold by{" "}
              {Math.abs(run.totalReturn - run.buyHoldReturn).toFixed(1)}%
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-xs opacity-50">{s.label}</div>
              <div className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EQUITY CURVE (interactive SVG)
// ============================================================================

function EquityCurve({
  snapshots,
  trades,
  initialCapital,
}: {
  snapshots: BacktestSnapshot[];
  trades: BacktestTrade[];
  initialCapital: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    snapshot: BacktestSnapshot;
    buyHoldValue: number;
  } | null>(null);

  const W = 900;
  const H = 300;
  const PAD = { top: 20, right: 60, bottom: 30, left: 70 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (snapshots.length < 2) return null;

  const timestamps = snapshots.map((s) => new Date(s.timestamp).getTime());
  const tMin = timestamps[0];
  const tMax = timestamps[timestamps.length - 1];

  const values = snapshots.map((s) => s.portfolioValue);
  const allValues = [...values, initialCapital];
  const vMin = Math.min(...allValues) * 0.98;
  const vMax = Math.max(...allValues) * 1.02;

  const xScale = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin || 1)) * chartW;
  const yScale = (v: number) => PAD.top + (1 - (v - vMin) / (vMax - vMin || 1)) * chartH;

  // Portfolio line
  const portfolioPath = snapshots
    .map((s, i) => {
      const x = xScale(timestamps[i]);
      const y = yScale(s.portfolioValue);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  // Y-axis gridlines
  const yTicks = 5;
  const yStep = (vMax - vMin) / yTicks;
  const yGridlines = Array.from({ length: yTicks + 1 }, (_, i) => vMin + yStep * i);

  // X-axis labels
  const xTicks = 6;
  const xStep = (tMax - tMin) / xTicks;
  const xLabels = Array.from({ length: xTicks + 1 }, (_, i) => tMin + xStep * i);

  // Trade markers on the curve
  const tradeMarkers = trades.map((t) => {
    const ts = new Date(t.timestamp).getTime();
    const x = xScale(ts);
    // Find closest snapshot for y position
    let closest = snapshots[0];
    let minDist = Infinity;
    for (const s of snapshots) {
      const d = Math.abs(new Date(s.timestamp).getTime() - ts);
      if (d < minDist) {
        minDist = d;
        closest = s;
      }
    }
    const y = yScale(closest.portfolioValue);
    return { x, y, side: t.side, reason: t.reason };
  });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * W;

      if (mouseX < PAD.left || mouseX > W - PAD.right) {
        setHover(null);
        return;
      }

      // Find closest snapshot
      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < snapshots.length; i++) {
        const sx = xScale(timestamps[i]);
        const d = Math.abs(sx - mouseX);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }

      setHover({
        x: xScale(timestamps[closestIdx]),
        y: yScale(snapshots[closestIdx].portfolioValue),
        snapshot: snapshots[closestIdx],
        buyHoldValue: initialCapital,
      });
    },
    [snapshots, timestamps]
  );

  return (
    <div className="card bg-base-200">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="card-title text-sm">Equity Curve</h3>
          {hover && (
            <div className="text-xs font-mono opacity-70">
              {new Date(hover.snapshot.timestamp).toLocaleDateString()} | Portfolio:{" "}
              <span className="text-primary">
                ${hover.snapshot.portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>{" "}
              | Cash: ${hover.snapshot.cashBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} |
              Crypto: ${hover.snapshot.cryptoValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} |
              DD: -{hover.snapshot.drawdownPercent.toFixed(1)}%
            </div>
          )}
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Background */}
          <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill="#1d232a" />

          {/* Y gridlines */}
          {yGridlines.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yScale(v)}
                y2={yScale(v)}
                stroke="#a1a1aa"
                strokeWidth={0.5}
                opacity={0.3}
              />
              <text
                x={PAD.left - 5}
                y={yScale(v) + 3}
                textAnchor="end"
                fill="#a1a1aa"
                fontSize={9}
              >
                ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </text>
            </g>
          ))}

          {/* X labels */}
          {xLabels.map((t, i) => (
            <text
              key={i}
              x={xScale(t)}
              y={H - 5}
              textAnchor="middle"
              fill="#a1a1aa"
              fontSize={9}
            >
              {new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
          ))}

          {/* Initial capital line */}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yScale(initialCapital)}
            y2={yScale(initialCapital)}
            stroke="#a1a1aa"
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.5}
          />

          {/* Portfolio line */}
          <path d={portfolioPath} fill="none" stroke="#22c55e" strokeWidth={2} />

          {/* Trade markers */}
          {tradeMarkers.map((m, i) => (
            <circle
              key={i}
              cx={m.x}
              cy={m.y}
              r={3}
              fill={m.side === "buy" ? "#22c55e" : "#ef4444"}
              opacity={0.8}
            />
          ))}

          {/* Crosshair */}
          {hover && (
            <>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="#a1a1aa"
                strokeWidth={0.5}
                strokeDasharray="3,3"
              />
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={hover.y}
                y2={hover.y}
                stroke="#a1a1aa"
                strokeWidth={0.5}
                strokeDasharray="3,3"
              />
              <circle cx={hover.x} cy={hover.y} r={4} fill="#22c55e" stroke="#fff" strokeWidth={1} />
              {/* Price label */}
              <rect
                x={W - PAD.right + 2}
                y={hover.y - 8}
                width={55}
                height={16}
                fill="#22c55e"
                rx={2}
              />
              <text
                x={W - PAD.right + 5}
                y={hover.y + 3}
                fill="#000"
                fontSize={9}
                fontWeight="bold"
              >
                ${hover.snapshot.portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

// ============================================================================
// TRADE LOG
// ============================================================================

function TradeLog({ trades }: { trades: BacktestTrade[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? trades : trades.slice(0, 20);

  return (
    <div className="card bg-base-200">
      <div className="card-body p-4">
        <div className="flex items-center justify-between">
          <h3 className="card-title text-sm">
            Trade Log ({trades.length} trades)
          </h3>
          {trades.length > 20 && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : `Show all ${trades.length}`}
            </button>
          )}
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="table table-xs">
            <thead className="sticky top-0 bg-base-200">
              <tr>
                <th>Time</th>
                <th>Side</th>
                <th>Price</th>
                <th>Amount</th>
                <th>Cost</th>
                <th>Fee</th>
                <th>Avg Entry</th>
                <th>Portfolio</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs">
                    {new Date(t.timestamp).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    <span
                      className={`badge badge-xs ${t.side === "buy" ? "badge-success" : "badge-error"}`}
                    >
                      {t.side}
                    </span>
                  </td>
                  <td className="font-mono">${t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="font-mono">{t.amount.toFixed(6)}</td>
                  <td className="font-mono">${t.cost.toFixed(2)}</td>
                  <td className="font-mono opacity-50">${t.fee.toFixed(2)}</td>
                  <td className="font-mono text-xs opacity-70">
                    {t.avgEntryBefore != null && t.avgEntryBefore > 0
                      ? `$${t.avgEntryBefore.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "-"}
                  </td>
                  <td className="font-mono">
                    ${t.portfolioValueAfter.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="text-xs opacity-70 max-w-[200px] truncate" title={t.reason}>
                    {t.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STRATEGY EXPLAINER
// ============================================================================

const STRATEGY_DOCS: Record<
  string,
  {
    howItWorks: string;
    logic: string[];
    bestFor: string;
    risks: string;
    paramNotes: string[];
  }
> = {
  "hodl-baseline": {
    howItWorks:
      "The simplest possible strategy: buy 100% of capital on the first candle and never sell. This is a pure buy-and-hold benchmark. Every other strategy should beat this to justify its complexity — if it doesn't, you're better off just holding.",
    logic: [
      "On the first candle, buys 99% of available cash (reserves 1% for fees)",
      "On every subsequent candle, holds the position",
      "Never sells under any conditions",
    ],
    bestFor:
      "Benchmarking. Run this alongside Smart DCA and Volatility Harvester on the same data to see if active management actually adds value. In strong bull markets, HODL often wins because it has maximum exposure from day one.",
    risks:
      "100% market exposure from the start. If price drops 50% right after entry, you're down 50% with no DCA to average down and no cash to buy the dip. This is the baseline risk every other strategy tries to improve upon.",
    paramNotes: [],
  },
  "smart-dca": {
    howItWorks:
      "Regime-aware dollar cost averaging. Always accumulating crypto, but buys more aggressively in fear regimes (when prices are low) and scales back in greed regimes (when prices are elevated). Takes partial profits at configurable tiers when significantly up, but never sells at a loss. The regime detector uses RSI, trend (price vs slow SMA), momentum (MACD/ATR), and distance from recent high to classify the market into 5 regimes: strong_bear, bear, neutral, bull, strong_bull.",
    logic: [
      "Detects market regime from a 0-100 composite score (strong_bear < 20, bear < 35, neutral < 65, bull < 80, strong_bull)",
      "Checks profit-taking tiers — if unrealized PnL exceeds a tier threshold, sells that fraction of the position",
      "Checks if a scheduled DCA buy is due (elapsed >= buyIntervalCandles)",
      "Checks for dip bonus — if price dropped >= dipThreshold% from recent high, triggers a bonus buy (bypasses schedule)",
      "Calculates buy amount: baseBuyUsd x dipMultiplier x regimeMultiplier (1.75x in strong_bear, 0.5x in strong_bull)",
      "Volatility scaling reduces buy size when ATR/price is unusually high",
      "Caps by available cash and maxPositionPercent",
      "In strong_bear regime, halves the buy interval (accumulate faster when fear is highest)",
    ],
    bestFor:
      "Steady accumulation over weeks to months. Outperforms naive DCA by buying more when prices are depressed and less when overextended. The profit tiers ensure you take gains off the table during rallies. Works well on 1h and 1d timeframes.",
    risks:
      "In a prolonged crash (50%+), capital gets locked — the strategy never sells at a loss by design. However, the increased buying during fear regimes pulls your average entry down, so recovery happens faster than pure HODL. The 'timeLocked' metric shows how many candles you were underwater.",
    paramNotes: [
      "Base Buy: $100 per scheduled interval. Scale to your budget. With 24-candle interval on 1h = ~$100/day.",
      "Buy Interval: 24 candles on 1h = daily. On 1d = every 24 days. Halved automatically in strong_bear.",
      "Dip Threshold: -5% means trigger bonus buy when price drops 5% from recent high. More negative = fewer triggers.",
      "Dip Multiplier: 2.0 means buy double during dips. Higher = more aggressive dip buying.",
      "Profit Tiers 1-4: At +5%/+10%/+20%/+35% unrealized PnL, sell 25% of position each. Adjust for your risk tolerance.",
      "Sell Per Tier: 0.25 = sell 25% at each tier. Lower = more gradual profit-taking.",
      "Regime Buy Scaling: When enabled, multiplies buy amount by regime factor (1.75x fear, 0.5x greed).",
      "Max Position: 85% means keep at least 15% in cash. Provides reserve for deeper dips.",
    ],
  },
  "volatility-harvester": {
    howItWorks:
      "Systematically captures crypto's frequent 5-10% swings using Bollinger Bands and RSI. Buys when price hits the lower Bollinger Band (oversold zone) and sells at the upper band (overbought zone) — but only at a profit. Uses Stochastic RSI for additional confirmation on entries. Regime detection adjusts behavior: suppresses sells in bear markets (hold for recovery) and suppresses signal buys in strong bull (DCA floor only). A DCA floor ensures constant accumulation even when no buy signals fire.",
    logic: [
      "Detects market regime (same 5-level system as Smart DCA)",
      "Calculates BB position: (price - bbLower) / (bbUpper - bbLower) where 0 = lower band, 1 = upper band",
      "SELL: Checks profit-taking tiers first (shared with Smart DCA). Then checks BB overbought sell: bbPosition >= 0.8 AND RSI >= 65 AND position is profitable",
      "In bear/strong_bear: suppresses sells unless PnL exceeds tier 3 threshold (hold for bigger recovery)",
      "In strong_bull: lowers profit tier thresholds by 2% (take profits sooner)",
      "BUY: Signal buy when bbPosition <= 0.2 AND RSI <= 35. StochRSI < 20 adds confidence but isn't required",
      "In strong_bear: widens buy zone and RSI threshold (more aggressive dip buying)",
      "In strong_bull: suppresses signal buys entirely (only DCA floor)",
      "DCA floor: if no signal buy for dcaFloorIntervalCandles, executes a small buy regardless",
      "Cooldown between signal buys (DCA floor bypasses it)",
    ],
    bestFor:
      "Markets with regular 5-10% swings — which is most of crypto, most of the time. Captures the 'noise' that frustrates trend-followers. The Bollinger Band signals are well-suited to 1h and 4h timeframes. The DCA floor ensures you're always accumulating even during quiet periods.",
    risks:
      "In a V-shaped crash and recovery, the BB buy zone may not trigger if the move is too fast (price gaps through the zone). In a slow grind down, it may buy repeatedly on lower-band touches that keep getting lower. The 'never sell at a loss' constraint means positions can be locked during extended bear markets — the DCA floor helps average down over time.",
    paramNotes: [
      "BB Period/StdDev: 20/2.0 is standard. Wider (2.5) = fewer signals but higher conviction.",
      "RSI Oversold/Overbought: 35/65 are moderate. Tighter (30/70) = fewer but stronger signals.",
      "BB Buy/Sell Zone: 0.2/0.8 means buy in bottom 20% of BB range, sell in top 20%. Adjust for aggression.",
      "DCA Floor: $50 per interval ensures constant accumulation. Set to 0 to disable.",
      "DCA Floor Interval: 48 candles on 1h = 2 days between floor buys.",
      "Profit Tiers 1-3: At +5%/+10%/+20% unrealized PnL, sell 33% of position each.",
      "Cooldown: 4 candles between signal buys prevents overtrading in choppy zones.",
      "Max Position: 80% keeps 20% cash reserve.",
    ],
  },
};

function StrategyExplainer({ strategyId }: { strategyId: string }) {
  const [open, setOpen] = useState(false);
  const doc = STRATEGY_DOCS[strategyId];
  if (!doc) return null;

  return (
    <div className="mt-2">
      <button
        className="btn btn-ghost btn-xs text-xs opacity-60"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide" : "How does this strategy work?"}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-base-300 rounded-lg text-sm space-y-3">
          <div>
            <div className="font-semibold text-xs opacity-50 uppercase tracking-wide mb-1">
              How it works
            </div>
            <p className="opacity-80 text-xs leading-relaxed">{doc.howItWorks}</p>
          </div>

          <div>
            <div className="font-semibold text-xs opacity-50 uppercase tracking-wide mb-1">
              Decision logic
            </div>
            <ol className="list-decimal list-inside space-y-0.5">
              {doc.logic.map((step, i) => (
                <li key={i} className="text-xs opacity-80 leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="font-semibold text-xs opacity-50 uppercase tracking-wide mb-1">
                Best for
              </div>
              <p className="text-xs opacity-80 leading-relaxed">{doc.bestFor}</p>
            </div>
            <div>
              <div className="font-semibold text-xs opacity-50 uppercase tracking-wide mb-1">
                Risks
              </div>
              <p className="text-xs opacity-80 leading-relaxed">{doc.risks}</p>
            </div>
          </div>

          <div>
            <div className="font-semibold text-xs opacity-50 uppercase tracking-wide mb-1">
              Parameter guide
            </div>
            <ul className="space-y-1">
              {doc.paramNotes.map((note, i) => (
                <li key={i} className="text-xs opacity-80 leading-relaxed">
                  <span className="font-medium opacity-100">
                    {note.split(":")[0]}:
                  </span>
                  {note.substring(note.indexOf(":") + 1)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
