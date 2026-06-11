import type { Candlestick } from "@/features/trading-agent/types";

/** Latest known price snapshot for a single symbol */
export interface PriceSnapshot {
  symbol: string;
  lastPrice: number;
  high24h: number;
  low24h: number;
  baseVolume: number;      // coin volume (e.g. BTC)
  quoteVolume: number;     // USDT volume
  changePercent: number;   // 24h % change
  updatedAt: Date;         // timestamp of last WS update
}

/** ──────────────── Price Store ───────────────────── */

export class PriceStore {
  public isBacktesting = false;

  /** Ticker snapshots keyed by symbol */
  private tickers = new Map<string, PriceSnapshot>();

  /** Candle data — key: `${symbol}:${interval}` → array of recent candles */
  private candles = new Map<string, Candlestick[]>();

  /** Max candles to keep per symbol+interval */
  private maxCandles = 50;

  /** ─── Ticker operations ─────────────────────────── */

  updateTicker(snapshot: PriceSnapshot): void {
    this.tickers.set(snapshot.symbol, snapshot);
  }

  getCached(symbol: string): PriceSnapshot | undefined {
    return this.tickers.get(symbol.toUpperCase());
  }

  getAll(): Map<string, PriceSnapshot> {
    return new Map(this.tickers);
  }

  /** Returns a standardized ticker object for use across the application */
  buildTickerObj(snapshot: PriceSnapshot | undefined): {
    symbol: string;
    lastPrice: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    change24hPercent: number;
  } | null {
    if (!snapshot || !snapshot.lastPrice) return null;
    return {
      symbol: snapshot.symbol,
      lastPrice: snapshot.lastPrice,
      high24h: snapshot.high24h ?? snapshot.lastPrice,
      low24h: snapshot.low24h ?? snapshot.lastPrice,
      volume24h: snapshot.quoteVolume ?? 0,
      change24hPercent: snapshot.changePercent ?? 0,
    };
  }

  /** Check if a symbol's latest tick is older than threshold */
  isStale(symbol: string, thresholdMs = 60_000): boolean {
    const snapshot = this.tickers.get(symbol.toUpperCase());
    if (!snapshot) return true; // never seen → definitely stale
    return Date.now() - snapshot.updatedAt.getTime() > thresholdMs;
  }

  getLatestPrice(symbol: string): number {
    return this.tickers.get(symbol.toUpperCase())?.lastPrice ?? 0;
  }

  /** ─── Candle operations ─────────────────────────── */

  updateCandle(symbol: string, interval: string, candle: Candlestick): void {
    const key = `${symbol.toUpperCase()}:${interval}`;
    const existing = this.candles.get(key) ?? [];

    // Avoid duplicate timestamps
    if (existing.length > 0 && existing[existing.length - 1].timestamp === candle.timestamp) {
      // Update the last candle in-place (WS candles are incremental)
      existing[existing.length - 1] = candle;
    } else {
      existing.push(candle);
      if (existing.length > this.maxCandles) {
        existing.splice(0, existing.length - this.maxCandles);
      }
    }

    this.candles.set(key, existing);
  }

  getCandles(symbol: string, interval: string): Candlestick[] | undefined {
    return this.candles.get(`${symbol.toUpperCase()}:${interval}`);
  }

  setCandles(symbol: string, interval: string, candles: Candlestick[]): void {
    const key = `${symbol.toUpperCase()}:${interval}`;
    this.candles.set(key, [...candles]);
  }

  /** Get most recent candle close price for a symbol+interval */
  getLatestCandleClose(symbol: string, interval: string): number {
    const candles = this.candles.get(`${symbol.toUpperCase()}:${interval}`);
    return candles?.[candles.length - 1]?.close ?? 0;
  }

  /** Check if candle cache is stale (older than TTL) */
  isCandleStale(symbol: string, interval: string, ttlMs = 5 * 60_000): boolean {
    if (this.isBacktesting) return false;
    const candles = this.candles.get(`${symbol.toUpperCase()}:${interval}`);
    if (!candles || candles.length === 0) return true;
    return Date.now() - candles[candles.length - 1].timestamp > ttlMs;
  }

  /** ─── Utilities ─────────────────────────────────── */

  getSymbolCount(): number {
    return this.tickers.size;
  }

  has(symbol: string): boolean {
    return this.tickers.has(symbol.toUpperCase());
  }
}

// ─────────────── singleton export ───────────────────

export const priceStore = new PriceStore();
