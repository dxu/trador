import { eq, desc, and, isNull } from 'drizzle-orm';
import { 
  db, 
  botConfig, 
  strategies,
  positions, 
  transactions, 
  botLogs, 
  performanceSnapshots,
  STRATEGY_PRESETS,
  type BotConfig, 
  type Strategy,
  type Position, 
  type MarketRegime,
  type RiskProfile,
} from '../db';
import { exchangeService } from './exchange';
import { marketAnalysisService, type MarketAnalysis } from './marketAnalysis';

// ============================================================================
// TRADING BOT - Multi-Strategy Patient Regime-Based Trading
// ============================================================================

export class TradingBot {
  private config: BotConfig | null = null;
  private isRunning = false;
  private intervalId: Timer | null = null;
  
  // Check every hour
  private checkIntervalMs = 60 * 60 * 1000;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<BotConfig> {
    // Get or create global config
    const configs = await db.select().from(botConfig).limit(1);
    
    if (configs.length === 0) {
      const [newConfig] = await db.insert(botConfig).values({}).returning();
      this.config = newConfig;
      await this.log(null, 'info', 'config', 'Bot initialized with default configuration');
      
      // Create default strategies
      await this.initializeDefaultStrategies();
    } else {
      this.config = configs[0];
      await this.log(null, 'info', 'config', 'Bot loaded existing configuration');
    }
    
    return this.config;
  }

  private async initializeDefaultStrategies(): Promise<void> {
    const existingStrategies = await db.select().from(strategies);
    
    if (existingStrategies.length === 0) {
      // Create all three default strategies
      for (const profile of ['conservative', 'moderate', 'aggressive'] as RiskProfile[]) {
        const preset = STRATEGY_PRESETS[profile];
        await db.insert(strategies).values(preset);
      }
      await this.log(null, 'info', 'config', 'Created default strategies: Conservative (30%), Moderate (40%), Aggressive (30%)');
    }
  }

  // ============================================================================
  // BOT CONTROL
  // ============================================================================

  async start(): Promise<void> {
    if (!this.config) await this.initialize();
    if (this.isRunning) {
      await this.log(null, 'warn', 'control', 'Bot is already running');
      return;
    }

    this.isRunning = true;
    await this.updateStatus('running');
    await this.log(null, 'info', 'control', '🚀 Trading bot started (multi-strategy mode)');

    // Run immediately, then on interval
    await this.runCycle();
    this.intervalId = setInterval(() => this.runCycle(), this.checkIntervalMs);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await this.updateStatus('stopped');
    await this.log(null, 'info', 'control', '⏹️ Trading bot stopped');
  }

  async pause(): Promise<void> {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await this.updateStatus('paused');
    await this.log(null, 'info', 'control', '⏸️ Trading bot paused');
  }

  // ============================================================================
  // MAIN TRADING CYCLE
  // ============================================================================

  private async runCycle(): Promise<void> {
    if (!this.isRunning || !this.config) return;

    const cycleId = Date.now().toString(36);
    
    try {
      await this.log(null, 'info', 'cycle', `[${cycleId}] Starting multi-strategy analysis cycle`);

      // 1. Get all enabled strategies
      const activeStrategies = await db.select()
        .from(strategies)
        .where(eq(strategies.enabled, true));

      if (activeStrategies.length === 0) {
        await this.log(null, 'warn', 'cycle', 'No enabled strategies found');
        return;
      }

      // 2. Analyze market (shared across strategies)
      const analysis = await marketAnalysisService.analyze(this.config.symbol);
      await marketAnalysisService.saveSnapshot(analysis);

      await this.log(null, 'info', 'regime', 
        `${analysis.regimeDescription} | Price: $${analysis.price.toFixed(2)} | RSI: ${analysis.rsi14.toFixed(0)} | From ATH: ${analysis.percentFromAth.toFixed(1)}%`,
        { regime: analysis.regime, price: analysis.price }
      );

      // 3. Execute each strategy
      for (const strategy of activeStrategies) {
        await this.executeStrategy(strategy, analysis);
      }

      // 4. Take combined performance snapshot
      await this.takeCombinedPerformanceSnapshot(analysis, activeStrategies);

      // 5. Reset error counter
      await this.resetErrors();

      await this.log(null, 'info', 'cycle', `[${cycleId}] Cycle completed for ${activeStrategies.length} strategies`);

    } catch (error) {
      await this.handleError(error);
    }
  }

  // ============================================================================
  // STRATEGY EXECUTION
  // ============================================================================

  private async executeStrategy(strategy: Strategy, analysis: MarketAnalysis): Promise<void> {
    const { regime, price } = analysis;

    // Get regime based on THIS strategy's thresholds
    const strategyRegime = this.determineRegimeForStrategy(analysis, strategy);

    // Get or create position for this strategy
    const position = await this.getOrCreatePosition(strategy);

    // Calculate P&L
    const currentValue = position.totalAmount * price;
    const unrealizedPnl = currentValue - position.totalCostUsdt;
    const unrealizedPnlPercent = position.totalCostUsdt > 0 
      ? (unrealizedPnl / position.totalCostUsdt) * 100 
      : 0;

    await this.log(strategy.id, 'info', 'strategy', 
      `[${strategy.name}] Regime: ${strategyRegime} | Position: $${position.totalCostUsdt.toFixed(2)} | P&L: ${unrealizedPnlPercent.toFixed(1)}%`
    );

    // Execute based on regime
    if (strategyRegime === 'extreme_fear' || strategyRegime === 'fear') {
      await this.handleAccumulation(strategy, analysis, position, strategyRegime);
    } else if (strategyRegime === 'greed' || strategyRegime === 'extreme_greed') {
      await this.handleDistribution(strategy, analysis, position, unrealizedPnlPercent, strategyRegime);
    } else {
      await this.log(strategy.id, 'info', 'strategy', 
        `[${strategy.name}] HOLD - Market neutral for this strategy's thresholds`
      );
    }

    // Take strategy-specific performance snapshot
    await this.takeStrategyPerformanceSnapshot(strategy, analysis, position);
  }

  /**
   * Each strategy can have different thresholds, so we recalculate regime per strategy
   */
  private determineRegimeForStrategy(analysis: MarketAnalysis, strategy: Strategy): MarketRegime {
    const { percentFromAth, rsi14 } = analysis;

    // Check fear conditions with this strategy's thresholds
    if (percentFromAth <= strategy.extremeFearThreshold || rsi14 <= 30) {
      return 'extreme_fear';
    }
    if (percentFromAth <= strategy.fearThreshold || rsi14 <= 40) {
      return 'fear';
    }

    // Check greed conditions
    if (rsi14 >= strategy.extremeGreedRsiThreshold) {
      return 'extreme_greed';
    }
    if (rsi14 >= strategy.greedRsiThreshold) {
      return 'greed';
    }

    return 'neutral';
  }

  // ============================================================================
  // ACCUMULATION (DCA during fear)
  // ============================================================================

  private async handleAccumulation(
    strategy: Strategy,
    analysis: MarketAnalysis, 
    position: Position, 
    regime: MarketRegime
  ): Promise<void> {
    const { price } = analysis;
    
    // Calculate DCA amount (boost during extreme fear)
    const dcaAmount = regime === 'extreme_fear' 
      ? strategy.dcaAmountUsdt * 1.5 
      : strategy.dcaAmountUsdt;

    // Check position limit
    if (position.totalCostUsdt >= strategy.maxPositionUsdt) {
      await this.log(strategy.id, 'info', 'strategy', 
        `[${strategy.name}] HOLD - Max position reached ($${position.totalCostUsdt.toFixed(2)}/$${strategy.maxPositionUsdt})`
      );
      return;
    }

    // Check DCA timing
    const lastDca = strategy.lastDcaAt ? new Date(strategy.lastDcaAt).getTime() : 0;
    const hoursSinceLastDca = (Date.now() - lastDca) / (1000 * 60 * 60);
    const requiredHours = regime === 'extreme_fear' 
      ? strategy.dcaFrequencyHours / 2 
      : strategy.dcaFrequencyHours;

    if (hoursSinceLastDca < requiredHours) {
      const hoursRemaining = (requiredHours - hoursSinceLastDca).toFixed(1);
      await this.log(strategy.id, 'info', 'strategy', 
        `[${strategy.name}] WAIT - Next DCA in ${hoursRemaining}h`
      );
      return;
    }

    // Execute buy
    await this.log(strategy.id, 'action', 'trade', 
      `[${strategy.name}] 🟢 ACCUMULATING $${dcaAmount.toFixed(2)} in ${regime.toUpperCase()}`,
      { regime, price }
    );

    await this.executeBuy(strategy, position, dcaAmount, price, analysis, regime);
  }

  // ============================================================================
  // DISTRIBUTION (Take profits during greed)
  // ============================================================================

  private async handleDistribution(
    strategy: Strategy,
    analysis: MarketAnalysis, 
    position: Position, 
    unrealizedPnlPercent: number,
    regime: MarketRegime
  ): Promise<void> {
    const { price } = analysis;

    // Check if we have a position
    if (position.totalAmount <= 0) {
      await this.log(strategy.id, 'info', 'strategy', 
        `[${strategy.name}] SKIP - No position to distribute`
      );
      return;
    }

    // CRITICAL: Never sell at a loss
    if (unrealizedPnlPercent < strategy.minProfitToSell) {
      await this.log(strategy.id, 'info', 'strategy', 
        `[${strategy.name}] HOLD - P&L ${unrealizedPnlPercent.toFixed(1)}% below threshold (${strategy.minProfitToSell}%)`
      );
      return;
    }

    // Calculate sell amount (boost during extreme greed)
    const sellPercentage = regime === 'extreme_greed'
      ? strategy.sellPercentage * 1.5
      : strategy.sellPercentage;
    
    const sellAmount = position.totalAmount * (sellPercentage / 100);
    const sellValue = sellAmount * price;

    await this.log(strategy.id, 'action', 'trade', 
      `[${strategy.name}] 🔴 DISTRIBUTING ${sellPercentage.toFixed(0)}% ($${sellValue.toFixed(2)}) at ${unrealizedPnlPercent.toFixed(1)}% profit`,
      { regime, price }
    );

    await this.executeSell(strategy, position, sellAmount, price, analysis, regime);
  }

  // ============================================================================
  // TRADE EXECUTION
  // ============================================================================

  private async executeBuy(
    strategy: Strategy,
    position: Position, 
    amountUsdt: number, 
    currentPrice: number,
    analysis: MarketAnalysis,
    regime: MarketRegime
  ): Promise<void> {
    try {
      const order = await exchangeService.marketBuy(this.config!.symbol, amountUsdt);
      
      // Update position
      const newTotalAmount = position.totalAmount + order.amount;
      const newTotalCost = position.totalCostUsdt + order.cost;
      const newAvgEntry = newTotalCost / newTotalAmount;

      await db.update(positions)
        .set({
          totalAmount: newTotalAmount,
          totalCostUsdt: newTotalCost,
          averageEntryPrice: newAvgEntry,
          totalBuys: position.totalBuys + 1,
          firstBuyAt: position.firstBuyAt || new Date(),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(positions.id, position.id));

      // Update strategy's last DCA time
      await db.update(strategies)
        .set({ lastDcaAt: new Date(), updatedAt: new Date() })
        .where(eq(strategies.id, strategy.id));

      // Record transaction
      await db.insert(transactions).values({
        positionId: position.id,
        strategyId: strategy.id,
        symbol: this.config!.symbol,
        action: 'buy',
        amount: order.amount,
        price: order.price,
        valueUsdt: order.cost,
        fee: order.fee,
        regime,
        regimeScore: analysis.regimeScore,
        reason: `[${strategy.name}] DCA in ${regime}. RSI: ${analysis.rsi14.toFixed(0)}, ${analysis.percentFromAth.toFixed(1)}% from ATH`,
        exchangeOrderId: order.id,
      });

      await this.log(strategy.id, 'action', 'trade', 
        `[${strategy.name}] ✅ BUY: ${order.amount.toFixed(8)} @ $${order.price.toFixed(2)} = $${order.cost.toFixed(2)}`,
        { regime, price: order.price }
      );

    } catch (error) {
      await this.log(strategy.id, 'error', 'trade', 
        `[${strategy.name}] Buy failed: ${error instanceof Error ? error.message : 'Unknown'}`
      );
      throw error;
    }
  }

  private async executeSell(
    strategy: Strategy,
    position: Position, 
    amount: number, 
    currentPrice: number,
    analysis: MarketAnalysis,
    regime: MarketRegime
  ): Promise<void> {
    try {
      const order = await exchangeService.marketSell(this.config!.symbol, amount);
      
      // Calculate profit
      const costBasis = (position.averageEntryPrice || 0) * amount;
      const profitUsdt = order.cost - costBasis - order.fee;
      const profitPercent = costBasis > 0 ? (profitUsdt / costBasis) * 100 : 0;

      // Update position
      const newTotalAmount = position.totalAmount - amount;
      const newTotalCost = position.totalCostUsdt - costBasis;
      const newRealizedProfit = position.realizedProfitUsdt + profitUsdt;

      await db.update(positions)
        .set({
          totalAmount: newTotalAmount,
          totalCostUsdt: Math.max(0, newTotalCost),
          realizedProfitUsdt: newRealizedProfit,
          totalSells: position.totalSells + 1,
          lastActivityAt: new Date(),
          status: newTotalAmount <= 0 ? 'closed' : 'partial',
          updatedAt: new Date(),
        })
        .where(eq(positions.id, position.id));

      // Record transaction
      await db.insert(transactions).values({
        positionId: position.id,
        strategyId: strategy.id,
        symbol: this.config!.symbol,
        action: 'sell',
        amount: order.amount,
        price: order.price,
        valueUsdt: order.cost,
        fee: order.fee,
        regime,
        regimeScore: analysis.regimeScore,
        reason: `[${strategy.name}] Profit taking in ${regime}. RSI: ${analysis.rsi14.toFixed(0)}`,
        costBasisUsdt: costBasis,
        profitUsdt,
        profitPercent,
        exchangeOrderId: order.id,
      });

      const emoji = profitUsdt >= 0 ? '💰' : '📉';
      await this.log(strategy.id, 'action', 'trade', 
        `[${strategy.name}] ${emoji} SELL: ${order.amount.toFixed(8)} @ $${order.price.toFixed(2)} | Profit: $${profitUsdt.toFixed(2)} (${profitPercent.toFixed(1)}%)`,
        { regime, price: order.price }
      );

    } catch (error) {
      await this.log(strategy.id, 'error', 'trade', 
        `[${strategy.name}] Sell failed: ${error instanceof Error ? error.message : 'Unknown'}`
      );
      throw error;
    }
  }

  // ============================================================================
  // POSITION MANAGEMENT
  // ============================================================================

  private async getOrCreatePosition(strategy: Strategy): Promise<Position> {
    const [existing] = await db.select()
      .from(positions)
      .where(and(
        eq(positions.strategyId, strategy.id),
        eq(positions.symbol, this.config!.symbol),
        eq(positions.status, 'open')
      ))
      .limit(1);

    if (existing) return existing;

    // Check for partial position
    const [partial] = await db.select()
      .from(positions)
      .where(and(
        eq(positions.strategyId, strategy.id),
        eq(positions.symbol, this.config!.symbol),
        eq(positions.status, 'partial')
      ))
      .limit(1);

    if (partial) return partial;

    // Create new position
    const [newPosition] = await db.insert(positions)
      .values({ 
        strategyId: strategy.id,
        symbol: this.config!.symbol, 
        status: 'open' 
      })
      .returning();

    return newPosition;
  }

  // ============================================================================
  // PERFORMANCE TRACKING
  // ============================================================================

  private async takeStrategyPerformanceSnapshot(
    strategy: Strategy,
    analysis: MarketAnalysis, 
    position: Position
  ): Promise<void> {
    const cryptoValue = position.totalAmount * analysis.price;
    const unrealizedProfit = cryptoValue - position.totalCostUsdt;
    const totalProfit = unrealizedProfit + position.realizedProfitUsdt;

    await db.insert(performanceSnapshots).values({
      strategyId: strategy.id,
      totalValueUsdt: cryptoValue + position.realizedProfitUsdt,
      totalCostBasisUsdt: position.totalCostUsdt,
      cashUsdt: 0,
      cryptoAmount: position.totalAmount,
      cryptoValueUsdt: cryptoValue,
      currentPrice: analysis.price,
      unrealizedProfitUsdt: unrealizedProfit,
      unrealizedProfitPercent: position.totalCostUsdt > 0 ? (unrealizedProfit / position.totalCostUsdt) * 100 : 0,
      realizedProfitUsdt: position.realizedProfitUsdt,
      totalProfitUsdt: totalProfit,
      totalProfitPercent: position.totalCostUsdt > 0 ? (totalProfit / position.totalCostUsdt) * 100 : 0,
      regime: analysis.regime,
      regimeScore: analysis.regimeScore,
    });
  }

  private async takeCombinedPerformanceSnapshot(
    analysis: MarketAnalysis,
    activeStrategies: Strategy[]
  ): Promise<void> {
    let totalCrypto = 0;
    let totalCostBasis = 0;
    let totalRealized = 0;

    for (const strategy of activeStrategies) {
      const [position] = await db.select()
        .from(positions)
        .where(and(
          eq(positions.strategyId, strategy.id),
          eq(positions.status, 'open')
        ))
        .limit(1);

      if (position) {
        totalCrypto += position.totalAmount;
        totalCostBasis += position.totalCostUsdt;
        totalRealized += position.realizedProfitUsdt;
      }
    }

    const totalValue = totalCrypto * analysis.price;
    const unrealizedProfit = totalValue - totalCostBasis;
    const totalProfit = unrealizedProfit + totalRealized;

    // Combined snapshot (strategyId = null)
    await db.insert(performanceSnapshots).values({
      strategyId: null,
      totalValueUsdt: totalValue + totalRealized,
      totalCostBasisUsdt: totalCostBasis,
      cashUsdt: 0,
      cryptoAmount: totalCrypto,
      cryptoValueUsdt: totalValue,
      currentPrice: analysis.price,
      unrealizedProfitUsdt: unrealizedProfit,
      unrealizedProfitPercent: totalCostBasis > 0 ? (unrealizedProfit / totalCostBasis) * 100 : 0,
      realizedProfitUsdt: totalRealized,
      totalProfitUsdt: totalProfit,
      totalProfitPercent: totalCostBasis > 0 ? (totalProfit / totalCostBasis) * 100 : 0,
      regime: analysis.regime,
      regimeScore: analysis.regimeScore,
    });
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  private async handleError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await this.log(null, 'error', 'error', `Cycle error: ${errorMessage}`);

    if (this.config) {
      const newErrorCount = this.config.consecutiveErrors + 1;
      
      await db.update(botConfig)
        .set({
          consecutiveErrors: newErrorCount,
          lastError: errorMessage,
          lastErrorAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(botConfig.id, this.config.id));

      this.config.consecutiveErrors = newErrorCount;

      if (newErrorCount >= this.config.maxConsecutiveErrors) {
        await this.log(null, 'error', 'health', 
          `⚠️ Too many errors (${newErrorCount}). Bot auto-paused.`
        );
        await this.pause();
        await this.updateStatus('error');
      }
    }
  }

  private async resetErrors(): Promise<void> {
    if (this.config && this.config.consecutiveErrors > 0) {
      await db.update(botConfig)
        .set({ consecutiveErrors: 0, updatedAt: new Date() })
        .where(eq(botConfig.id, this.config.id));
      this.config.consecutiveErrors = 0;
    }
  }

  // ============================================================================
  // LOGGING
  // ============================================================================

  private async log(
    strategyId: string | null,
    level: string, 
    category: string, 
    message: string, 
    context?: { regime?: MarketRegime; price?: number; data?: object }
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const prefix = { info: 'ℹ️', warn: '⚠️', error: '❌', action: '⚡' }[level] || '📝';

    console.log(`[${timestamp}] ${prefix} [${category.toUpperCase()}] ${message}`);

    await db.insert(botLogs).values({
      strategyId,
      level,
      category,
      message,
      regime: context?.regime,
      price: context?.price,
      data: context?.data,
    });
  }

  // ============================================================================
  // CONFIG & STRATEGY MANAGEMENT
  // ============================================================================

  private async updateStatus(status: 'running' | 'paused' | 'stopped' | 'error'): Promise<void> {
    if (this.config) {
      await db.update(botConfig)
        .set({ status, updatedAt: new Date() })
        .where(eq(botConfig.id, this.config.id));
      this.config.status = status;
    }
  }

  async updateConfig(updates: Partial<BotConfig>): Promise<BotConfig> {
    if (!this.config) await this.initialize();

    const [updated] = await db.update(botConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(botConfig.id, this.config!.id))
      .returning();

    this.config = updated;
    return this.config;
  }

  async getStrategies(): Promise<Strategy[]> {
    return await db.select().from(strategies).orderBy(strategies.riskProfile);
  }

  async updateStrategy(strategyId: string, updates: Partial<Strategy>): Promise<Strategy> {
    const [updated] = await db.update(strategies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(strategies.id, strategyId))
      .returning();

    await this.log(strategyId, 'info', 'config', `Strategy updated: ${updated.name}`);
    return updated;
  }

  async toggleStrategy(strategyId: string, enabled: boolean): Promise<Strategy> {
    return this.updateStrategy(strategyId, { enabled });
  }

  getConfig(): BotConfig | null {
    return this.config;
  }

  getStatus(): { isRunning: boolean; status: string; config: BotConfig | null } {
    return {
      isRunning: this.isRunning,
      status: this.config?.status || 'unknown',
      config: this.config,
    };
  }

  async runManualCycle(): Promise<void> {
    if (!this.config) await this.initialize();
    await this.runCycle();
  }
}

export const tradingBot = new TradingBot();
