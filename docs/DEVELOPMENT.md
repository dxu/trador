# Development Guide

## Prerequisites

- [Bun](https://bun.sh/) v1.0+ (for backend)
- [Node.js](https://nodejs.org/) v20+ (for frontend build)
- [PostgreSQL](https://www.postgresql.org/) 14+ (local or Docker)

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd trador

# Install root dependencies
npm install

# Install backend dependencies (Bun)
cd packages/api
bun install
cd ../..

# Install frontend dependencies (npm)
cd packages/web
npm install
cd ../..
```

### 2. Database Setup

**Option A: Local PostgreSQL**

```bash
# Create database
createdb trador

# Your connection string
DATABASE_URL=postgres://localhost:5432/trador
```

**Option B: Docker**

```bash
docker run -d \
  --name trador-db \
  -e POSTGRES_DB=trador \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:16

# Your connection string
DATABASE_URL=postgres://postgres:password@localhost:5432/trador
```

### 3. Environment Setup

Create `packages/api/.env`:

```env
# Database
DATABASE_URL=postgres://localhost:5432/trador

# Exchange (get from https://www.binance.com/en/my/settings/api-management)
EXCHANGE_ID=binance
EXCHANGE_API_KEY=your_api_key_here
EXCHANGE_SECRET=your_secret_here

# IMPORTANT: Keep this true until you're ready for real trades
EXCHANGE_TEST_MODE=true

# Optional
PORT=3000
```

### 4. Initialize Database

```bash
# Push schema to database
npm run db:push
```

### 5. Start Development

```bash
# Start both frontend and backend
npm run dev

# Or separately:
npm run dev:api   # Backend on :3000
npm run dev:web   # Frontend on :5173
```

Open http://localhost:5173

---

## Development Workflow

### Making Changes

**Backend (packages/api)**

```bash
# Edit files in packages/api/src
# Server auto-reloads on save (bun --watch)
```

**Frontend (packages/web)**

```bash
# Edit files in packages/web/src
# Vite HMR auto-updates browser
```

**Database Schema**

```bash
# Edit packages/api/src/db/schema.ts
# Then push changes:
npm run db:push

# Or generate migration:
npm run db:generate
npm run db:migrate
```

### Testing the Bot

1. Open dashboard at http://localhost:5173
2. Click "Run Analysis Cycle" to test market analysis
3. Check "Activity Log" tab for output
4. Adjust settings in "Settings" tab
5. Click "Start" to begin autonomous operation

### Common Tasks

**View database**

```bash
# Using psql
psql postgres://localhost:5432/trador

# Common queries
SELECT * FROM bot_config;
SELECT * FROM positions;
SELECT * FROM transactions ORDER BY executed_at DESC LIMIT 10;
SELECT * FROM bot_logs ORDER BY created_at DESC LIMIT 20;
```

**Reset database**

```bash
# Drop all tables and recreate
dropdb trador && createdb trador
npm run db:push
```

**Check API endpoints**

```bash
# Health check
curl http://localhost:3000/api/health

# Get dashboard data
curl http://localhost:3000/api/dashboard

# Run manual cycle
curl -X POST http://localhost:3000/api/bot/run-cycle

# Start bot
curl -X POST http://localhost:3000/api/bot/start
```

---

## Code Style

### TypeScript

- Strict mode enabled
- Explicit return types on public functions
- Use `interface` for object shapes, `type` for unions/aliases

### Backend

```typescript
// Services are classes with methods
class MyService {
  async doSomething(): Promise<Result> {
    // ...
  }
}

// Export singleton instance
export const myService = new MyService();
```

### Frontend

```typescript
// Functional components with props interface
interface MyComponentProps {
  value: string;
  onChange: (value: string) => void;
}

export function MyComponent({ value, onChange }: MyComponentProps) {
  return <div>...</div>;
}
```

### CSS (Tailwind)

- Use Tailwind utilities
- Custom classes in `index.css` for reusable patterns
- Follow existing patterns (`.card`, `.btn-primary`, etc.)

---

## Project Structure

```
packages/api/src/
├── db/
│   ├── schema.ts      # Drizzle table definitions
│   └── index.ts       # DB connection, re-exports schema
├── services/
│   ├── exchange.ts    # CCXT wrapper
│   ├── marketAnalysis.ts  # Technical analysis
│   └── tradingBot.ts  # Core bot logic
└── index.ts           # Elysia server, routes

packages/web/src/
├── components/
│   ├── Dashboard.tsx
│   ├── TransactionsPanel.tsx
│   ├── LogsPanel.tsx
│   └── SettingsPanel.tsx
├── api.ts             # API client
├── types.ts           # TypeScript types
├── App.tsx            # Main app component
├── main.tsx           # Entry point
└── index.css          # Styles
```

---

## Debugging

### Backend Logs

The bot logs to console and database. Console shows:

```
[2024-01-15T10:30:00.000Z] ℹ️ [CYCLE] Starting analysis cycle
[2024-01-15T10:30:01.000Z] ℹ️ [REGIME] 🟢 FEAR - Good time to accumulate...
[2024-01-15T10:30:02.000Z] ⚡ [TRADE] 🟢 ACCUMULATING $50.00 in FEAR regime
```

### Frontend Debugging

- React DevTools
- Network tab for API calls
- Console for errors

### Database Queries

```sql
-- Recent bot activity
SELECT level, category, message, created_at 
FROM bot_logs 
ORDER BY created_at DESC 
LIMIT 20;

-- Current position
SELECT * FROM positions WHERE status = 'open';

-- Transaction history
SELECT action, amount, price, profit_usdt, regime, executed_at
FROM transactions
ORDER BY executed_at DESC
LIMIT 20;

-- Market regime history
SELECT regime, regime_score, price, rsi_14, percent_from_ath, snapshot_at
FROM market_snapshots
ORDER BY snapshot_at DESC
LIMIT 20;
```

---

## Troubleshooting

### "Exchange connection failed"

- Check API key/secret are correct
- Verify `EXCHANGE_ID` matches your exchange
- Try with `EXCHANGE_TEST_MODE=true` first

### "Database connection failed"

- Verify PostgreSQL is running
- Check `DATABASE_URL` format
- Try connecting with psql manually

### "Port already in use"

```bash
# Find process using port
lsof -i :3000

# Kill it
kill -9 <PID>
```

### "Module not found"

```bash
# Reinstall dependencies
rm -rf node_modules packages/*/node_modules
npm install
cd packages/api && bun install
cd ../web && npm install
```

### Frontend not loading

- Make sure API is running on :3000
- Check browser console for errors
- Verify proxy config in `vite.config.ts`

---

## Testing

### Manual Testing

1. Start in test mode (`EXCHANGE_TEST_MODE=true`)
2. Run cycles manually via dashboard
3. Verify transactions are logged
4. Check regime detection with different market conditions

### Simulating Market Conditions

Edit `packages/api/src/services/marketAnalysis.ts` temporarily:

```typescript
// Force a specific regime for testing
async analyze(symbol: string, thresholds: RegimeThresholds): Promise<MarketAnalysis> {
  // ... normal analysis ...
  
  // TESTING: Force extreme fear
  return {
    ...analysis,
    regime: 'extreme_fear',
    regimeScore: -75,
  };
}
```

### Adding Unit Tests (Future)

```bash
# Install test framework
cd packages/api
bun add -d bun:test

# Create test file
# packages/api/src/services/marketAnalysis.test.ts
```

---

## Deployment

### Build for Production

```bash
# Build frontend
npm run build:web

# Build backend (optional, Bun can run TS directly)
npm run build:api
```

### Deploy to Render

1. Push to GitHub
2. Render auto-detects `render.yaml`
3. Set secrets in Render dashboard:
   - `EXCHANGE_API_KEY`
   - `EXCHANGE_SECRET`
4. Deploy

### Manual Docker Build

```bash
docker build -t trador .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e EXCHANGE_API_KEY=... \
  -e EXCHANGE_SECRET=... \
  trador
```

---

## Contributing

1. Create feature branch
2. Make changes
3. Test locally with `EXCHANGE_TEST_MODE=true`
4. Update docs if needed
5. Submit PR

### Code Review Checklist

- [ ] No hardcoded secrets
- [ ] Error handling for exchange calls
- [ ] Logging for important operations
- [ ] Types are correct
- [ ] UI is responsive
- [ ] Works in test mode
