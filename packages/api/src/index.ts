import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash, randomBytes } from "crypto";
import { dataIngestionService } from "./services/dataIngestionService";
import { backtestService } from "./services/backtestService";
import { strategyList, strategies } from "./strategies/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = resolve(__dirname, "../../web/dist");

// ============================================================================
// AUTHENTICATION
// ============================================================================

const AUTH_PASSWORD = process.env.APP_PASSWORD || process.env.AUTH_PASSWORD || "changeme";
const SESSION_SECRET =
  process.env.SESSION_SECRET || randomBytes(32).toString("hex");

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

setInterval(() => {
  const now = new Date();
  for (const [token, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(token);
    }
  }
}, 60000);

// ============================================================================
// APP
// ============================================================================

const app = new Elysia()
  .use(cors())

  // ============================================================================
  // AUTHENTICATION ROUTES (unprotected)
  // ============================================================================

  .post(
    "/api/auth/login",
    async ({ body }) => {
      if (body.password === AUTH_PASSWORD) {
        const token = generateToken();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

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
  // HEALTH
  // ============================================================================

  .get("/api/health", async () => {
    const ingestionStatus = dataIngestionService.getStatus();
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      ingestion: ingestionStatus.isRunning ? "running" : "stopped",
    };
  })

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

  .get("/api/ingestion/market-overview", async () => {
    return dataIngestionService.getMarketOverview();
  })

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
  // STRATEGIES
  // ============================================================================

  .get("/api/strategies", async () => {
    return strategyList.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      defaultParams: s.defaultParams,
      paramLabels: s.paramLabels,
      paramDescriptions: s.paramDescriptions,
      minCandles: s.minCandles,
    }));
  })

  // ============================================================================
  // BACKTESTS
  // ============================================================================

  .post(
    "/api/backtests",
    async ({ body }) => {
      const id = await backtestService.startBacktest(body);
      return { success: true, id };
    },
    {
      body: t.Object({
        strategySlug: t.String(),
        symbol: t.String(),
        timeframe: t.String(),
        startDate: t.String(),
        endDate: t.String(),
        initialCapital: t.Number(),
        paramOverrides: t.Optional(t.Record(t.String(), t.Any())),
      }),
    }
  )

  .get("/api/backtests", async () => {
    return backtestService.getBacktestRuns();
  })

  .get("/api/backtests/:id", async ({ params }) => {
    const run = await backtestService.getBacktestRun(params.id);
    if (!run) throw new Error("Backtest not found");
    return run;
  })

  .get("/api/backtests/:id/trades", async ({ params }) => {
    return backtestService.getBacktestTrades(params.id);
  })

  .get("/api/backtests/:id/snapshots", async ({ params }) => {
    return backtestService.getBacktestSnapshots(params.id);
  })

  .delete("/api/backtests/:id", async ({ params }) => {
    await backtestService.deleteBacktest(params.id);
    return { success: true };
  })

  // ============================================================================
  // FRONTEND STATIC FILES
  // ============================================================================

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

dataIngestionService.initialize().then(() => {
  const startIngestion = process.env.DATA_INGESTION_ENABLED !== "false";

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   📊 TRADOR - Crypto Market Data Platform                     ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   Server:          http://localhost:${app.server?.port}                      ║
║   Data Ingestion:  ${startIngestion ? "✅ ENABLED" : "⏸️  DISABLED"}                             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  if (startIngestion) {
    dataIngestionService.start();
  }
});

export type App = typeof app;
