import {
  pgTable,
  text,
  timestamp,
  real,
  integer,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";

// ============================================================================
// HISTORICAL OHLCV DATA
// ============================================================================

export const historicalOhlcv = pgTable("historical_ohlcv", {
  id: uuid("id").defaultRandom().primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),

  timestamp: timestamp("timestamp").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: real("volume").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type HistoricalOhlcv = typeof historicalOhlcv.$inferSelect;
export type NewHistoricalOhlcv = typeof historicalOhlcv.$inferInsert;

// ============================================================================
// DATA INGESTION CONFIG
// ============================================================================

export const dataIngestionConfig = pgTable("data_ingestion_config", {
  id: uuid("id").defaultRandom().primaryKey(),

  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),

  enabled: boolean("enabled").notNull().default(true),
  lastFetchAt: timestamp("last_fetch_at"),
  lastDataTimestamp: timestamp("last_data_timestamp"),

  retentionDays: integer("retention_days"),

  totalCandles: integer("total_candles").notNull().default(0),
  fetchErrorCount: integer("fetch_error_count").notNull().default(0),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DataIngestionConfig = typeof dataIngestionConfig.$inferSelect;
export type NewDataIngestionConfig = typeof dataIngestionConfig.$inferInsert;

// ============================================================================
// BACKTEST RUNS
// ============================================================================

export const backtestRuns = pgTable("backtest_runs", {
  id: uuid("id").defaultRandom().primaryKey(),

  strategySlug: text("strategy_slug").notNull(),
  strategyParams: text("strategy_params").notNull(), // JSON snapshot
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),

  initialCapital: real("initial_capital").notNull(),
  finalValue: real("final_value"),
  totalReturn: real("total_return"),
  maxDrawdown: real("max_drawdown"),
  sharpeRatio: real("sharpe_ratio"),
  winRate: real("win_rate"),
  totalTrades: integer("total_trades"),
  buyHoldReturn: real("buy_hold_return"),
  timeLocked: integer("time_locked"),

  status: text("status").notNull().default("running"), // running | completed | failed
  error: text("error"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BacktestRun = typeof backtestRuns.$inferSelect;
export type NewBacktestRun = typeof backtestRuns.$inferInsert;

// ============================================================================
// BACKTEST TRADES
// ============================================================================

export const backtestTrades = pgTable("backtest_trades", {
  id: uuid("id").defaultRandom().primaryKey(),

  backtestId: uuid("backtest_id")
    .notNull()
    .references(() => backtestRuns.id, { onDelete: "cascade" }),

  timestamp: timestamp("timestamp").notNull(),
  side: text("side").notNull(), // buy | sell
  price: real("price").notNull(),
  amount: real("amount").notNull(), // crypto amount
  cost: real("cost").notNull(), // USD cost/proceeds
  fee: real("fee").notNull(),
  reason: text("reason").notNull(),

  portfolioValueAfter: real("portfolio_value_after").notNull(),
  avgEntryAfter: real("avg_entry_after").notNull(),
  avgEntryBefore: real("avg_entry_before"),
});

export type BacktestTrade = typeof backtestTrades.$inferSelect;
export type NewBacktestTrade = typeof backtestTrades.$inferInsert;

// ============================================================================
// BACKTEST SNAPSHOTS (equity curve)
// ============================================================================

export const backtestSnapshots = pgTable("backtest_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),

  backtestId: uuid("backtest_id")
    .notNull()
    .references(() => backtestRuns.id, { onDelete: "cascade" }),

  timestamp: timestamp("timestamp").notNull(),
  portfolioValue: real("portfolio_value").notNull(),
  cashBalance: real("cash_balance").notNull(),
  cryptoValue: real("crypto_value").notNull(),
  cryptoAmount: real("crypto_amount").notNull(),
  drawdownPercent: real("drawdown_percent").notNull(),
});

export type BacktestSnapshot = typeof backtestSnapshots.$inferSelect;
export type NewBacktestSnapshot = typeof backtestSnapshots.$inferInsert;
