import type { TickerData, OrderBook, Candlestick } from "../types";
import { proxyFetch } from "./proxy-client";

const BITGET_API = "https://api.bitget.com/api/v2/spot/market";

/** Fetch with Node.js native fetch (no proxy) */
async function bitgetDirect<T>(path: string): Promise<T> {
  try {
    const res = await fetch(`${BITGET_API}${path}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Bitget ${res.status} on ${path}`);
    return (await res.json()) as T;
  } catch (err) {
    throw new Error(`Bitget ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Fetch via WebShare proxy using subprocess curl */
async function bitgetProxy<T>(path: string): Promise<T> {
  try {
    return await proxyFetch<T>(`${BITGET_API}${path}`);
  } catch (err) {
    throw new Error(`Bitget ${path} via proxy failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Generic fetch — uses proxy if configured, otherwise direct */
async function bitgetFetch<T>(path: string): Promise<T> {
  const hasProxy = !!process.env.BITGET_PROXY;
  if (hasProxy) return bitgetProxy<T>(path);
  return bitgetDirect<T>(path);
}

/** Fetch latest ticker price for a symbol. */
export async function getTickerPrice(symbol: string): Promise<TickerData> {
  const resp = await bitgetFetch<{
    code: string;
    msg: string;
    data: Array<{
      symbol: string;
      lastPr: string;
      high24h: string;
      low24h: string;
      quoteVolume: string;
      changeUtc24h: string;
      ts: string;
    }>;
  }>(`/tickers?symbol=${symbol}`);

  const ticker = resp.data.find((t) => t.symbol === symbol);
  if (!ticker) throw new Error(`Ticker not found for ${symbol}`);

  return {
    symbol,
    lastPrice: Math.round(Number(ticker.lastPr)),
    high24h: Number(ticker.high24h),
    low24h: Number(ticker.low24h),
    volume24h: Number(ticker.quoteVolume),
    change24hPercent: Number((Number(ticker.changeUtc24h) * 100).toFixed(2)),
    timestamp: new Date(Number(ticker.ts)),
  };
}

/** Fetch order book depth for a symbol. */
export async function getOrderBook(symbol: string, depth: number = 20): Promise<OrderBook> {
  const resp = await bitgetFetch<{
    code: string;
    msg: string;
    data: { asks: [string, string][]; bids: [string, string][] } | null;
  }>(`/orderbook?symbol=${symbol}&type=step0&limit=${depth}`);

  const book = resp.data ?? { asks: [], bids: [] };
  return {
    bids: (book.bids ?? []).slice(0, depth).map((b) => ({ price: Number(b[0]), size: Number(b[1]) })),
    asks: (book.asks ?? []).slice(0, depth).map((a) => ({ price: Number(a[0]), size: Number(a[1]) })),
    timestamp: new Date(),
  };
}

/** Fetch candlestick (kline) data for backtesting or charting. */
export async function getCandlestickData(
  symbol: string,
  interval: string = "1h",
  limit: number = 200
): Promise<Candlestick[]> {
  const granularityMap: Record<string, string> = {
    "1m": "1min", "3m": "3min", "5m": "5min", "15m": "15min",
    "30m": "30min", "1h": "1h", "4h": "4h", "6h": "6h",
    "12h": "12h", "1d": "1day", "1w": "1week", "1M": "1M",
  };
  const gran = granularityMap[interval] ?? "1h";

  const resp = await bitgetFetch<{
    code: string;
    msg: string;
    data: Array<[string, string, string, string, string, string, string, string]> | null;
  }>(`/candles?symbol=${symbol}&granularity=${gran}`);

  const rows = resp.data ?? [];
  return rows.slice(-limit).reverse().map(([ts, o, h, l, c]) => ({
    timestamp: Number(ts),
    open: Number(o),
    high: Number(h),
    low: Number(l),
    close: Number(c),
    volume: 0,
  }));
}

/** Get current account assets (requires API key with Read permission). */
export async function getAccountAssets(): Promise<Record<string, unknown>> {
  throw new Error("Private endpoints require HMAC-SHA256 signing — use Bitget CLI or implement auth headers");
}
