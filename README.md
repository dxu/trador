# Trador 🤖

A patient, regime-based crypto trading bot that buys fear and sells greed. Designed to run autonomously for weeks without intervention.

## Philosophy

> "Be fearful when others are greedy, and greedy when others are fearful." — Warren Buffett

This bot doesn't try to time the market on short timeframes. Instead, it:

1. **Accumulates during fear** — When the market is down 30-50%+ from ATH and RSI is oversold, it DCA's into positions
2. **Holds during neutral periods** — Does nothing, just waits patiently  
3. **Distributes during greed** — When RSI is overbought and market is euphoric, it takes partial profits
4. **Never sells at a loss** — The bot will hold indefinitely until profitable

## Multi-Strategy System

The bot runs **three parallel strategies** with different risk profiles:

| Strategy | Allocation | DCA | Profit Target | Style |
|----------|------------|-----|---------------|-------|
| 🐢 **Conservative** | 30% | $30/48h | 20% | Patient, big moves |
| ⚖️ **Moderate** | 40% | $50/24h | 10% | Balanced approach |
| 🚀 **Aggressive** | 30% | $75/12h | 5% | Quick profits |

Each strategy has its own:
- Position tracking
- Regime thresholds  
- DCA schedule
- Profit-taking rules

This diversification lets you capture **both quick gains and big moves**.

## Strategy Details

### Market Regime Detection

The bot analyzes multiple factors to determine market regime:

| Signal | Fear | Extreme Fear | Greed | Extreme Greed |
|--------|------|--------------|-------|---------------|
| % from ATH | <-30% | <-50% | Near ATH | At/Above ATH |
| RSI (14) | <35 | <30 | >70 | >85 |
| vs 200 MA | Below | Far Below | Above | Far Above |

*Note: Each strategy can have different thresholds. Aggressive triggers earlier, conservative waits longer.*

### Actions by Regime

| Regime | Action | Example |
|--------|--------|---------|
| **Extreme Fear** | Aggressive DCA (1.5x amount, 2x frequency) | BTC at $30k (down 55% from $67k ATH) |
| **Fear** | Regular DCA | BTC at $45k (down 33% from ATH) |
| **Neutral** | Hold — do nothing | Normal market conditions |
| **Greed** | Take partial profits (if in profit) | RSI >70, market extended |
| **Extreme Greed** | Aggressive profit-taking (1.5x %) | New ATH, RSI >85 |

### Key Safety Features

- **Never sells at a loss** — Will hold forever if needed
- **Per-strategy profit thresholds** — Conservative waits for 20%, aggressive takes 5%
- **Partial sells** — Takes profits incrementally (15-25% of position at a time)
- **Max position limits** — Each strategy has its own cap
- **Auto-pause on errors** — Stops after consecutive failures
- **Full audit log** — Every decision is logged with strategy context

## Tech Stack

- **Backend**: Elysia (Bun) + Drizzle ORM + PostgreSQL
- **Frontend**: React + Tailwind CSS + Recharts
- **Exchange**: CCXT (supports Binance, Coinbase, etc.)

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- PostgreSQL database
- Exchange API keys (Binance recommended)

### Local Development

```bash
# Clone and install
git clone <repo-url>
cd trador
npm install

# Install backend deps
cd packages/api && bun install && cd ../..

# Install frontend deps  
cd packages/web && npm install && cd ../..

# Set up environment (packages/api/.env)
DATABASE_URL=postgres://localhost:5432/trador
EXCHANGE_ID=binance
EXCHANGE_API_KEY=your_api_key
EXCHANGE_SECRET=your_secret
EXCHANGE_TEST_MODE=true  # IMPORTANT: Keep true until ready

# Push database schema
npm run db:push

# Start development
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000

### Deploy to Render

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Blueprint
3. Connect your repo (auto-detects `render.yaml`)
4. Set environment variables in Render dashboard:
   - `EXCHANGE_API_KEY`
   - `EXCHANGE_SECRET`
   - `EXCHANGE_TEST_MODE` (set to `false` for live trading)

## Configuration

All settings adjustable via the dashboard. Each strategy can be configured independently:

### Default Strategy Settings

| Setting | Conservative | Moderate | Aggressive |
|---------|--------------|----------|------------|
| Allocation | 30% | 40% | 30% |
| DCA Amount | $30 | $50 | $75 |
| DCA Frequency | 48 hours | 24 hours | 12 hours |
| Max Position | $1,500 | $2,000 | $1,500 |
| Min Profit to Sell | 20% | 10% | 5% |
| Sell % | 15% | 20% | 25% |
| Fear Threshold | -40% | -30% | -20% |
| Greed RSI | 75 | 70 | 65 |

You can enable/disable individual strategies and adjust all parameters through the Settings panel.

## Dashboard

The dashboard shows:

- **Current regime** with signals explaining why
- **Position details** — amount, avg entry, unrealized P&L
- **Performance chart** — value over time vs cost basis
- **Transaction history** — all buys/sells with profit tracking
- **Activity log** — every bot decision with context

## Safety First

⚠️ **This bot starts in TEST MODE** — All trades are simulated.

To enable live trading:
1. Verify your configuration is correct
2. Start with small amounts
3. Set `EXCHANGE_TEST_MODE=false`
4. Monitor closely for the first few cycles

## ⚠️ Disclaimer

This software is for educational purposes only. Cryptocurrency trading involves substantial risk of loss. Never trade with money you cannot afford to lose. Past performance does not guarantee future results. The developers are not responsible for any financial losses.

## Documentation

- **[Strategy Guide](docs/STRATEGY.md)** — Deep dive into the trading theory and algorithm
- **[Architecture](docs/ARCHITECTURE.md)** — System design, data flow, and component overview
- **[Development](docs/DEVELOPMENT.md)** — Local setup, debugging, and contribution guide

## License

MIT
