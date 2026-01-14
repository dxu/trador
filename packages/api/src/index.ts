import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
// Static files are served manually below
import { desc, eq, and, isNull, sql } from "drizzle-orm";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// In Docker: __dirname = /app/packages/api/src, dist is at /app/packages/web/dist
const DIST_PATH = resolve(__dirname, "../../web/dist");

console.log("📁 Static files path:", DIST_PATH);
import { createHash, randomBytes } from "crypto";

// ============================================================================
// AUTHENTICATION
// ============================================================================

const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "changeme";
const SESSION_SECRET =
  process.env.SESSION_SECRET || randomBytes(32).toString("hex");

// Store active sessions (in production, use Redis or DB)
const activeSessions = new Map<string, { createdAt: Date; expiresAt: Date }>();

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function hashPassword(password: string): string {
  return createHash("sha256")
    .update(password + SESSION_SECRET)
    .digest("hex");
}

function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (new Date() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = new Date();
  for (const [token, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(token);
    }
  }
}, 60000); // Every minute
import {
  db,
  botConfig,
  strategies,
  positions,
  transactions,
  botLogs,
  marketSnapshots,
  performanceSnapshots,
} from "./db";
import { tradingBot } from "./services/tradingBot";
import { exchangeService } from "./services/exchange";
import { marketAnalysisService } from "./services/marketAnalysis";
import { backtestService } from "./services/backtestService";
import { dataIngestionService } from "./services/dataIngestionService";

const app = new Elysia()
  .use(cors())
  // Static files served via explicit routes below

  // ============================================================================
  // AUTHENTICATION ROUTES (unprotected)
  // ============================================================================

  .post(
    "/api/auth/login",
    async ({ body }) => {
      if (body.password === AUTH_PASSWORD) {
        const token = generateToken();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        activeSessions.set(token, { createdAt: now, expiresAt });

        console.log(`🔐 New login session created`);
        return { success: true, token, expiresAt: expiresAt.toISOString() };
      }
      return { success: false, error: "Invalid password" };
    },
    {
      body: t.Object({
        password: t.String(),
      }),
    }
  )

  .post("/api/auth/logout", async ({ headers }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    if (token) {
      activeSessions.delete(token);
      console.log(`🔓 Session logged out`);
    }
    return { success: true };
  })

  .get("/api/auth/check", async ({ headers }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    const valid = isValidSession(token);
    return { authenticated: valid };
  })

  // ============================================================================
  // AUTH MIDDLEWARE (protects all routes below)
  // ============================================================================

  .derive(({ headers, path }) => {
    // Skip auth for auth routes, health check, and static files
    if (
      path.startsWith("/api/auth/") ||
      path === "/api/health" ||
      !path.startsWith("/api/")
    ) {
      return { authenticated: true };
    }

    const token = headers.authorization?.replace("Bearer ", "");
    const authenticated = isValidSession(token);

    if (!authenticated) {
      throw new Error("Unauthorized");
    }

    return { authenticated };
  })

  .onError(({ error, set }) => {
    if (error.message === "Unauthorized") {
      set.status = 401;
      return { error: "Unauthorized", message: "Please login to continue" };
    }
  })

  // ============================================================================
  // HEALTH & STATUS
  // ============================================================================

  .get("/api/health", async () => {
    const exchangeHealth = await exchangeService.healthCheck();
    const botStatus = tradingBot.getStatus();

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      bot: botStatus.status,
      exchange: exchangeHealth,
    };
  })

  // ============================================================================
  // BOT CONTROL
  // ============================================================================

  .get("/api/bot/status", async () => {
    return tradingBot.getStatus();
  })

  .post("/api/bot/start", async () => {
    await tradingBot.start();
    return { success: true, message: "Bot started" };
  })

  .post("/api/bot/stop", async () => {
    await tradingBot.stop();
    return { success: true, message: "Bot stopped" };
  })

  .post("/api/bot/pause", async () => {
    await tradingBot.pause();
    return { success: true, message: "Bot paused" };
  })

  .post("/api/bot/run-cycle", async () => {
    await tradingBot.runManualCycle();
    return { success: true, message: "Manual cycle executed" };
  })

  // ============================================================================
  // BOT CONFIGURATION
  // ============================================================================

  .get("/api/bot/config", async () => {
    const config = tradingBot.getConfig();
    if (!config) {
      await tradingBot.initialize();
    }
    return tradingBot.getConfig();
  })

  .put(
    "/api/bot/config",
    async ({ body }) => {
      const updated = await tradingBot.updateConfig(body as any);
      return updated;
    },
    {
      body: t.Object({
        symbol: t.Optional(t.String()),
      }),
    }
  )

  // ============================================================================
  // STRATEGIES
  // ============================================================================

  .get("/api/strategies", async () => {
    return await tradingBot.getStrategies();
  })

  .get("/api/strategies/:id", async ({ params }) => {
    const [strategy] = await db
      .select()
      .from(strategies)
      .where(eq(strategies.id, params.id))
      .limit(1);

    if (!strategy) {
      throw new Error("Strategy not found");
    }

    // Get position for this strategy
    const [position] = await db
      .select()
      .from(positions)
      .where(
        and(eq(positions.strategyId, params.id), eq(positions.status, "open"))
      )
      .limit(1);

    return { strategy, position };
  })

  .put(
    "/api/strategies/:id",
    async ({ params, body }) => {
      return await tradingBot.updateStrategy(params.id, body as any);
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        enabled: t.Optional(t.Boolean()),
        allocationPercent: t.Optional(t.Number()),
        dcaAmountUsdt: t.Optional(t.Number()),
        dcaFrequencyHours: t.Optional(t.Number()),
        maxPositionUsdt: t.Optional(t.Number()),
        minProfitToSell: t.Optional(t.Number()),
        sellPercentage: t.Optional(t.Number()),
        fearThreshold: t.Optional(t.Number()),
        extremeFearThreshold: t.Optional(t.Number()),
        greedRsiThreshold: t.Optional(t.Number()),
        extremeGreedRsiThreshold: t.Optional(t.Number()),
      }),
    }
  )

  .post(
    "/api/strategies/:id/toggle",
    async ({ params, body }) => {
      return await tradingBot.toggleStrategy(params.id, body.enabled);
    },
    {
      body: t.Object({
        enabled: t.Boolean(),
      }),
    }
  )

  // ============================================================================
  // MARKET ANALYSIS
  // ============================================================================

  .get(
    "/api/market/analysis",
    async ({ query }) => {
      const symbol = query.symbol || "BTC/USDT";
      const analysis = await marketAnalysisService.analyze(symbol);
      return analysis;
    },
    {
      query: t.Object({
        symbol: t.Optional(t.String()),
      }),
    }
  )

  .get(
    "/api/market/snapshots",
    async ({ query }) => {
      const symbol = query.symbol || "BTC/USDT";
      const days = parseInt(query.days || "30");
      const snapshots = await marketAnalysisService.getRegimeHistory(
        symbol,
        days
      );
      return snapshots;
    },
    {
      query: t.Object({
        symbol: t.Optional(t.String()),
        days: t.Optional(t.String()),
      }),
    }
  )

  .get(
    "/api/market/current-price",
    async ({ query }) => {
      const symbol = query.symbol || "BTC/USDT";
      try {
        const ticker = await exchangeService.getTicker(symbol);
        return {
          symbol,
          price: ticker.last,
          high24h: ticker.high,
          low24h: ticker.low,
          change24h: ticker.percentage,
          volume24h: ticker.quoteVolume,
        };
      } catch (error) {
        return { error: "Failed to fetch price", symbol };
      }
    },
    {
      query: t.Object({
        symbol: t.Optional(t.String()),
      }),
    }
  )

  // ============================================================================
  // POSITIONS (per strategy and combined)
  // ============================================================================

  .get("/api/positions", async () => {
    const allPositions = await db
      .select()
      .from(positions)
      .orderBy(desc(positions.updatedAt));
    return allPositions;
  })

  .get("/api/positions/by-strategy", async () => {
    const allStrategies = await db.select().from(strategies);
    const config = tradingBot.getConfig();
    const symbol = config?.symbol || "BTC/USDT";

    let currentPrice = 0;
    try {
      const ticker = await exchangeService.getTicker(symbol);
      currentPrice = ticker.last || 0;
    } catch (e) {}

    const result = [];

    for (const strategy of allStrategies) {
      const [position] = await db
        .select()
        .from(positions)
        .where(
          and(
            eq(positions.strategyId, strategy.id),
            eq(positions.status, "open")
          )
        )
        .limit(1);

      const currentValue = (position?.totalAmount || 0) * currentPrice;
      const unrealizedPnl = currentValue - (position?.totalCostUsdt || 0);
      const unrealizedPnlPercent =
        position?.totalCostUsdt && position.totalCostUsdt > 0
          ? (unrealizedPnl / position.totalCostUsdt) * 100
          : 0;

      result.push({
        strategy,
        position: position || null,
        currentPrice,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPercent,
      });
    }

    return result;
  })

  .get("/api/positions/combined", async () => {
    const config = tradingBot.getConfig();
    const symbol = config?.symbol || "BTC/USDT";

    let currentPrice = 0;
    try {
      const ticker = await exchangeService.getTicker(symbol);
      currentPrice = ticker.last || 0;
    } catch (e) {}

    const openPositions = await db
      .select()
      .from(positions)
      .where(eq(positions.status, "open"));

    let totalAmount = 0;
    let totalCost = 0;
    let totalRealized = 0;

    for (const pos of openPositions) {
      totalAmount += pos.totalAmount;
      totalCost += pos.totalCostUsdt;
      totalRealized += pos.realizedProfitUsdt;
    }

    const totalValue = totalAmount * currentPrice;
    const unrealizedPnl = totalValue - totalCost;

    return {
      symbol,
      totalAmount,
      totalCostUsdt: totalCost,
      currentPrice,
      currentValue: totalValue,
      unrealizedPnl,
      unrealizedPnlPercent:
        totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0,
      realizedProfitUsdt: totalRealized,
      totalPnl: unrealizedPnl + totalRealized,
    };
  })

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================

  .get(
    "/api/transactions",
    async ({ query }) => {
      const limit = parseInt(query.limit || "50");
      const action = query.action;
      const strategyId = query.strategyId;

      let conditions = [];
      if (action && action !== "all") {
        conditions.push(eq(transactions.action, action as any));
      }
      if (strategyId) {
        conditions.push(eq(transactions.strategyId, strategyId));
      }

      const results = await db
        .select()
        .from(transactions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(transactions.executedAt))
        .limit(limit);

      return results;
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        action: t.Optional(t.String()),
        strategyId: t.Optional(t.String()),
      }),
    }
  )

  .get(
    "/api/transactions/stats",
    async ({ query }) => {
      const strategyId = query.strategyId;

      let conditions = [];
      if (strategyId) {
        conditions.push(eq(transactions.strategyId, strategyId));
      }

      const allTx = await db
        .select()
        .from(transactions)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const buys = allTx.filter((t) => t.action === "buy");
      const sells = allTx.filter((t) => t.action === "sell");

      const totalInvested = buys.reduce((sum, t) => sum + t.valueUsdt, 0);
      const totalSold = sells.reduce((sum, t) => sum + t.valueUsdt, 0);
      const totalFees = allTx.reduce((sum, t) => sum + (t.fee || 0), 0);
      const realizedProfit = sells.reduce(
        (sum, t) => sum + (t.profitUsdt || 0),
        0
      );

      const profitableSells = sells.filter((t) => (t.profitUsdt || 0) > 0);
      const winRate =
        sells.length > 0 ? (profitableSells.length / sells.length) * 100 : 0;

      return {
        totalTransactions: allTx.length,
        totalBuys: buys.length,
        totalSells: sells.length,
        totalInvested,
        totalSold,
        totalFees,
        realizedProfit,
        winRate,
        avgBuySize: buys.length > 0 ? totalInvested / buys.length : 0,
        avgSellSize: sells.length > 0 ? totalSold / sells.length : 0,
      };
    },
    {
      query: t.Object({
        strategyId: t.Optional(t.String()),
      }),
    }
  )

  // ============================================================================
  // PERFORMANCE
  // ============================================================================

  .get(
    "/api/performance/history",
    async ({ query }) => {
      const limit = parseInt(query.limit || "100");
      const strategyId = query.strategyId;

      let conditions = [];
      if (strategyId === "combined" || !strategyId) {
        conditions.push(isNull(performanceSnapshots.strategyId));
      } else {
        conditions.push(eq(performanceSnapshots.strategyId, strategyId));
      }

      const results = await db
        .select()
        .from(performanceSnapshots)
        .where(and(...conditions))
        .orderBy(desc(performanceSnapshots.snapshotAt))
        .limit(limit);

      return results.reverse();
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        strategyId: t.Optional(t.String()),
      }),
    }
  )

  .get("/api/performance/current", async () => {
    const [latest] = await db
      .select()
      .from(performanceSnapshots)
      .where(isNull(performanceSnapshots.strategyId))
      .orderBy(desc(performanceSnapshots.snapshotAt))
      .limit(1);

    return (
      latest || {
        totalValueUsdt: 0,
        totalCostBasisUsdt: 0,
        cryptoAmount: 0,
        cryptoValueUsdt: 0,
        unrealizedProfitUsdt: 0,
        unrealizedProfitPercent: 0,
        realizedProfitUsdt: 0,
        totalProfitUsdt: 0,
        totalProfitPercent: 0,
      }
    );
  })

  // ============================================================================
  // BOT LOGS
  // ============================================================================

  .get(
    "/api/logs",
    async ({ query }) => {
      const limit = parseInt(query.limit || "100");
      const level = query.level;
      const category = query.category;
      const strategyId = query.strategyId;

      let conditions = [];
      if (level && level !== "all") {
        conditions.push(eq(botLogs.level, level));
      }
      if (category && category !== "all") {
        conditions.push(eq(botLogs.category, category));
      }
      if (strategyId) {
        conditions.push(eq(botLogs.strategyId, strategyId));
      }

      const results = await db
        .select()
        .from(botLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(botLogs.createdAt))
        .limit(limit);

      return results;
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        level: t.Optional(t.String()),
        category: t.Optional(t.String()),
        strategyId: t.Optional(t.String()),
      }),
    }
  )

  // ============================================================================
  // DASHBOARD SUMMARY
  // ============================================================================

  .get("/api/dashboard", async () => {
    const botStatus = tradingBot.getStatus();
    const config = botStatus.config;
    const symbol = config?.symbol || "BTC/USDT";

    // Get market analysis
    let analysis = null;
    try {
      analysis = await marketAnalysisService.analyze(symbol);
    } catch (e) {
      console.error("Failed to get market analysis:", e);
    }

    // Get all strategies with their positions
    const allStrategies = await db.select().from(strategies);
    const strategiesWithPositions = [];

    let totalCrypto = 0;
    let totalCost = 0;
    let totalRealized = 0;

    for (const strategy of allStrategies) {
      const [position] = await db
        .select()
        .from(positions)
        .where(
          and(
            eq(positions.strategyId, strategy.id),
            eq(positions.status, "open")
          )
        )
        .limit(1);

      const currentValue =
        (position?.totalAmount || 0) * (analysis?.price || 0);
      const unrealizedPnl = currentValue - (position?.totalCostUsdt || 0);

      strategiesWithPositions.push({
        ...strategy,
        position: position || null,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPercent:
          position?.totalCostUsdt && position.totalCostUsdt > 0
            ? (unrealizedPnl / position.totalCostUsdt) * 100
            : 0,
      });

      if (position) {
        totalCrypto += position.totalAmount;
        totalCost += position.totalCostUsdt;
        totalRealized += position.realizedProfitUsdt;
      }
    }

    const totalValue = totalCrypto * (analysis?.price || 0);
    const totalUnrealized = totalValue - totalCost;

    // Get latest combined performance
    const [latestPerformance] = await db
      .select()
      .from(performanceSnapshots)
      .where(isNull(performanceSnapshots.strategyId))
      .orderBy(desc(performanceSnapshots.snapshotAt))
      .limit(1);

    // Get recent transactions
    const recentTransactions = await db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.executedAt))
      .limit(10);

    // Get recent logs
    const recentLogs = await db
      .select()
      .from(botLogs)
      .orderBy(desc(botLogs.createdAt))
      .limit(20);

    // Get transaction stats
    const allTx = await db.select().from(transactions);
    const sells = allTx.filter((t) => t.action === "sell");
    const realizedProfit = sells.reduce(
      (sum, t) => sum + (t.profitUsdt || 0),
      0
    );

    return {
      bot: {
        status: botStatus.status,
        isRunning: botStatus.isRunning,
        config: botStatus.config,
      },
      market: analysis
        ? {
            symbol: analysis.symbol,
            price: analysis.price,
            regime: analysis.regime,
            regimeScore: analysis.regimeScore,
            regimeDescription: analysis.regimeDescription,
            rsi: analysis.rsi14,
            percentFromAth: analysis.percentFromAth,
            signals: analysis.signals,
            recommendation: analysis.recommendation,
          }
        : null,
      strategies: strategiesWithPositions,
      combined: {
        totalAmount: totalCrypto,
        totalCostUsdt: totalCost,
        currentValue: totalValue,
        unrealizedPnl: totalUnrealized,
        unrealizedPnlPercent:
          totalCost > 0 ? (totalUnrealized / totalCost) * 100 : 0,
        realizedProfitUsdt: totalRealized,
        totalPnl: totalUnrealized + totalRealized,
      },
      performance: latestPerformance,
      stats: {
        totalTransactions: allTx.length,
        totalBuys: allTx.filter((t) => t.action === "buy").length,
        totalSells: sells.length,
        realizedProfit,
      },
      recentTransactions,
      recentLogs,
    };
  })

  // ============================================================================
  // BACKTESTING
  // ============================================================================

  .get(
    "/api/backtest/list",
    async ({ query }) => {
      const limit = parseInt(query.limit || "20");
      return await backtestService.listBacktests(limit);
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
    }
  )

  .get("/api/backtest/:id", async ({ params }) => {
    const result = await backtestService.getBacktest(params.id);
    if (!result) {
      throw new Error("Backtest not found");
    }
    return result;
  })

  .delete("/api/backtest/:id", async ({ params }) => {
    await backtestService.deleteBacktest(params.id);
    return { success: true, message: "Backtest deleted" };
  })

  .post(
    "/api/backtest/run",
    async ({ body }) => {
      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error("Invalid date format");
      }
      if (startDate >= endDate) {
        throw new Error("Start date must be before end date");
      }

      const strategyId = body.strategyId || "fear-greed-moderate";
      const strategyConfig = backtestService.getStrategyConfig(strategyId);

      if (!strategyConfig) {
        throw new Error(`Unknown strategy: ${strategyId}`);
      }

      const result = await backtestService.runBacktest({
        name:
          body.name ||
          `${strategyConfig.name} - ${new Date().toISOString().split("T")[0]}`,
        symbol: body.symbol || "BTC/USDT",
        startDate,
        endDate,
        initialCapital: body.initialCapital || 1000,
        strategyId,
      });

      return result;
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        symbol: t.Optional(t.String()),
        startDate: t.String(),
        endDate: t.String(),
        initialCapital: t.Optional(t.Number()),
        strategyId: t.Optional(t.String()),
      }),
    }
  )

  .get("/api/backtest/strategies", async () => {
    return backtestService.getStrategies();
  })

  .get("/api/backtest/strategies/:id", async ({ params }) => {
    const config = backtestService.getStrategyConfig(params.id);
    if (!config) {
      throw new Error("Strategy not found");
    }
    return config;
  })

  .get(
    "/api/backtest/historical-data",
    async ({ query }) => {
      const symbol = query.symbol || "BTC/USDT";
      return await backtestService.getAvailableDataRange(symbol);
    },
    {
      query: t.Object({
        symbol: t.Optional(t.String()),
      }),
    }
  )

  .post(
    "/api/backtest/fetch-historical",
    async ({ body }) => {
      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);

      const count = await backtestService.fetchHistoricalData(
        body.symbol || "BTC/USDT",
        startDate,
        endDate,
        body.timeframe || "1d"
      );

      return {
        success: true,
        count,
        message: `Fetched/have ${count} data points`,
      };
    },
    {
      body: t.Object({
        symbol: t.Optional(t.String()),
        startDate: t.String(),
        endDate: t.String(),
        timeframe: t.Optional(t.String()),
      }),
    }
  )

  // ============================================================================
  // DATA INGESTION
  // ============================================================================

  .get("/api/ingestion/status", async () => {
    return dataIngestionService.getStatus();
  })

  .get("/api/ingestion/configs", async () => {
    return dataIngestionService.getConfigs();
  })

  .post("/api/ingestion/start", async () => {
    await dataIngestionService.start();
    return { success: true, message: "Data ingestion started" };
  })

  .post("/api/ingestion/stop", async () => {
    dataIngestionService.stop();
    return { success: true, message: "Data ingestion stopped" };
  })

  .post("/api/ingestion/fetch-all", async () => {
    await dataIngestionService.fetchAll();
    return { success: true, message: "Fetched data for all configs" };
  })

  .post(
    "/api/ingestion/config",
    async ({ body }) => {
      const config = await dataIngestionService.addConfig(
        body.symbol,
        body.timeframe,
        body.retentionDays ?? null
      );
      return { success: true, config };
    },
    {
      body: t.Object({
        symbol: t.String(),
        timeframe: t.String(),
        retentionDays: t.Optional(t.Number()),
      }),
    }
  )

  .post(
    "/api/ingestion/config/:id/toggle",
    async ({ params, body }) => {
      await dataIngestionService.toggleConfig(params.id, body.enabled);
      return { success: true };
    },
    {
      body: t.Object({
        enabled: t.Boolean(),
      }),
    }
  )

  .delete("/api/ingestion/config/:id", async ({ params }) => {
    await dataIngestionService.deleteConfig(params.id);
    return { success: true };
  })

  .post(
    "/api/ingestion/backfill",
    async ({ body }) => {
      const startDate = new Date(body.startDate);
      const endDate = body.endDate ? new Date(body.endDate) : new Date();

      const result = await dataIngestionService.backfill(
        body.symbol,
        body.timeframe,
        startDate,
        endDate
      );

      return {
        success: true,
        ...result,
        message: `Backfilled ${result.totalCandles} candles with ${result.errors} errors`,
      };
    },
    {
      body: t.Object({
        symbol: t.String(),
        timeframe: t.String(),
        startDate: t.String(),
        endDate: t.Optional(t.String()),
      }),
    }
  )

  .get("/api/ingestion/summary", async () => {
    return dataIngestionService.getDataSummary();
  })

  .get("/api/ingestion/symbols", async () => {
    return dataIngestionService.getAvailableSymbols();
  })

  .get("/api/ingestion/timeframes/:symbol", async ({ params }) => {
    const symbol = decodeURIComponent(params.symbol);
    return dataIngestionService.getAvailableTimeframes(symbol);
  })

  .get("/api/ingestion/data/:symbol/:timeframe", async ({ params, query }) => {
    const symbol = decodeURIComponent(params.symbol);
    const timeframe = params.timeframe;
    const limit = query.limit ? parseInt(query.limit as string) : 100;
    const startDate = query.startDate
      ? new Date(query.startDate as string)
      : undefined;
    const endDate = query.endDate
      ? new Date(query.endDate as string)
      : undefined;

    return dataIngestionService.getHistoricalData(
      symbol,
      timeframe,
      limit,
      startDate,
      endDate
    );
  })

  .post("/api/ingestion/cleanup-duplicates", async () => {
    const deletedCount = await dataIngestionService.cleanupDuplicates();
    return {
      success: true,
      deletedCount,
      message: `Removed ${deletedCount} duplicates`,
    };
  })

  .delete("/api/ingestion/symbol/:symbol", async ({ params }) => {
    const symbol = decodeURIComponent(params.symbol);
    const configsDeleted = await dataIngestionService.deleteConfigsBySymbol(
      symbol
    );
    const dataDeleted = await dataIngestionService.deleteDataBySymbol(symbol);
    return {
      success: true,
      configsDeleted,
      dataDeleted,
      message: `Removed ${configsDeleted} configs and ${dataDeleted} data points for ${symbol}`,
    };
  })

  // ============================================================================
  // FRONTEND FALLBACK
  // ============================================================================

  // Serve static assets explicitly
  .get("/assets/*", async ({ params }) => {
    const filePath = resolve(DIST_PATH, "assets", params["*"]);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response("Not found", { status: 404 });
  })

  .get("/favicon.svg", async () => {
    const file = Bun.file(resolve(DIST_PATH, "favicon.svg"));
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": "image/svg+xml" },
      });
    }
    return new Response("Not found", { status: 404 });
  })

  // SPA fallback - serve index.html for all other routes
  .get("*", async () => {
    const indexPath = resolve(DIST_PATH, "index.html");
    const content = await Bun.file(indexPath).text();
    return new Response(content, {
      headers: { "Content-Type": "text/html" },
    });
  })

  .listen(process.env.PORT || 3000);

// ============================================================================
// STARTUP
// ============================================================================

// Initialize all services
Promise.all([tradingBot.initialize(), dataIngestionService.initialize()]).then(
  () => {
    const testMode = process.env.EXCHANGE_TEST_MODE === "true";
    const startIngestion = process.env.DATA_INGESTION_ENABLED !== "false";

    console.log(`
  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                               ║
  ║   🤖 TRADOR - Multi-Strategy Regime-Based Trading Bot         ║
  ║                                                               ║
  ╠═══════════════════════════════════════════════════════════════╣
  ║                                                               ║
  ║   Server:    http://localhost:${
    app.server?.port
  }                           ║
  ║   Mode:      ${
    testMode ? "🧪 TESTNET (simulated trades)" : "💰 LIVE (real trades)    "
  }            ║
  ║   Strategy:  Buy Fear, Sell Greed (3 risk profiles)           ║
  ║                                                               ║
  ║   Strategies:                                                 ║
  ║   • 🐢 Conservative (30%) - Patient, big moves                ║
  ║   • ⚖️  Moderate (40%)     - Balanced approach                 ║
  ║   • 🚀 Aggressive (30%)   - Quick profits                     ║
  ║                                                               ║
  ║   Data Ingestion: ${
    startIngestion ? "✅ ENABLED" : "⏸️  DISABLED"
  }                             ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
  `);

    // Start data ingestion if enabled
    if (startIngestion) {
      dataIngestionService.start();
    }
  }
);

export type App = typeof app;
