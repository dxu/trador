# Trador

Crypto market data ingestion platform. Collects OHLCV candlestick data from Kraken for 10 cryptocurrencies across multiple timeframes. Designed to run autonomously on Render.

## What It Does

- Ingests 5-minute, hourly, and daily candle data from Kraken via CCXT
- Stores data in PostgreSQL with configurable retention policies
- Web dashboard for monitoring ingestion status, browsing data, and viewing price charts
- Password-protected access

## Tracked Assets

BTC, ETH, SOL, XRP, DOGE, ADA, AVAX, LINK, DOT, ATOM (all /USD pairs on Kraken)

## Data Retention

| Timeframe | Retention | Purpose |
|-----------|-----------|---------|
| Daily (1d) | Forever | Long-term analysis |
| Hourly (1h) | 90 days | Medium-term analysis |
| 5-minute (5m) | 7 days | Short-term analysis |

## Tech Stack

- **Backend**: Bun + Elysia + Drizzle ORM + PostgreSQL
- **Frontend**: React + Tailwind CSS + DaisyUI
- **Exchange**: CCXT (Kraken public API, no keys needed)
- **Deployment**: Docker on Render

## Quick Start

```bash
# Install dependencies
npm install
cd packages/api && bun install && cd ../..
cd packages/web && npm install && cd ../..

# Set up environment
cp .env.example packages/api/.env
# Edit packages/api/.env with your DATABASE_URL and APP_PASSWORD

# Push database schema
npm run db:push

# Start development
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000

## Deploy to Render

1. Push to GitHub
2. Go to [render.com](https://render.com) > New Blueprint
3. Connect your repo (auto-detects `render.yaml`)
4. Set `DATABASE_URL` and `APP_PASSWORD` in Render dashboard

## API Endpoints

All endpoints require authentication (Bearer token) except `/api/health` and `/api/auth/*`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with password |
| GET | `/api/health` | Health check |
| GET | `/api/ingestion/status` | Ingestion status |
| GET | `/api/ingestion/summary` | Data summary per symbol/timeframe |
| POST | `/api/ingestion/start` | Start ingestion scheduler |
| POST | `/api/ingestion/stop` | Stop ingestion scheduler |
| GET | `/api/ingestion/data/:symbol/:timeframe` | Query OHLCV data |
| POST | `/api/ingestion/backfill` | Backfill historical data |

## License

MIT
