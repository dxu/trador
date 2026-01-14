import {
  pgTable,
  text,
  timestamp,
  real,
  integer,
  boolean,
  uuid,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";

// ============================================================================
// ENUMS
// ============================================================================

export const marketRegimeEnum = pgEnum("market_regime", [
  "extreme_fear", // Deep bear - aggressive accumulation
  "fear", // Bear market - regular DCA
  "neutral", // Sideways - hold, no action
  "greed", // Bull market - consider taking profits
  "extreme_greed", // Euphoria - actively distribute
]);

export const botStatusEnum = pgEnum("bot_status", [
  "running",
  "paused",
  "stopped",
  "error",
]);
export const actionTypeEnum = pgEnum("action_type", ["buy", "sell", "hold"]);
export const positionStatusEnum = pgEnum("position_status", [
  "open",
  "partial",
  "closed",
]);
export const riskProfileEnum = pgEnum("risk_profile", [
  "conservative",
  "moderate",
  "aggressive",
]);

// ============================================================================
// GLOBAL BOT CONFIG (shared settings)
// ============================================================================

export const botConfig = pgTable("bot_config", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Global settings
  symbol: text("symbol").notNull().default("BTC/USDT"),
  status: botStatusEnum("status").notNull().default("stopped"),
  enabled: boolean("enabled").notNull().default(true),

  // Safety settings
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at"),
  consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  maxConsecutiveErrors: integer("max_consecutive_errors").notNull().default(5),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// STRATEGIES (multiple risk profiles)
// ============================================================================

export const strategies = pgTable("strategies", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Identity
  name: text("name").notNull(),
  riskProfile: riskProfileEnum("risk_profile").notNull(),
  enabled: boolean("enabled").notNull().default(true),

  // Portfolio allocation (% of total capital for this strategy)
  allocationPercent: real("allocation_percent").notNull(),

  // DCA settings (accumulation phase)
  dcaAmountUsdt: real("dca_amount_usdt").notNull(),
  dcaFrequencyHours: integer("dca_frequency_hours").notNull(),
  maxPositionUsdt: real("max_position_usdt").notNull(),

  // Profit taking settings (distribution phase)
  minProfitToSell: real("min_profit_to_sell").notNull(),
  sellPercentage: real("sell_percentage").notNull(),

  // Regime detection thresholds (can customize per strategy)
  fearThreshold: real("fear_threshold").notNull().default(-30),
  extremeFearThreshold: real("extreme_fear_threshold").notNull().default(-50),
  greedRsiThreshold: real("greed_rsi_threshold").notNull().default(70),
  extremeGreedRsiThreshold: real("extreme_greed_rsi_threshold")
    .notNull()
    .default(85),

  // Tracking
  lastDcaAt: timestamp("last_dca_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// MARKET DATA
// ============================================================================

export const marketSnapshots = pgTable("market_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  symbol: text("symbol").notNull(),

  // Price data
  price: real("price").notNull(),
  priceHigh24h: real("price_high_24h"),
  priceLow24h: real("price_low_24h"),
  volume24h: real("volume_24h"),

  // Technical indicators
  ma200: real("ma_200"),
  ma50: real("ma_50"),
  rsi14: real("rsi_14"),

  // ATH tracking
  allTimeHigh: real("all_time_high"),
  percentFromAth: real("percent_from_ath"),
  daysSinceAth: integer("days_since_ath"),

  // Calculated regime
  regime: marketRegimeEnum("regime").notNull(),
  regimeScore: real("regime_score"),

  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
});

// ============================================================================
// POSITIONS & TRADES (per strategy)
// ============================================================================

export const positions = pgTable("positions", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyId: uuid("strategy_id").references(() => strategies.id),
  symbol: text("symbol").notNull(),
  status: positionStatusEnum("status").notNull().default("open"),

  // Position details
  totalAmount: real("total_amount").notNull().default(0),
  totalCostUsdt: real("total_cost_usdt").notNull().default(0),
  averageEntryPrice: real("average_entry_price"),

  // Realized P&L
  realizedProfitUsdt: real("realized_profit_usdt").notNull().default(0),
  realizedProfitPercent: real("realized_profit_percent"),

  // Tracking
  totalBuys: integer("total_buys").notNull().default(0),
  totalSells: integer("total_sells").notNull().default(0),
  firstBuyAt: timestamp("first_buy_at"),
  lastActivityAt: timestamp("last_activity_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  positionId: uuid("position_id").references(() => positions.id),
  strategyId: uuid("strategy_id").references(() => strategies.id),
  symbol: text("symbol").notNull(),

  // Transaction details
  action: actionTypeEnum("action").notNull(),
  amount: real("amount").notNull(),
  price: real("price").notNull(),
  valueUsdt: real("value_usdt").notNull(),
  fee: real("fee").default(0),

  // Context
  regime: marketRegimeEnum("regime"),
  regimeScore: real("regime_score"),
  reason: text("reason"),

  // For sells: track profit
  costBasisUsdt: real("cost_basis_usdt"),
  profitUsdt: real("profit_usdt"),
  profitPercent: real("profit_percent"),

  // Exchange data
  exchangeOrderId: text("exchange_order_id"),
  executedAt: timestamp("executed_at").defaultNow().notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// BOT ACTIVITY LOG
// ============================================================================

export const botLogs = pgTable("bot_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyId: uuid("strategy_id").references(() => strategies.id),

  level: text("level").notNull().default("info"),
  category: text("category").notNull(),
  message: text("message").notNull(),

  data: jsonb("data"),
  regime: marketRegimeEnum("regime"),
  price: real("price"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// PERFORMANCE TRACKING (per strategy + combined)
// ============================================================================

export const performanceSnapshots = pgTable("performance_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyId: uuid("strategy_id").references(() => strategies.id), // null = combined total

  // Portfolio value
  totalValueUsdt: real("total_value_usdt").notNull(),
  totalCostBasisUsdt: real("total_cost_basis_usdt").notNull(),
  cashUsdt: real("cash_usdt").notNull().default(0),

  // Holdings
  cryptoAmount: real("crypto_amount").notNull(),
  cryptoValueUsdt: real("crypto_value_usdt").notNull(),
  currentPrice: real("current_price").notNull(),

  // Performance
  unrealizedProfitUsdt: real("unrealized_profit_usdt"),
  unrealizedProfitPercent: real("unrealized_profit_percent"),
  realizedProfitUsdt: real("realized_profit_usdt").notNull().default(0),
  totalProfitUsdt: real("total_profit_usdt"),
  totalProfitPercent: real("total_profit_percent"),

  // Market context
  regime: marketRegimeEnum("regime"),
  regimeScore: real("regime_score"),

  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
});

// ============================================================================
// TYPES
// ============================================================================

export type BotConfig = typeof botConfig.$inferSelect;
export type NewBotConfig = typeof botConfig.$inferInsert;
export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;
export type MarketSnapshot = typeof marketSnapshots.$inferSelect;
export type NewMarketSnapshot = typeof marketSnapshots.$inferInsert;
export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type BotLog = typeof botLogs.$inferSelect;
export type NewBotLog = typeof botLogs.$inferInsert;
export type PerformanceSnapshot = typeof performanceSnapshots.$inferSelect;
export type NewPerformanceSnapshot = typeof performanceSnapshots.$inferInsert;

export type MarketRegime =
  | "extreme_fear"
  | "fear"
  | "neutral"
  | "greed"
  | "extreme_greed";
export type ActionType = "buy" | "sell" | "hold";
export type RiskProfile = "conservative" | "moderate" | "aggressive";

// ============================================================================
// DEFAULT STRATEGY PRESETS
// ============================================================================

// ============================================================================
// BACKTESTING
// ============================================================================

export const historicalOhlcv = pgTable("historical_ohlcv", {
  id: uuid("id").defaultRandom().primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(), // '1d', '4h', '1h', etc.

  timestamp: timestamp("timestamp").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: real("volume").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const backtestStatusEnum = pgEnum("backtest_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const backtests = pgTable("backtests", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Config
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  initialCapital: real("initial_capital").notNull().default(1000),

  // Strategy params (snapshot of what was used)
  strategyParams: jsonb("strategy_params").notNull(),
  riskProfile: riskProfileEnum("risk_profile"),

  // Status
  status: backtestStatusEnum("status").notNull().default("pending"),
  progress: integer("progress").default(0),
  error: text("error"),

  // Results
  finalCapital: real("final_capital"),
  totalReturn: real("total_return"), // percentage
  totalReturnUsdt: real("total_return_usdt"),
  maxDrawdown: real("max_drawdown"),
  sharpeRatio: real("sharpe_ratio"),
  winRate: real("win_rate"),
  totalTrades: integer("total_trades"),
  profitableTrades: integer("profitable_trades"),
  avgTradeReturn: real("avg_trade_return"),
  avgWinSize: real("avg_win_size"),
  avgLossSize: real("avg_loss_size"),

  // Benchmark comparison
  buyAndHoldReturn: real("buy_and_hold_return"),
  outperformance: real("outperformance"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const backtestTrades = pgTable("backtest_trades", {
  id: uuid("id").defaultRandom().primaryKey(),
  backtestId: uuid("backtest_id")
    .references(() => backtests.id)
    .notNull(),

  action: actionTypeEnum("action").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  price: real("price").notNull(),
  amount: real("amount").notNull(),
  valueUsdt: real("value_usdt").notNull(),
  fee: real("fee").default(0),

  // Context at time of trade
  regime: marketRegimeEnum("regime"),
  regimeScore: real("regime_score"),
  rsi: real("rsi"),
  percentFromAth: real("percent_from_ath"),
  reason: text("reason"),

  // For sells
  costBasis: real("cost_basis"),
  profitUsdt: real("profit_usdt"),
  profitPercent: real("profit_percent"),

  // Running totals
  portfolioValue: real("portfolio_value"),
  cashBalance: real("cash_balance"),
  cryptoBalance: real("crypto_balance"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const backtestSnapshots = pgTable("backtest_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  backtestId: uuid("backtest_id")
    .references(() => backtests.id)
    .notNull(),

  timestamp: timestamp("timestamp").notNull(),
  price: real("price").notNull(),
  portfolioValue: real("portfolio_value").notNull(),
  cashBalance: real("cash_balance").notNull(),
  cryptoBalance: real("crypto_balance").notNull(),
  cryptoValue: real("crypto_value").notNull(),

  regime: marketRegimeEnum("regime"),
  regimeScore: real("regime_score"),
  rsi: real("rsi"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Backtest types
export type HistoricalOhlcv = typeof historicalOhlcv.$inferSelect;
export type NewHistoricalOhlcv = typeof historicalOhlcv.$inferInsert;
export type Backtest = typeof backtests.$inferSelect;
export type NewBacktest = typeof backtests.$inferInsert;
export type BacktestTrade = typeof backtestTrades.$inferSelect;
export type NewBacktestTrade = typeof backtestTrades.$inferInsert;
export type BacktestSnapshot = typeof backtestSnapshots.$inferSelect;
export type NewBacktestSnapshot = typeof backtestSnapshots.$inferInsert;

// ============================================================================
// DATA INGESTION CONFIG
// ============================================================================

export const dataIngestionConfig = pgTable("data_ingestion_config", {
  id: uuid("id").defaultRandom().primaryKey(),

  // What to ingest
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(), // '1d', '1h', '5m', etc.

  // Status
  enabled: boolean("enabled").notNull().default(true),
  lastFetchAt: timestamp("last_fetch_at"),
  lastDataTimestamp: timestamp("last_data_timestamp"), // Most recent candle we have

  // Retention settings
  retentionDays: integer("retention_days"), // null = keep forever

  // Stats
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
// DEFAULT STRATEGY PRESETS
// ============================================================================

export const STRATEGY_PRESETS: Record<
  RiskProfile,
  Omit<NewStrategy, "id" | "createdAt" | "updatedAt">
> = {
  conservative: {
    name: "🐢 Conservative",
    riskProfile: "conservative",
    enabled: true,
    allocationPercent: 30,
    dcaAmountUsdt: 30,
    dcaFrequencyHours: 48, // DCA every 2 days
    maxPositionUsdt: 1500,
    minProfitToSell: 20, // Wait for 20% profit
    sellPercentage: 15, // Sell 15% at a time
    fearThreshold: -40, // Need deeper fear to buy
    extremeFearThreshold: -60,
    greedRsiThreshold: 75, // Need higher RSI to sell
    extremeGreedRsiThreshold: 88,
  },
  moderate: {
    name: "⚖️ Moderate",
    riskProfile: "moderate",
    enabled: true,
    allocationPercent: 40,
    dcaAmountUsdt: 50,
    dcaFrequencyHours: 24, // DCA daily
    maxPositionUsdt: 2000,
    minProfitToSell: 10, // 10% profit threshold
    sellPercentage: 20, // Sell 20% at a time
    fearThreshold: -30,
    extremeFearThreshold: -50,
    greedRsiThreshold: 70,
    extremeGreedRsiThreshold: 85,
  },
  aggressive: {
    name: "🚀 Aggressive",
    riskProfile: "aggressive",
    enabled: true,
    allocationPercent: 30,
    dcaAmountUsdt: 75,
    dcaFrequencyHours: 12, // DCA twice daily
    maxPositionUsdt: 1500,
    minProfitToSell: 5, // Take profits at 5%
    sellPercentage: 25, // Sell 25% at a time
    fearThreshold: -20, // Buy on smaller dips
    extremeFearThreshold: -40,
    greedRsiThreshold: 65, // Start selling earlier
    extremeGreedRsiThreshold: 80,
  },
};
