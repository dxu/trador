# Trador Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         TRADOR SYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │   Frontend   │────▶│   Backend    │────▶│   Exchange   │   │
│  │   (React)    │◀────│   (Elysia)   │◀────│   (CCXT)     │   │
│  └──────────────┘     └──────┬───────┘     └──────────────┘   │
│                              │                                  │
│                              ▼                                  │
│                       ┌──────────────┐                         │
│                       │  PostgreSQL  │                         │
│                       │   (Drizzle)  │                         │
│                       └──────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
trador/
├── packages/
│   ├── api/                          # Backend (Bun + Elysia)
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts         # Drizzle schema definitions
│   │   │   │   └── index.ts          # DB connection & exports
│   │   │   ├── services/
│   │   │   │   ├── exchange.ts       # CCXT wrapper
│   │   │   │   ├── marketAnalysis.ts # Regime detection
│   │   │   │   └── tradingBot.ts     # Core bot logic
│   │   │   └── index.ts              # Elysia server & routes
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   └── web/                          # Frontend (React + Vite)
│       ├── src/
│       │   ├── components/
│       │   │   ├── Dashboard.tsx     # Main dashboard
│       │   │   ├── TransactionsPanel.tsx
│       │   │   ├── LogsPanel.tsx
│       │   │   └── SettingsPanel.tsx
│       │   ├── api.ts                # API client
│       │   ├── types.ts              # TypeScript types
│       │   ├── App.tsx
│       │   └── main.tsx
│       └── package.json
│
├── docs/
│   ├── STRATEGY.md                   # Trading strategy docs
│   └── ARCHITECTURE.md               # This file
│
├── Dockerfile                        # Production build
├── render.yaml                       # Render deployment config
└── package.json                      # Workspace root
```

---

## Backend Architecture

### Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Bun | Fast JS runtime with native TS support |
| Framework | Elysia | Type-safe, fast HTTP framework |
| ORM | Drizzle | Type-safe SQL with migrations |
| Database | PostgreSQL | Persistent storage |
| Exchange | CCXT | Unified exchange API |

### Service Layer

```
┌─────────────────────────────────────────────────────────────┐
│                      Elysia Server                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    API Routes                         │  │
│  │  /api/bot/*      - Bot control                       │  │
│  │  /api/market/*   - Market data                       │  │
│  │  /api/positions/*- Position management               │  │
│  │  /api/transactions/* - Trade history                 │  │
│  │  /api/performance/*  - Performance data              │  │
│  │  /api/logs/*     - Activity logs                     │  │
│  │  /api/dashboard  - Aggregated dashboard data         │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────┼────────────────────────────┐   │
│  │                   Services                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ TradingBot  │  │MarketAnalysis│ │  Exchange   │  │   │
│  │  │             │──│             │──│  Service    │  │   │
│  │  │ - start()   │  │ - analyze() │  │             │  │   │
│  │  │ - stop()    │  │ - getRegime │  │ - getTicker │  │   │
│  │  │ - runCycle()│  │ - calcRSI() │  │ - buy/sell  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌────────────────────────┼────────────────────────────┐   │
│  │                   Database (Drizzle)                 │   │
│  │  bot_config | positions | transactions | bot_logs   │   │
│  │  market_snapshots | performance_snapshots           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### TradingBot Service

The core orchestrator that runs the strategy.

```typescript
class TradingBot {
  // Lifecycle
  async initialize(): Promise<BotConfig>
  async start(): Promise<void>
  async stop(): Promise<void>
  async pause(): Promise<void>
  
  // Main loop (runs every hour)
  private async runCycle(): Promise<void>
  
  // Strategy execution
  private async executeStrategy(analysis: MarketAnalysis, position: Position): Promise<void>
  private async handleAccumulation(...): Promise<void>
  private async handleDistribution(...): Promise<void>
  
  // Trade execution
  private async executeBuy(...): Promise<void>
  private async executeSell(...): Promise<void>
  
  // Error handling
  private async handleError(error: unknown): Promise<void>
  private async resetErrors(): Promise<void>
  
  // Logging
  private async log(level, category, message, context?): Promise<void>
}
```

### MarketAnalysis Service

Calculates technical indicators and determines market regime.

```typescript
class MarketAnalysisService {
  // Main analysis function
  async analyze(symbol: string, thresholds: RegimeThresholds): Promise<MarketAnalysis>
  
  // Technical indicators
  private calculateMA(ohlcv: number[][], period: number): number | null
  private calculateRSI(ohlcv: number[][], period: number): number
  private async getATHData(symbol: string, ohlcv: number[][]): Promise<ATHData>
  
  // Regime calculation
  private calculateRegime(price, ma200, ma50, rsi, percentFromAth, thresholds): RegimeResult
  
  // Persistence
  async saveSnapshot(analysis: MarketAnalysis): Promise<MarketSnapshot>
  async getLatestSnapshot(symbol: string): Promise<MarketSnapshot | null>
  async getRegimeHistory(symbol: string, days: number): Promise<MarketSnapshot[]>
}
```

### Exchange Service

Wrapper around CCXT for exchange operations.

```typescript
class ExchangeService {
  // Connection
  private async ensureConnection(): Promise<Exchange>
  
  // Market data
  async getTicker(symbol: string): Promise<Ticker>
  async getOHLCV(symbol: string, timeframe: string, limit: number): Promise<OHLCV[]>
  async getBalance(): Promise<Balance>
  
  // Trading
  async marketBuy(symbol: string, amountUsdt: number): Promise<OrderResult>
  async marketSell(symbol: string, amount: number): Promise<OrderResult>
  
  // Test mode simulation
  private simulateOrder(...): OrderResult
  
  // Health
  async healthCheck(): Promise<HealthStatus>
  isInTestMode(): boolean
}
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────┐
│   bot_config    │     │    positions    │
├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │
│ symbol          │     │ symbol          │
│ status          │     │ status          │
│ dca_amount_usdt │     │ total_amount    │
│ dca_frequency   │     │ total_cost_usdt │
│ max_position    │     │ avg_entry_price │
│ min_profit      │     │ realized_profit │
│ sell_percentage │     │ total_buys      │
│ fear_threshold  │     │ total_sells     │
│ ...             │     │ ...             │
└─────────────────┘     └────────┬────────┘
                                 │
                                 │ 1:N
                                 ▼
                        ┌─────────────────┐
                        │  transactions   │
                        ├─────────────────┤
                        │ id (PK)         │
                        │ position_id(FK) │
                        │ symbol          │
                        │ action          │
                        │ amount          │
                        │ price           │
                        │ value_usdt      │
                        │ fee             │
                        │ regime          │
                        │ profit_usdt     │
                        │ ...             │
                        └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│market_snapshots │     │ performance_    │
├─────────────────┤     │   snapshots     │
│ id (PK)         │     ├─────────────────┤
│ symbol          │     │ id (PK)         │
│ price           │     │ total_value     │
│ ma_200          │     │ cost_basis      │
│ ma_50           │     │ crypto_amount   │
│ rsi_14          │     │ unrealized_pnl  │
│ all_time_high   │     │ realized_pnl    │
│ percent_from_ath│     │ regime          │
│ regime          │     │ snapshot_at     │
│ regime_score    │     └─────────────────┘
│ snapshot_at     │
└─────────────────┘

┌─────────────────┐
│    bot_logs     │
├─────────────────┤
│ id (PK)         │
│ level           │
│ category        │
│ message         │
│ data (JSONB)    │
│ regime          │
│ price           │
│ created_at      │
└─────────────────┘
```

### Key Tables

#### `bot_config`
Single row storing all configuration. Updated via settings panel.

#### `positions`
Tracks the current position for each symbol. Cost basis accounting.

#### `transactions`
Immutable log of every buy/sell. Links to position for profit calculation.

#### `market_snapshots`
Hourly snapshots of market conditions. Used for regime history charts.

#### `performance_snapshots`
Hourly snapshots of portfolio value. Used for performance charts.

#### `bot_logs`
Detailed activity log. Every decision recorded with context.

---

## Frontend Architecture

### Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | React 18 | UI components |
| Build | Vite | Fast dev/build |
| Styling | Tailwind CSS | Utility-first CSS |
| Charts | Recharts | Data visualization |
| Data Fetching | SWR | Caching & revalidation |
| Icons | Lucide React | Icon library |

### Component Hierarchy

```
App
├── Header
│   ├── Logo
│   ├── RegimeBadge
│   ├── StatusIndicator
│   └── Navigation
│
├── Dashboard
│   ├── ErrorBanner (conditional)
│   ├── MarketRegimeBanner
│   ├── StatsGrid
│   │   ├── StatCard (Position Value)
│   │   ├── StatCard (Unrealized P&L)
│   │   ├── StatCard (Realized Profit)
│   │   └── StatCard (Total Transactions)
│   ├── MainGrid
│   │   ├── PortfolioChart
│   │   └── BotControlPanel
│   │       ├── StatusDisplay
│   │       ├── PriceDisplay
│   │       ├── PositionSummary
│   │       └── ControlButtons
│   └── RecentActivity
│       ├── RecentTransactions
│       └── RecentLogs
│
├── TransactionsPanel
│   ├── StatsGrid
│   ├── NetFlowCard
│   └── TransactionsTable
│
├── LogsPanel
│   ├── FilterTabs
│   └── LogsList (grouped by date)
│
├── SettingsPanel
│   ├── StrategyExplanation
│   ├── TradingPairCard
│   ├── AccumulationSettingsCard
│   ├── DistributionSettingsCard
│   ├── RegimeThresholdsCard
│   └── SaveButton
│
└── Footer
```

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Component  │────▶│     SWR      │────▶│   API Call   │
│              │◀────│   (Cache)    │◀────│              │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     Auto-revalidate
                     on interval
```

SWR handles:
- Caching
- Revalidation on focus
- Periodic refresh (30s for dashboard, 60s for history)
- Error handling

### API Client

Centralized API client with typed responses:

```typescript
export const api = {
  // Dashboard
  getDashboard: () => fetchApi<DashboardData>('/dashboard'),
  
  // Bot control
  startBot: () => fetchApi('/bot/start', { method: 'POST' }),
  stopBot: () => fetchApi('/bot/stop', { method: 'POST' }),
  pauseBot: () => fetchApi('/bot/pause', { method: 'POST' }),
  runCycle: () => fetchApi('/bot/run-cycle', { method: 'POST' }),
  
  // Configuration
  getBotConfig: () => fetchApi<BotConfig>('/bot/config'),
  updateBotConfig: (config) => fetchApi('/bot/config', { method: 'PUT', body: config }),
  
  // Market data
  getMarketAnalysis: (symbol?) => fetchApi<MarketAnalysis>('/market/analysis'),
  
  // ... etc
};
```

---

## Deployment Architecture

### Render Setup

```yaml
# render.yaml
services:
  - type: web
    name: trador
    runtime: docker
    plan: starter
    healthCheckPath: /api/health
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: trador-db
          property: connectionString
      - key: EXCHANGE_API_KEY
        sync: false  # Set manually
      - key: EXCHANGE_SECRET
        sync: false  # Set manually
      - key: EXCHANGE_TEST_MODE
        value: "true"

databases:
  - name: trador-db
    plan: starter
    databaseName: trador
```

### Docker Build

```dockerfile
# Multi-stage build
FROM node:20-slim AS frontend-builder
# Build React app

FROM oven/bun:1 AS backend
# Copy backend + built frontend
# Run with Bun
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `EXCHANGE_ID` | No | Exchange to use (default: binance) |
| `EXCHANGE_API_KEY` | Yes* | API key (*not needed in test mode) |
| `EXCHANGE_SECRET` | Yes* | API secret (*not needed in test mode) |
| `EXCHANGE_TEST_MODE` | No | Set to "true" for simulation |
| `PORT` | No | Server port (default: 3000) |

---

## Data Flow Diagrams

### Trading Cycle

```
┌─────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Timer  │───▶│ Fetch Data  │───▶│   Analyze    │───▶│  Determine  │
│(1 hour) │    │ (Exchange)  │    │  (Indicators)│    │   Regime    │
└─────────┘    └─────────────┘    └──────────────┘    └──────┬──────┘
                                                              │
                    ┌─────────────────────────────────────────┘
                    ▼
            ┌───────────────┐
            │ Regime Switch │
            └───────┬───────┘
                    │
    ┌───────────────┼───────────────┬───────────────┐
    ▼               ▼               ▼               ▼
┌───────┐     ┌───────────┐   ┌─────────┐    ┌───────────┐
│ FEAR  │     │  NEUTRAL  │   │  GREED  │    │  ERROR    │
│       │     │           │   │         │    │           │
│ DCA   │     │   Hold    │   │  Sell?  │    │  Pause    │
│ Buy   │     │   Wait    │   │(if +%)  │    │  Alert    │
└───┬───┘     └─────┬─────┘   └────┬────┘    └─────┬─────┘
    │               │              │               │
    └───────────────┴──────────────┴───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  Log & Save   │
            │  Snapshots    │
            └───────────────┘
```

### Buy Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Check Limits │───▶│ Check Timing │───▶│ Execute Buy  │
│ (max pos?)   │    │ (DCA freq?)  │    │ (exchange)   │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                               │
                    ┌──────────────────────────┘
                    ▼
            ┌───────────────┐    ┌───────────────┐
            │Update Position│───▶│Record Transact│
            │(avg entry)    │    │(with regime)  │
            └───────────────┘    └───────────────┘
```

### Sell Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│Has Position? │───▶│ Profit > Min │───▶│ Execute Sell │
│              │    │  Threshold?  │    │ (exchange)   │
└──────────────┘    └──────────────┘    └──────┬───────┘
      │                    │                    │
      │ No                 │ No                 │
      ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌───────────────┐
│    Skip      │    │    Hold      │    │Update Position│
│              │    │   (patient)  │    │Calc Profit    │
└──────────────┘    └──────────────┘    └───────┬───────┘
                                                │
                                        ┌───────┴───────┐
                                        │Record Transact│
                                        │(with profit)  │
                                        └───────────────┘
```

---

## Security Considerations

### API Keys

- Never commit API keys to git
- Use environment variables
- Render secrets are encrypted at rest
- API keys should have minimal permissions (trade only, no withdrawal)

### Database

- Use parameterized queries (Drizzle handles this)
- Connection string in environment variable
- Render PostgreSQL has automatic backups

### Frontend

- No sensitive data stored in browser
- API calls go through same-origin (no CORS issues in production)
- No authentication required (single-user deployment)

### Exchange API

- Enable IP whitelisting on exchange if possible
- Use API keys with trade-only permissions
- Enable 2FA on exchange account

---

## Monitoring & Observability

### Health Check

`GET /api/health` returns:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "bot": "running",
  "exchange": {
    "healthy": true,
    "exchange": "binance",
    "testMode": true
  }
}
```

### Logging

All bot activity logged to `bot_logs` table:
- `info` — Normal operations
- `warn` — Potential issues
- `error` — Failures
- `action` — Trades executed

### Metrics (via Dashboard)

- Current regime and score
- Position value and P&L
- Transaction count and win rate
- Performance over time chart

### Error Recovery

- Consecutive error counter
- Auto-pause after N failures (default: 5)
- Last error message stored in config
- Manual restart required after auto-pause
