import ccxt, { Exchange, Ticker, OHLCV } from "ccxt";

export interface OrderResult {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  amount: number;
  price: number;
  cost: number;
  fee: number;
  status: "open" | "closed" | "cancelled";
  timestamp: number;
}

export class ExchangeService {
  // Public connection for market data (no auth needed)
  private publicExchange: Exchange | null = null;
  // Authenticated connection for trading
  private authExchange: Exchange | null = null;
  private isTestMode: boolean;
  private lastAuthAttempt: number = 0;
  private authCooldown: number = 30000; // 30 seconds between auth attempts

  // Cache for ticker data to prevent rate limiting
  private tickerCache: Map<string, { data: Ticker; timestamp: number }> =
    new Map();
  private tickerCacheTTL: number = 30000; // Cache ticker for 30 seconds

  constructor() {
    this.isTestMode = process.env.EXCHANGE_TEST_MODE === "true";
  }

  /**
   * Get public exchange for market data (no authentication needed)
   */
  private async getPublicExchange(): Promise<Exchange> {
    if (this.publicExchange) return this.publicExchange;

    // Use Kraken for public data - works everywhere, good data
    this.publicExchange = new ccxt.kraken({
      enableRateLimit: true,
    });

    await this.publicExchange.loadMarkets();
    console.log("✅ Connected to Kraken (public market data)");
    return this.publicExchange;
  }

  /**
   * Get authenticated exchange for trading operations
   */
  private async getAuthExchange(): Promise<Exchange> {
    if (this.authExchange) return this.authExchange;

    // Prevent rapid reconnection attempts
    const now = Date.now();
    if (now - this.lastAuthAttempt < this.authCooldown) {
      throw new Error("Exchange connection cooling down. Please wait.");
    }
    this.lastAuthAttempt = now;

    const exchangeId = process.env.EXCHANGE_ID || "kraken";

    try {
      const ExchangeClass = ccxt[exchangeId as keyof typeof ccxt] as new (
        config: object
      ) => Exchange;

      // Note: Kraken doesn't have a public sandbox
      const useSandbox =
        this.isTestMode &&
        !["kraken", "coinbasepro", "coinbase"].includes(exchangeId);

      this.authExchange = new ExchangeClass({
        apiKey: process.env.EXCHANGE_API_KEY,
        secret: process.env.EXCHANGE_SECRET,
        sandbox: useSandbox,
        enableRateLimit: true,
        options: {
          defaultType: "spot",
          adjustForTimeDifference: true,
        },
      });

      if (useSandbox) {
        this.authExchange.setSandboxMode(true);
      }

      await this.authExchange.loadMarkets();
      console.log(
        `✅ Connected to ${exchangeId} for trading (${
          this.isTestMode ? "TEST MODE" : "LIVE"
        })`
      );

      return this.authExchange;
    } catch (error) {
      this.authExchange = null;
      throw error;
    }
  }

  /**
   * Normalize symbol for Kraken (uses USD instead of USDT)
   */
  private normalizeSymbol(symbol: string): string {
    return symbol.replace("/USDT", "/USD");
  }

  /**
   * Get current ticker data (public, no auth needed, cached for 30s)
   */
  async getTicker(symbol: string): Promise<Ticker> {
    const fetchSymbol = this.normalizeSymbol(symbol);

    // Check cache first
    const cached = this.tickerCache.get(fetchSymbol);
    if (cached && Date.now() - cached.timestamp < this.tickerCacheTTL) {
      return cached.data;
    }

    const exchange = await this.getPublicExchange();
    const ticker = await exchange.fetchTicker(fetchSymbol);

    // Cache the result
    this.tickerCache.set(fetchSymbol, { data: ticker, timestamp: Date.now() });
    return ticker;
  }

  /**
   * Get OHLCV candlestick data (public, no auth needed)
   */
  async getOHLCV(
    symbol: string,
    timeframe: string = "1d",
    limit: number = 200
  ): Promise<OHLCV[]> {
    const exchange = await this.getPublicExchange();
    const fetchSymbol = this.normalizeSymbol(symbol);
    return await exchange.fetchOHLCV(fetchSymbol, timeframe, undefined, limit);
  }

  /**
   * Get account balance (requires auth)
   */
  async getBalance() {
    const exchange = await this.getAuthExchange();
    const balance = await exchange.fetchBalance();
    return {
      total: balance.total,
      free: balance.free,
      used: balance.used,
    };
  }

  /**
   * Execute a market buy order (requires auth, or simulates in test mode)
   */
  async marketBuy(symbol: string, amountUsdt: number): Promise<OrderResult> {
    const ticker = await this.getTicker(symbol);
    const price = ticker.last || 0;
    const amount = amountUsdt / price;

    if (this.isTestMode) {
      return this.simulateOrder(symbol, "buy", amount, price, amountUsdt);
    }

    const exchange = await this.getAuthExchange();
    const tradingSymbol = this.normalizeSymbol(symbol);
    const order = await exchange.createMarketBuyOrder(tradingSymbol, amount);

    return {
      id: order.id,
      symbol: order.symbol,
      side: "buy",
      type: "market",
      amount: order.amount || amount,
      price: order.average || order.price || price,
      cost: order.cost || amountUsdt,
      fee: order.fee?.cost || amountUsdt * 0.001,
      status: order.status as "open" | "closed" | "cancelled",
      timestamp: order.timestamp || Date.now(),
    };
  }

  /**
   * Execute a market sell order (requires auth, or simulates in test mode)
   */
  async marketSell(symbol: string, amount: number): Promise<OrderResult> {
    const ticker = await this.getTicker(symbol);
    const price = ticker.last || 0;
    const valueUsdt = amount * price;

    if (this.isTestMode) {
      return this.simulateOrder(symbol, "sell", amount, price, valueUsdt);
    }

    const exchange = await this.getAuthExchange();
    const tradingSymbol = this.normalizeSymbol(symbol);
    const order = await exchange.createMarketSellOrder(tradingSymbol, amount);

    return {
      id: order.id,
      symbol: order.symbol,
      side: "sell",
      type: "market",
      amount: order.amount || amount,
      price: order.average || order.price || price,
      cost: order.cost || valueUsdt,
      fee: order.fee?.cost || valueUsdt * 0.001,
      status: order.status as "open" | "closed" | "cancelled",
      timestamp: order.timestamp || Date.now(),
    };
  }

  /**
   * Simulate an order for test mode
   */
  private simulateOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
    price: number,
    cost: number
  ): OrderResult {
    const fee = cost * 0.001; // 0.1% fee simulation

    console.log(
      `🧪 SIMULATED ${side.toUpperCase()}: ${amount.toFixed(
        8
      )} ${symbol} @ $${price.toFixed(2)} = $${cost.toFixed(2)}`
    );

    return {
      id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      side,
      type: "market",
      amount,
      price,
      cost,
      fee,
      status: "closed",
      timestamp: Date.now(),
    };
  }

  /**
   * Check if we're in test mode
   */
  isInTestMode(): boolean {
    return this.isTestMode;
  }

  /**
   * Health check (uses public API, always works)
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    exchange: string;
    testMode: boolean;
    error?: string;
  }> {
    try {
      const exchange = await this.getPublicExchange();
      await exchange.fetchTime();
      return {
        healthy: true,
        exchange: "kraken",
        testMode: this.isTestMode,
      };
    } catch (error) {
      return {
        healthy: false,
        exchange: "kraken",
        testMode: this.isTestMode,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Reset connections (useful after config changes)
   */
  resetConnections(): void {
    this.publicExchange = null;
    this.authExchange = null;
    this.lastAuthAttempt = 0;
    console.log("🔄 Exchange connections reset");
  }
}

export const exchangeService = new ExchangeService();
