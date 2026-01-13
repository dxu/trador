# Trador Strategy Documentation

## Table of Contents

1. [Core Theory](#core-theory)
2. [Why This Works (Theoretically)](#why-this-works-theoretically)
3. [Market Regime Detection](#market-regime-detection)
4. [The Algorithm](#the-algorithm)
5. [Risk Management](#risk-management)
6. [Known Limitations](#known-limitations)
7. [Future Improvements](#future-improvements)

---

## Core Theory

### The Premise

Cryptocurrency markets are characterized by:

1. **High volatility** — 50-80% drawdowns are common, followed by 200-1000%+ recoveries
2. **Cyclical behavior** — Bull/bear cycles driven by halving events, macro conditions, and sentiment
3. **Mean reversion on long timeframes** — Prices tend to return to long-term moving averages
4. **Retail emotion** — Most participants buy high (FOMO) and sell low (panic)

### The Opportunity

If we can systematically do the *opposite* of what emotional retail traders do:

- **Buy when others panic** (fear)
- **Sell when others are euphoric** (greed)
- **Hold patiently through volatility**

...we can capture the cyclical swings without trying to time exact tops and bottoms.

### Historical Evidence

Bitcoin's major cycles:

| Cycle | Peak | Trough | Drawdown | Recovery |
|-------|------|--------|----------|----------|
| 2013-2015 | $1,150 | $170 | -85% | +5,700% to next peak |
| 2017-2018 | $19,700 | $3,200 | -84% | +2,050% to next peak |
| 2021-2022 | $69,000 | $15,500 | -77% | +370% (ongoing) |

**Key insight**: Every major drawdown has been followed by new all-time highs. The challenge is having the patience and capital to hold through the pain.

---

## Why This Works (Theoretically)

### 1. Asymmetric Risk/Reward in Fear

When BTC is down 50%+ from ATH:
- **Downside**: Another 30-50% drop is possible (to -80% total)
- **Upside**: Historical recovery to new ATH is 100-500%+

The math favors buying fear *if you can hold through further drops*.

### 2. Mean Reversion

Price tends to oscillate around the 200-day moving average:
- Significant deviations below = buying opportunity
- Significant deviations above = profit-taking opportunity

### 3. Avoiding Emotional Mistakes

By codifying rules, we remove:
- FOMO buying at tops
- Panic selling at bottoms
- Overtrading (fee drag)
- Second-guessing during volatility

### 4. Time as an Edge

Unlike day trading, this strategy doesn't require:
- Speed (no HFT competition)
- Information edge (no insider knowledge needed)
- Constant monitoring (runs autonomously)

Our edge is simply **patience** and **discipline**.

---

## Market Regime Detection

### Inputs

The algorithm uses four primary signals:

#### 1. Distance from All-Time High (ATH)

```
percent_from_ath = ((current_price - ath) / ath) * 100
```

| Range | Interpretation |
|-------|----------------|
| -10% to 0% | Near ATH — late bull market |
| -10% to -30% | Correction — normal volatility |
| -30% to -50% | Bear market — accumulation zone |
| Below -50% | Capitulation — maximum fear |

#### 2. RSI (Relative Strength Index)

14-period RSI measures momentum:

```
RSI = 100 - (100 / (1 + RS))
RS = Average Gain / Average Loss (over 14 periods)
```

| Range | Interpretation |
|-------|----------------|
| 0-30 | Oversold — potential reversal up |
| 30-70 | Neutral |
| 70-100 | Overbought — potential reversal down |

#### 3. Price vs 200-Day Moving Average

```
ma_deviation = ((price - ma200) / ma200) * 100
```

| Range | Interpretation |
|-------|----------------|
| Below -20% | Deep undervaluation |
| -20% to 0% | Below trend — accumulate |
| 0% to +20% | Normal range |
| Above +20% | Extended — consider profit-taking |
| Above +50% | Extremely extended — high risk |

#### 4. 50/200 MA Cross (Golden/Death Cross)

- **Golden Cross**: 50 MA > 200 MA (bullish trend)
- **Death Cross**: 50 MA < 200 MA (bearish trend)

### Regime Calculation

Each signal contributes to a composite score from -100 to +100:

```typescript
let score = 0;

// Factor 1: Distance from ATH (-40 to +20 points)
if (percentFromAth <= -50) score -= 40;      // Extreme fear
else if (percentFromAth <= -30) score -= 25; // Fear
else if (percentFromAth >= -10) score += 20; // Near ATH

// Factor 2: RSI (-30 to +30 points)
if (rsi >= 85) score += 30;      // Extreme greed
else if (rsi >= 70) score += 20; // Greed
else if (rsi <= 30) score -= 30; // Extreme fear
else if (rsi <= 40) score -= 15; // Fear

// Factor 3: Price vs 200 MA (-20 to +20 points)
if (maDeviation < -20) score -= 20;  // Deep undervaluation
else if (maDeviation < 0) score -= 10;
else if (maDeviation > 50) score += 20;
else if (maDeviation > 20) score += 10;

// Factor 4: MA Cross (-10 to +10 points)
if (ma50 > ma200 * 1.05) score += 10;  // Golden cross
else if (ma50 < ma200 * 0.95) score -= 10; // Death cross
```

### Regime Mapping

| Score Range | Regime | Action |
|-------------|--------|--------|
| -100 to -50 | Extreme Fear | Aggressive accumulation |
| -50 to -20 | Fear | Regular accumulation |
| -20 to +20 | Neutral | Hold, no action |
| +20 to +50 | Greed | Consider profit-taking |
| +50 to +100 | Extreme Greed | Aggressive profit-taking |

---

## The Algorithm

### Main Loop

```
Every 1 hour:
  1. Fetch market data (price, OHLCV)
  2. Calculate technical indicators (RSI, MAs)
  3. Determine market regime
  4. Execute strategy based on regime
  5. Log all decisions
  6. Take performance snapshot
```

### Accumulation Logic (Fear Regimes)

```typescript
async function handleAccumulation(regime: MarketRegime) {
  // Determine DCA amount (50% more during extreme fear)
  const dcaAmount = regime === 'extreme_fear' 
    ? config.dcaAmountUsdt * 1.5 
    : config.dcaAmountUsdt;

  // Check position limit
  if (position.totalCostUsdt >= config.maxPositionUsdt) {
    log('Max position reached, waiting for distribution');
    return;
  }

  // Check timing (more frequent during extreme fear)
  const requiredHours = regime === 'extreme_fear'
    ? config.dcaFrequencyHours / 2
    : config.dcaFrequencyHours;

  if (hoursSinceLastDca < requiredHours) {
    log(`Next DCA in ${requiredHours - hoursSinceLastDca} hours`);
    return;
  }

  // Execute buy
  await executeBuy(dcaAmount);
}
```

### Distribution Logic (Greed Regimes)

```typescript
async function handleDistribution(regime: MarketRegime, unrealizedPnlPercent: number) {
  // Check if we have a position
  if (position.totalAmount <= 0) {
    log('No position to distribute');
    return;
  }

  // CRITICAL: Never sell at a loss
  if (unrealizedPnlPercent < config.minProfitToSell) {
    log(`P&L ${unrealizedPnlPercent}% below threshold (${config.minProfitToSell}%)`);
    return;
  }

  // Calculate sell amount (50% more during extreme greed)
  const sellPercentage = regime === 'extreme_greed'
    ? config.sellPercentage * 1.5
    : config.sellPercentage;

  const sellAmount = position.totalAmount * (sellPercentage / 100);

  // Execute sell
  await executeSell(sellAmount);
}
```

### Position Management

We track positions using weighted average cost basis:

```typescript
// On buy
newTotalAmount = position.totalAmount + buyAmount;
newTotalCost = position.totalCostUsdt + buyCost;
newAvgEntry = newTotalCost / newTotalAmount;

// On sell
costBasisOfSale = position.averageEntryPrice * sellAmount;
profit = saleProceeds - costBasisOfSale;
newTotalAmount = position.totalAmount - sellAmount;
newTotalCost = position.totalCostUsdt - costBasisOfSale;
```

---

## Risk Management

### 1. Never Sell at a Loss

The most important rule. The bot will hold indefinitely rather than realize a loss.

**Rationale**: Historically, BTC/ETH have always recovered from drawdowns. Selling at a loss locks in the loss permanently.

**Risk**: If the asset goes to zero, you lose everything. This is why we recommend BTC/ETH only.

### 2. Minimum Profit Threshold

The bot won't sell unless unrealized profit exceeds a minimum threshold (default: 10%).

**Why not higher (30%+)?**
- The regime detection is already doing the heavy lifting
- If we're in "greed" (RSI > 70, near ATH), the market is telling us to take profits
- Waiting for huge gains risks giving them back in the next correction
- More frequent small wins compound faster

**Why not lower (1-5%)?**
- Need to cover trading fees (typically 0.1-0.2% round trip)
- Very small gains may not justify the tax event
- Risk of whipsawing in volatile sideways markets

**Recommended range**: 5-15% depending on your preference
- **5%**: More aggressive profit-taking, more trades
- **10%**: Balanced (default)
- **15-20%**: More patient, fewer but larger wins

### 3. Position Size Limits

```typescript
if (position.totalCostUsdt >= config.maxPositionUsdt) {
  // Stop accumulating
}
```

**Rationale**: Prevents over-concentration. You shouldn't put your entire net worth into one asset.

### 4. Partial Profit-Taking

Instead of selling 100% at once, we sell 20-30% at a time.

**Rationale**: 
- Captures profits if it's the top
- Maintains exposure if it keeps going up
- Reduces timing risk

### 5. Error Recovery

```typescript
if (consecutiveErrors >= maxConsecutiveErrors) {
  await pauseBot();
  await sendAlert('Bot paused due to errors');
}
```

**Rationale**: If something is wrong (API issues, exchange problems), stop rather than make bad trades.

### 6. Full Audit Trail

Every decision is logged with:
- Timestamp
- Market conditions (price, regime, RSI)
- Action taken
- Reasoning

**Rationale**: Post-mortem analysis, debugging, regulatory compliance.

---

## Known Limitations

### 1. Tail Risk

The strategy assumes BTC/ETH will always recover. If cryptocurrency as an asset class fails, this strategy loses everything.

**Mitigation**: Only use with established assets (BTC, ETH). Never use with altcoins.

### 2. Opportunity Cost

Capital can be locked for months/years waiting for recovery.

**Mitigation**: Only use capital you don't need. This is not a short-term strategy.

### 3. Regime Detection Lag

By the time we detect "fear," the move may be mostly over. By the time we detect "greed," we may have missed the top.

**Mitigation**: This is acceptable. We're not trying to time exact tops/bottoms, just capture the bulk of the move.

### 4. Black Swan Events

Unprecedented events (exchange hacks, regulatory bans) could cause permanent value loss.

**Mitigation**: Use reputable exchanges, self-custody when possible, diversify across platforms.

### 5. Tax Implications

Each sale is a taxable event in most jurisdictions.

**Mitigation**: Consult a tax professional. Consider holding period for long-term capital gains treatment.

---

## Future Improvements

### Short Term

1. **Backtesting Engine** — Test strategy against historical data
2. **Alert System** — Email/SMS notifications for regime changes and trades
3. **Multiple Assets** — Run strategy across BTC, ETH simultaneously
4. **Custom Regime Weights** — Allow tuning of signal importance

### Medium Term

1. **On-Chain Metrics** — Add MVRV, SOPR, exchange flows
2. **Sentiment Analysis** — Fear & Greed Index integration
3. **Correlation Analysis** — Consider macro factors (DXY, SPX)
4. **Dynamic Position Sizing** — Kelly criterion based on conviction

### Long Term

1. **Machine Learning** — Train models on historical regime transitions
2. **Multi-Exchange Arbitrage** — Spread execution across venues
3. **Options Integration** — Hedge positions during uncertainty
4. **Social Features** — Share strategies, copy trading

---

## References

### Academic

- Fama, E. (1970). "Efficient Capital Markets: A Review of Theory and Empirical Work"
- Shiller, R. (2000). "Irrational Exuberance"
- Kahneman, D. (2011). "Thinking, Fast and Slow"

### Crypto-Specific

- PlanB. "Stock-to-Flow Model"
- Willy Woo. "On-Chain Analysis"
- Glassnode. "The Week On-Chain" reports

### Technical Analysis

- Wilder, J.W. (1978). "New Concepts in Technical Trading Systems" (RSI)
- Murphy, J.J. (1999). "Technical Analysis of the Financial Markets"

---

## Changelog

### v2.0.0 (Current)
- Complete rewrite with patient, regime-based strategy
- Added market regime detection (RSI, ATH, MAs)
- Implemented "never sell at loss" rule
- Added comprehensive logging and audit trail
- New dashboard with regime visualization

### v1.0.0 (Deprecated)
- Initial micro-trading approach
- Volatility-based entry/exit
- Fixed profit target and stop-loss
- Abandoned due to fee drag and lack of edge
