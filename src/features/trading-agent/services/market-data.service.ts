import type { TickerData, OrderBook, Candlestick } from "../types";
import { getProxyAgent } from "./proxy-agent";

const BITGET_API = "https://api.bitget.com/api/v2/spot/market";
const PROXY_TIMEOUT_MS = 12_000; // slightly less than non-proxy timeout for faster failover

/** Generic fetch wrapper for Bitget public endpoints (with optional proxy) */
async function bitgetFetch<T>(path: string): Promise<T> {
  const hasProxy = getProxyAgent() !== null;

  // Try direct first (with proxy agent if configured)
  try {
    const init: RequestInit & { agent?: unknown } = {
      signal: AbortSignal.timeout(10_000),
      ...(hasProxy ? { agent: getProxyAgent() } : {}),
    };
    const res = await fetch(`${BITGET_API}${path}`, init);
    if (!res.ok) throw new Error(`Bitget ${res.status} on ${path}`);
    return res.json() as Promise<T>;
  } catch {
    // Direct failed — try proxy
    const agent = getProxyAgent();
    if (!hasProxy) throw new Error(`Bitget ${path} failed: no proxy available`);

    const init: RequestInit & { agent?: unknown } = {
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      agent,
    };
    const res = await fetch(`${BITGET_API}${path}`, init);
    if (!res.ok) throw new Error(`Bitget ${res.status} on ${path}`);
    return res.json() as Promise<T>;
  }
}

/** Fetch with proxy guaranteed (for when direct is blocked) */
async function bitgetFetchProxy<T>(path: string): Promise<T> {
  const agent = getProxyAgent();
  if (!agent) throw new Error("No proxy configured — check BITGET_PROXY env var");

  const init: RequestInit & { agent?: unknown } = {
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    agent,
  };
  const res = await fetch(`${BITGET_API}${path}`, init);
  if (!res.ok) throw new Error(`Bitget ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

/**
 * Fetch latest ticker price for a symbol.
 * Uses Bitget REST API directly — real data, no CLI overhead.
 */
export async function getTickerPrice(symbol: string): Promise<TickerData> {
  // Bitget wraps response in { code, msg, requestTime, data: [...] }
  const resp = await bitgetFetch<{
    code: string;
    msg: string;
    data: Array<{
      symbol: string;
      lastPr: string;
      high24h: string;
      low24h: string;
      quoteVolume: string;
      changeUtc24h: string;   // e.g. "-0.00284"
      ts: string;            // timestamp ms
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
    change24hPercent: Number((Number(ticker.changeUtc24h) * 100).toFixed(2)), // convert fraction to % (-0.00284 → -0.28)
    timestamp: new Date(Number(ticker.ts)),
  };
}

/**
 * Fetch order book depth for a symbol.
 */
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

/**
 * Fetch candlestick (kline) data for backtesting or charting.
 */
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
  // [ts_ms, open, high, low, close, vol, quoteVol, baseVol] — oldest first
  return rows.slice(-limit).reverse().map(([ts, o, h, l, c]) => ({
    timestamp: Number(ts),
    open: Number(o),
    high: Number(h),
    low: Number(l),
    close: Number(c),
    volume: 0,
  }));
}

/**
 * Get current account assets (requires API key with Read permission).
 */
export async function getAccountAssets(): Promise<Record<string, unknown>> {
  throw new Error("Private endpoints require HMAC-SHA256 signing — use Bitget CLI or implement auth headers");
}
