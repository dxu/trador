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
