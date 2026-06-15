import type { TickerData, OrderBook, Candlestick } from "@/features/trading-agent/types";
import { bitgetClient } from "@/lib/bitget-client";
import { priceStore } from "./price-store";

/** Fetch latest ticker price for a symbol. */
/** Bitget v2 spot tickers response — supports both field naming conventions */
function parseTicker(resp: Record<string, unknown>, symbol: string): TickerData | null {
  const raw = resp.data as Array<Record<string, string>> | undefined;
  if (!Array.isArray(raw)) return null;

  const ticker = raw.find((t) => t.symbol === symbol);
  if (!ticker) return null;

  // Bitget v2 REST may use either full names (lastPrice) or abbreviated (lastPr)
  const lastPrice = Number(ticker.lastPrice ?? ticker.lastPr ?? ticker.close ?? ticker.last ?? "0");
  const high24h = Number(ticker.high24h ?? ticker.high ?? "0");
  const low24h = Number(ticker.low24h ?? ticker.low ?? "0");
  const quoteVolume = Number(ticker.volValue24h ?? ticker.quoteVolume ?? ticker.volumeValue24h ?? "0");
  const changePctRaw = Number(ticker.change24h ?? ticker.changeUtc24h ?? ticker.priceRate ?? ticker.changingPercent24h ?? "0");
  const ts = Number(ticker.ts ?? ticker.time ?? Date.now());

  if (lastPrice <= 0) return null;

  return {
    symbol,
    lastPrice,
    high24h,
    low24h,
    volume24h: quoteVolume,
    change24hPercent: Number((changePctRaw * 100).toFixed(2)),
    timestamp: new Date(ts),
  };
}

export async function getTickerPrice(symbol: string): Promise<TickerData> {
  const result = await bitgetClient.publicGet(
    "/api/v2/spot/market/tickers",
    { symbol }
  );

  const ticker = parseTicker(result.raw as Record<string, unknown>, symbol);
  if (!ticker) throw new Error(`Ticker not found for ${symbol}`);

  return ticker;
}

/** Fetch order book depth for a symbol. */
export async function getOrderBook(symbol: string, depth: number = 20): Promise<OrderBook> {
  const result = await bitgetClient.publicGet<{
    asks: [string, string][];
    bids: [string, string][];
  } | null>(
    "/api/v2/spot/market/orderbook",
    { symbol, type: "step0", limit: depth }
  );

  const book = result.data ?? { asks: [], bids: [] };
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

  const result = await bitgetClient.publicGet<Array<
    [string, string, string, string, string, string]
  > | null>(
    "/api/v2/spot/market/candles",
    { symbol, granularity: gran }
  );

  const rows = result.data ?? [];
  return rows.slice(-limit).reverse().map(([ts, o, h, l, c, v]) => ({
    timestamp: Number(ts),
    open: Number(o),
    high: Number(h),
    low: Number(l),
    close: Number(c),
    volume: Number(v ?? 0),
  }));
}

/** Get current account assets (requires API key with Read permission). */
export async function getAccountAssets(): Promise<Record<string, unknown>> {
  throw new Error("Private endpoints require HMAC-SHA256 signing — use Bitget CLI or implement auth headers");
}

/** Get candle data with priceStore cache. Single source of truth for TA candle fetching. */
export async function getCandlesWithCache(symbol: string, interval: string, limit = 50): Promise<Candlestick[]> {
  let candles = priceStore.getCandles(symbol, interval);
  if (candles && candles.length >= limit && !priceStore.isCandleStale(symbol, interval, 5 * 60_000)) {
    return candles;
  }

  const granularityMap: Record<string, string> = {
    "5m": "5min", "1h": "1h", "1d": "1day",
  };
  const gran = granularityMap[interval] ?? "1h";
  const result = await bitgetClient.publicGet<string[][]>(
    "/api/v2/spot/market/candles",
    { symbol, granularity: gran, limit }
  );
  const ohlcvs = result.data ?? [];
  candles = ohlcvs.reverse().map((c: string[]) => ({
    timestamp: Number(c[0]),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[5]),
  }));

  for (const c of candles) {
    priceStore.updateCandle(symbol, interval, c);
  }

  return candles;
}
