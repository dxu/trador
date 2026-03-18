# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       TRADOR SYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────┐  │
│  │   Frontend   │────>│   Backend    │────>│   Kraken   │  │
│  │   (React)    │<────│   (Elysia)   │<────│   (CCXT)   │  │
│  └──────────────┘     └──────┬───────┘     └────────────┘  │
│                              │                               │
│                              v                               │
│                       ┌──────────────┐                      │
│                       │  PostgreSQL  │                      │
│                       │   (Drizzle)  │                      │
│                       └──────────────┘                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
trador/
├── packages/
│   ├── api/                          # Backend (Bun + Elysia)
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts         # Drizzle schema (2 tables)
│   │   │   │   └── index.ts          # DB connection & exports
│   │   │   ├── services/
│   │   │   │   └── dataIngestionService.ts  # OHLCV ingestion pipeline
│   │   │   └── index.ts              # Elysia server & routes
│   │   ├── drizzle.config.ts
│   │   ├── start.sh                  # Docker entrypoint
│   │   └── package.json
│   │
│   └── web/                          # Frontend (React + Vite)
│       ├── src/
│       │   ├── components/
│       │   │   ├── Login.tsx          # Auth form
│       │   │   └── DataPanel.tsx      # Main dashboard
│       │   ├── api.ts                 # API client
│       │   ├── types.ts              # TypeScript types
│       │   ├── App.tsx
│       │   └── main.tsx
│       └── package.json
│
├── docs/
├── Dockerfile
├── render.yaml
└── package.json                      # Workspace root
```

## Database Schema

Two tables:

### `historical_ohlcv`
Stores candlestick data (Open, High, Low, Close, Volume).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| symbol | text | e.g. "BTC/USD" |
| timeframe | text | e.g. "5m", "1h", "1d" |
| timestamp | timestamp | Candle open time |
| open, high, low, close | real | Price data |
| volume | real | Trade volume |
| created_at | timestamp | Row creation time |

### `data_ingestion_config`
Configuration and status for each symbol/timeframe feed.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| symbol | text | e.g. "BTC/USD" |
| timeframe | text | e.g. "5m" |
| enabled | boolean | Active or paused |
| last_fetch_at | timestamp | Last successful fetch |
| retention_days | integer | null = keep forever |
| total_candles | integer | Count of stored candles |
| fetch_error_count | integer | Consecutive errors |
| last_error | text | Most recent error message |

## Data Ingestion Pipeline

The `DataIngestionService` is the core of the system:

1. **Scheduler loop** runs every 30 seconds, checks which feeds are due
2. Feeds are queued and processed sequentially with 2s rate limiting
3. Each fetch pulls up to 500 candles from Kraken via CCXT
4. New candles are filtered (deduped) and batch-inserted into Postgres
5. Old data is pruned based on retention policies

### Fetch intervals
- 5m candles: fetched every 5 minutes
- 1h candles: fetched every hour
- 1d candles: checked every hour

## Deployment

Docker multi-stage build:
1. **Stage 1** (Node): Builds React frontend with pnpm
2. **Stage 2** (Bun): Runs backend, serves built frontend as static files

Render Blueprint (`render.yaml`) configures the web service with health checks on `/api/health`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `APP_PASSWORD` | Yes | Dashboard login password |
| `SESSION_SECRET` | No | Token signing (auto-generated if unset) |
| `DATA_INGESTION_ENABLED` | No | "true" (default) or "false" |
| `PORT` | No | Server port (default: 3000) |
