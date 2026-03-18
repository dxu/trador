# Development Guide

## Prerequisites

- [Bun](https://bun.sh/) v1.0+ (backend)
- [Node.js](https://nodejs.org/) v20+ (frontend build)
- [PostgreSQL](https://www.postgresql.org/) 14+

## Setup

```bash
# Install dependencies
npm install
cd packages/api && bun install && cd ../..
cd packages/web && npm install && cd ../..

# Create database
createdb trador

# Configure environment
cp .env.example packages/api/.env
# Edit .env: set DATABASE_URL and APP_PASSWORD

# Push schema to database
npm run db:push

# Start development (frontend + backend)
npm run dev
```

- Frontend: http://localhost:5173 (Vite dev server, proxies API to :3000)
- Backend: http://localhost:3000 (Elysia, auto-reloads with bun --watch)

## Making Changes

**Backend** — edit files in `packages/api/src/`, server auto-reloads.

**Frontend** — edit files in `packages/web/src/`, Vite HMR updates browser.

**Database schema** — edit `packages/api/src/db/schema.ts`, then:
```bash
npm run db:push      # Apply changes directly
# or
npm run db:generate  # Generate migration SQL
npm run db:migrate   # Run migrations
```

## Useful Commands

```bash
# Health check
curl http://localhost:3000/api/health

# Connect to database
psql postgres://localhost:5432/trador

# View ingested data
SELECT symbol, timeframe, count(*) FROM historical_ohlcv GROUP BY symbol, timeframe;

# Check ingestion configs
SELECT symbol, timeframe, enabled, total_candles, last_fetch_at FROM data_ingestion_config;
```

## Docker Build

```bash
docker build -t trador .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e APP_PASSWORD=yourpassword \
  trador
```

## Deploy to Render

1. Push to GitHub
2. Render auto-detects `render.yaml`
3. Set `DATABASE_URL` and `APP_PASSWORD` secrets in dashboard
4. Deploy
