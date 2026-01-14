import { db } from "../db";
import {
  historicalOhlcv,
  dataIngestionConfig,
  type DataIngestionConfig,
} from "../db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import ccxt, { type OHLCV } from "ccxt";

// ============================================================================
// CONFIGURATION
// ============================================================================

// Popular coins to track (available on Kraken)
const TRACKED_COINS = [
  "BTC/USD", // Bitcoin
  "ETH/USD", // Ethereum
  "SOL/USD", // Solana
  "XRP/USD", // Ripple
  "DOGE/USD", // Dogecoin
  "ADA/USD", // Cardano
  "AVAX/USD", // Avalanche
  "LINK/USD", // Chainlink
  "DOT/USD", // Polkadot
  "ATOM/USD", // Cosmos (replaced MATIC - not on Kraken)
];

// Default coins and timeframes to track
const DEFAULT_INGESTION_CONFIG = [
  // Daily data - ALL coins, keep forever (for long-term backtesting)
  ...TRACKED_COINS.map((symbol) => ({
    symbol,
    timeframe: "1d",
    retentionDays: null,
  })),

  // Hourly data - ALL coins, 90 days (for medium-term analysis)
  ...TRACKED_COINS.map((symbol) => ({
    symbol,
    timeframe: "1h",
    retentionDays: 90,
  })),

  // 5-minute data - ALL coins, 7 days (for real-time trading)
  ...TRACKED_COINS.map((symbol) => ({
    symbol,
    timeframe: "5m",
    retentionDays: 7,
  })),
];

// Rate limiting - be conservative with Kraken
const REQUEST_DELAY_MS = 2000; // 2 seconds between requests
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000; // 10 seconds on error

// Timeframe to milliseconds mapping
const TIMEFRAME_MS: Record<string, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

// How often to fetch each timeframe
const FETCH_INTERVALS: Record<string, number> = {
  "1m": 1 * 60 * 1000, // Every minute
  "5m": 5 * 60 * 1000, // Every 5 minutes
  "15m": 15 * 60 * 1000, // Every 15 minutes
  "1h": 60 * 60 * 1000, // Every hour
  "4h": 4 * 60 * 60 * 1000, // Every 4 hours
  "1d": 60 * 60 * 1000, // Check hourly for daily
};

// ============================================================================
// DATA INGESTION SERVICE
// ============================================================================

class DataIngestionService {
  private exchange: ccxt.Exchange | null = null;
  private isRunning = false;
  private fetchQueue: DataIngestionConfig[] = [];
  private isProcessingQueue = false;

  // ============================================================================
  // EXCHANGE CONNECTION
  // ============================================================================

  private async getExchange(): Promise<ccxt.Exchange> {
    if (this.exchange) return this.exchange;

    // Use Kraken for public data - it's reliable and has good historical data
    this.exchange = new ccxt.kraken({
      enableRateLimit: true,
      timeout: 30000,
    });

    await this.exchange.loadMarkets();
    console.log("📊 Data ingestion connected to Kraken");

    return this.exchange;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    console.log("🚀 Initializing data ingestion service...");

    // Clean up any configs for symbols not in our tracked list
    const validSymbols = new Set(TRACKED_COINS);
    const allConfigs = await db.select().from(dataIngestionConfig);

    for (const config of allConfigs) {
      if (!validSymbols.has(config.symbol)) {
        await db
          .delete(dataIngestionConfig)
          .where(eq(dataIngestionConfig.id, config.id));
        await db
          .delete(historicalOhlcv)
          .where(eq(historicalOhlcv.symbol, config.symbol));
        console.log(`🗑️ Removed invalid symbol config: ${config.symbol}`);
      }
    }

    // Create default ingestion configs if none exist
    const existing = await db.select().from(dataIngestionConfig);

    if (existing.length === 0) {
      console.log("📝 Creating default ingestion configurations...");

      for (const config of DEFAULT_INGESTION_CONFIG) {
        await db.insert(dataIngestionConfig).values({
          symbol: config.symbol,
          timeframe: config.timeframe,
          retentionDays: config.retentionDays,
          enabled: true,
        });
      }

      console.log(
        `✅ Created ${DEFAULT_INGESTION_CONFIG.length} ingestion configs`
      );
    } else {
      console.log(`📋 Found ${existing.length} existing ingestion configs`);
    }

    // Do an initial fetch for all enabled configs
    await this.fetchAll();
  }

  // ============================================================================
  // START/STOP
  // ============================================================================

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("⚠️ Data ingestion already running");
      return;
    }

    this.isRunning = true;
    console.log("▶️ Starting data ingestion scheduler...");

    // Start the scheduler loop
    this.runScheduler();
  }

  stop(): void {
    this.isRunning = false;
    console.log("⏹️ Stopping data ingestion scheduler");
  }

  private async runScheduler(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.checkAndQueueFetches();
        await this.processQueue();
      } catch (error) {
        console.error("❌ Scheduler error:", error);
      }

      // Wait 30 seconds before next check
      await this.sleep(30000);
    }
  }

  private async checkAndQueueFetches(): Promise<void> {
    const configs = await db
      .select()
      .from(dataIngestionConfig)
      .where(eq(dataIngestionConfig.enabled, true));

    const now = Date.now();

    for (const config of configs) {
      const fetchInterval = FETCH_INTERVALS[config.timeframe] || 60000;
      const lastFetch = config.lastFetchAt?.getTime() || 0;
      const timeSinceLastFetch = now - lastFetch;

      if (timeSinceLastFetch >= fetchInterval) {
        // Check if not already in queue
        const alreadyQueued = this.fetchQueue.some(
          (q) => q.symbol === config.symbol && q.timeframe === config.timeframe
        );

        if (!alreadyQueued) {
          this.fetchQueue.push(config);
        }
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.fetchQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.fetchQueue.length > 0) {
      const config = this.fetchQueue.shift()!;

      try {
        await this.fetchDataForConfig(config);
        await this.sleep(REQUEST_DELAY_MS);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const isBadSymbol =
          errorMessage.includes("does not have market symbol") ||
          errorMessage.includes("BadSymbol");

        console.error(
          `❌ Error fetching ${config.symbol} ${config.timeframe}:`,
          isBadSymbol ? `Invalid symbol - disabling` : error
        );

        // If it's an invalid symbol, disable the config permanently
        if (isBadSymbol) {
          await db
            .update(dataIngestionConfig)
            .set({
              enabled: false,
              lastError: `Invalid symbol: ${config.symbol} not available on exchange`,
              lastErrorAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(dataIngestionConfig.id, config.id));
          console.log(
            `⏸️ Disabled invalid config: ${config.symbol} ${config.timeframe}`
          );
        } else {
          // Update error count for other errors
          await db
            .update(dataIngestionConfig)
            .set({
              fetchErrorCount: config.fetchErrorCount + 1,
              lastError: errorMessage,
              lastErrorAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(dataIngestionConfig.id, config.id));
        }

        // Wait longer on error
        await this.sleep(RETRY_DELAY_MS);
      }
    }

    this.isProcessingQueue = false;
  }

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  async fetchAll(): Promise<void> {
    console.log("📊 Fetching data for all enabled configurations...");

    const configs = await db
      .select()
      .from(dataIngestionConfig)
      .where(eq(dataIngestionConfig.enabled, true));

    for (const config of configs) {
      try {
        await this.fetchDataForConfig(config);
        await this.sleep(REQUEST_DELAY_MS);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const isBadSymbol =
          errorMessage.includes("does not have market symbol") ||
          errorMessage.includes("BadSymbol");

        if (isBadSymbol) {
          // Disable invalid symbols
          await db
            .update(dataIngestionConfig)
            .set({
              enabled: false,
              lastError: `Invalid symbol: ${config.symbol} not available on exchange`,
              lastErrorAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(dataIngestionConfig.id, config.id));
          console.log(
            `⏸️ Disabled invalid config: ${config.symbol} ${config.timeframe}`
          );
        } else {
          console.error(
            `❌ Error fetching ${config.symbol} ${config.timeframe}:`,
            error
          );
        }
      }
    }

    console.log("✅ Initial fetch complete");
  }

  async fetchDataForConfig(config: DataIngestionConfig): Promise<number> {
    const exchange = await this.getExchange();

    // Find the latest data we have
    const latestData = await db
      .select()
      .from(historicalOhlcv)
      .where(
        and(
          eq(historicalOhlcv.symbol, config.symbol),
          eq(historicalOhlcv.timeframe, config.timeframe)
        )
      )
      .orderBy(desc(historicalOhlcv.timestamp))
      .limit(1);

    const lastTimestamp = latestData[0]?.timestamp?.getTime();
    const timeframeMs = TIMEFRAME_MS[config.timeframe] || 86400000;

    // Calculate since parameter
    let since: number;
    if (lastTimestamp) {
      // Fetch from the last candle we have (with overlap for safety)
      since = lastTimestamp;
    } else {
      // First fetch - get historical data based on retention
      if (config.retentionDays) {
        since = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
      } else {
        // No retention limit - get as much as we can (max ~720 candles per request)
        // For daily: ~2 years, for hourly: ~30 days, for 5m: ~2.5 days
        since = Date.now() - 720 * timeframeMs;
      }
    }

    // Fetch data
    const ohlcv = await exchange.fetchOHLCV(
      config.symbol,
      config.timeframe,
      since,
      500 // Limit per request
    );

    if (ohlcv.length === 0) {
      console.log(`📭 No new data for ${config.symbol} ${config.timeframe}`);
      await this.updateConfigStatus(config.id, 0);
      return 0;
    }

    // Filter out candles we already have
    const newCandles = lastTimestamp
      ? ohlcv.filter((c) => c[0]! > lastTimestamp)
      : ohlcv;

    if (newCandles.length === 0) {
      console.log(
        `📭 No new candles for ${config.symbol} ${config.timeframe} (already up to date)`
      );
      await this.updateConfigStatus(config.id, 0);
      return 0;
    }

    // Insert new candles - simple batch insert (duplicates already filtered above)
    const rows = newCandles.map((candle: OHLCV) => ({
      symbol: config.symbol,
      timeframe: config.timeframe,
      timestamp: new Date(candle[0]!),
      open: candle[1]!,
      high: candle[2]!,
      low: candle[3]!,
      close: candle[4]!,
      volume: candle[5]!,
    }));

    // Batch insert
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      await db.insert(historicalOhlcv).values(batch);
    }

    console.log(
      `✅ Ingested ${newCandles.length} candles for ${config.symbol} ${config.timeframe}`
    );

    // Update config status
    await this.updateConfigStatus(config.id, newCandles.length);

    // Clean old data if retention is set
    if (config.retentionDays) {
      await this.cleanOldData(
        config.symbol,
        config.timeframe,
        config.retentionDays
      );
    }

    return newCandles.length;
  }

  private async updateConfigStatus(
    configId: string,
    newCandleCount: number
  ): Promise<void> {
    const config = await db
      .select()
      .from(dataIngestionConfig)
      .where(eq(dataIngestionConfig.id, configId))
      .limit(1);

    if (!config[0]) return;

    // Get latest data timestamp
    const latest = await db
      .select()
      .from(historicalOhlcv)
      .where(
        and(
          eq(historicalOhlcv.symbol, config[0].symbol),
          eq(historicalOhlcv.timeframe, config[0].timeframe)
        )
      )
      .orderBy(desc(historicalOhlcv.timestamp))
      .limit(1);

    // Count total candles
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(historicalOhlcv)
      .where(
        and(
          eq(historicalOhlcv.symbol, config[0].symbol),
          eq(historicalOhlcv.timeframe, config[0].timeframe)
        )
      );

    await db
      .update(dataIngestionConfig)
      .set({
        lastFetchAt: new Date(),
        lastDataTimestamp: latest[0]?.timestamp || null,
        totalCandles: Number(countResult[0]?.count || 0),
        fetchErrorCount: 0, // Reset on success
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(dataIngestionConfig.id, configId));
  }

  private async cleanOldData(
    symbol: string,
    timeframe: string,
    retentionDays: number
  ): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(historicalOhlcv)
      .where(
        and(
          eq(historicalOhlcv.symbol, symbol),
          eq(historicalOhlcv.timeframe, timeframe),
          lte(historicalOhlcv.timestamp, cutoff)
        )
      )
      .returning({ id: historicalOhlcv.id });

    if (result.length > 0) {
      console.log(
        `🧹 Cleaned ${result.length} old candles for ${symbol} ${timeframe}`
      );
    }
  }

  // ============================================================================
  // BACKFILL - Fetch historical data
  // ============================================================================

  async backfill(
    symbol: string,
    timeframe: string,
    startDate: Date,
    endDate: Date = new Date()
  ): Promise<{ totalCandles: number; errors: number }> {
    console.log(
      `📜 Backfilling ${symbol} ${timeframe} from ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    const exchange = await this.getExchange();
    const timeframeMs = TIMEFRAME_MS[timeframe] || 86400000;

    let since = startDate.getTime();
    let totalCandles = 0;
    let errors = 0;

    while (since < endDate.getTime()) {
      try {
        const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, since, 500);

        if (ohlcv.length === 0) break;

        // Check for existing data
        const timestamps = ohlcv.map((c) => new Date(c[0]!));
        const existing = await db
          .select({ timestamp: historicalOhlcv.timestamp })
          .from(historicalOhlcv)
          .where(
            and(
              eq(historicalOhlcv.symbol, symbol),
              eq(historicalOhlcv.timeframe, timeframe),
              gte(historicalOhlcv.timestamp, timestamps[0]),
              lte(historicalOhlcv.timestamp, timestamps[timestamps.length - 1])
            )
          );

        const existingTimestamps = new Set(
          existing.map((e) => e.timestamp.getTime())
        );

        // Filter to only new candles
        const newCandles = ohlcv.filter((c) => !existingTimestamps.has(c[0]!));

        if (newCandles.length > 0) {
          const rows = newCandles.map((candle: OHLCV) => ({
            symbol,
            timeframe,
            timestamp: new Date(candle[0]!),
            open: candle[1]!,
            high: candle[2]!,
            low: candle[3]!,
            close: candle[4]!,
            volume: candle[5]!,
          }));

          await db.insert(historicalOhlcv).values(rows);
          totalCandles += newCandles.length;
        }

        // Move to next batch
        const lastTimestamp = ohlcv[ohlcv.length - 1][0]!;
        since = lastTimestamp + timeframeMs;

        console.log(
          `  📊 Fetched ${ohlcv.length} candles, ${
            newCandles.length
          } new (up to ${new Date(lastTimestamp).toISOString()})`
        );

        // Rate limiting
        await this.sleep(REQUEST_DELAY_MS);
      } catch (error) {
        console.error(`  ❌ Error:`, error);
        errors++;

        if (errors >= MAX_RETRIES) {
          console.error("  ⛔ Max retries reached, stopping backfill");
          break;
        }

        await this.sleep(RETRY_DELAY_MS);
      }
    }

    console.log(
      `✅ Backfill complete: ${totalCandles} candles ingested, ${errors} errors`
    );

    return { totalCandles, errors };
  }

  // ============================================================================
  // CONFIG MANAGEMENT
  // ============================================================================

  async getConfigs(): Promise<DataIngestionConfig[]> {
    return db
      .select()
      .from(dataIngestionConfig)
      .orderBy(dataIngestionConfig.symbol, dataIngestionConfig.timeframe);
  }

  async addConfig(
    symbol: string,
    timeframe: string,
    retentionDays: number | null = null
  ): Promise<DataIngestionConfig> {
    // Check if already exists
    const existing = await db
      .select()
      .from(dataIngestionConfig)
      .where(
        and(
          eq(dataIngestionConfig.symbol, symbol),
          eq(dataIngestionConfig.timeframe, timeframe)
        )
      );

    if (existing.length > 0) {
      throw new Error(`Config for ${symbol} ${timeframe} already exists`);
    }

    const [config] = await db
      .insert(dataIngestionConfig)
      .values({
        symbol,
        timeframe,
        retentionDays,
        enabled: true,
      })
      .returning();

    console.log(`➕ Added ingestion config: ${symbol} ${timeframe}`);

    return config;
  }

  async toggleConfig(id: string, enabled: boolean): Promise<void> {
    await db
      .update(dataIngestionConfig)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(dataIngestionConfig.id, id));

    console.log(
      `${enabled ? "✅" : "⏸️"} Config ${id} ${
        enabled ? "enabled" : "disabled"
      }`
    );
  }

  async deleteConfig(id: string): Promise<void> {
    await db.delete(dataIngestionConfig).where(eq(dataIngestionConfig.id, id));

    console.log(`🗑️ Deleted config ${id}`);
  }

  async deleteConfigsBySymbol(symbol: string): Promise<number> {
    const result = await db
      .delete(dataIngestionConfig)
      .where(eq(dataIngestionConfig.symbol, symbol))
      .returning({ id: dataIngestionConfig.id });

    console.log(`🗑️ Deleted ${result.length} configs for ${symbol}`);
    return result.length;
  }

  async deleteDataBySymbol(symbol: string): Promise<number> {
    const result = await db
      .delete(historicalOhlcv)
      .where(eq(historicalOhlcv.symbol, symbol))
      .returning({ id: historicalOhlcv.id });

    console.log(`🗑️ Deleted ${result.length} data points for ${symbol}`);
    return result.length;
  }

  // ============================================================================
  // STATUS
  // ============================================================================

  async getStatus(): Promise<{
    isRunning: boolean;
    queueLength: number;
    configs: Array<{
      symbol: string;
      timeframe: string;
      enabled: boolean;
      totalCandles: number;
      lastFetch: Date | null;
      lastData: Date | null;
      hasError: boolean;
    }>;
  }> {
    const configs = await this.getConfigs();

    return {
      isRunning: this.isRunning,
      queueLength: this.fetchQueue.length,
      configs: configs.map((c) => ({
        symbol: c.symbol,
        timeframe: c.timeframe,
        enabled: c.enabled,
        totalCandles: c.totalCandles,
        lastFetch: c.lastFetchAt,
        lastData: c.lastDataTimestamp,
        hasError: !!c.lastError,
      })),
    };
  }

  // ============================================================================
  // DATA ACCESS
  // ============================================================================

  async getDataSummary(): Promise<
    Array<{
      symbol: string;
      timeframe: string;
      count: number;
      firstCandle: Date | null;
      lastCandle: Date | null;
      enabled: boolean;
      lastFetch: Date | null;
    }>
  > {
    const configs = await this.getConfigs();
    const results = [];

    for (const config of configs) {
      const [stats] = await db
        .select({
          count: sql<number>`count(*)`,
          firstCandle: sql<Date>`min(timestamp)`,
          lastCandle: sql<Date>`max(timestamp)`,
        })
        .from(historicalOhlcv)
        .where(
          and(
            eq(historicalOhlcv.symbol, config.symbol),
            eq(historicalOhlcv.timeframe, config.timeframe)
          )
        );

      results.push({
        symbol: config.symbol,
        timeframe: config.timeframe,
        count: Number(stats?.count || 0),
        firstCandle: stats?.firstCandle || null,
        lastCandle: stats?.lastCandle || null,
        enabled: config.enabled,
        lastFetch: config.lastFetchAt,
      });
    }

    return results;
  }

  async getHistoricalData(
    symbol: string,
    timeframe: string,
    limit: number = 100,
    startDate?: Date,
    endDate?: Date
  ): Promise<
    Array<{
      timestamp: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>
  > {
    // Use a subquery with DISTINCT ON to avoid duplicates
    const result = await db
      .selectDistinctOn([historicalOhlcv.timestamp], {
        timestamp: historicalOhlcv.timestamp,
        open: historicalOhlcv.open,
        high: historicalOhlcv.high,
        low: historicalOhlcv.low,
        close: historicalOhlcv.close,
        volume: historicalOhlcv.volume,
      })
      .from(historicalOhlcv)
      .where(
        and(
          eq(historicalOhlcv.symbol, symbol),
          eq(historicalOhlcv.timeframe, timeframe),
          startDate ? gte(historicalOhlcv.timestamp, startDate) : undefined,
          endDate ? lte(historicalOhlcv.timestamp, endDate) : undefined
        )
      )
      .orderBy(desc(historicalOhlcv.timestamp))
      .limit(limit);

    return result;
  }

  // Clean up duplicate entries in the database
  async cleanupDuplicates(): Promise<number> {
    console.log("🧹 Cleaning up duplicate OHLCV entries...");

    // Delete duplicates keeping the first entry for each symbol/timeframe/timestamp
    const result = await db.execute(sql`
      DELETE FROM historical_ohlcv a
      USING historical_ohlcv b
      WHERE a.id > b.id
        AND a.symbol = b.symbol
        AND a.timeframe = b.timeframe
        AND a.timestamp = b.timestamp
    `);

    const deletedCount = Number(result.rowCount || 0);
    console.log(`✅ Removed ${deletedCount} duplicate entries`);

    return deletedCount;
  }

  async getAvailableSymbols(): Promise<string[]> {
    const result = await db
      .selectDistinct({ symbol: historicalOhlcv.symbol })
      .from(historicalOhlcv)
      .orderBy(historicalOhlcv.symbol);

    return result.map((r) => r.symbol);
  }

  async getAvailableTimeframes(symbol: string): Promise<string[]> {
    const result = await db
      .selectDistinct({ timeframe: historicalOhlcv.timeframe })
      .from(historicalOhlcv)
      .where(eq(historicalOhlcv.symbol, symbol))
      .orderBy(historicalOhlcv.timeframe);

    return result.map((r) => r.timeframe);
  }

  // ============================================================================
  // UTILS
  // ============================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const dataIngestionService = new DataIngestionService();
