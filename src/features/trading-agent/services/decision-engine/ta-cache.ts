/**
 * Technical Analysis cache — TTL-based in-memory cache for TA results.
 * Prevents redundant Python TA calls within the TTL window.
 */
import { priceStore } from "../price-store";
import type { Candlestick } from "@/features/trading-agent/types";
import { getCandlesWithCache } from "../market-data.service";

const TA_CACHE_TTL_MS: Record<string, number> = {
  "5m": 30_000,   // 30s — 5m candles close every 5min
  "1h": 300_000,  // 5min — 1h candles close hourly
  "1d": 900_000,  // 15min — daily candles close once per day
};
const TA_CACHE_MAX_ENTRIES = 200;

const taCache = new Map<string, { result: any; timestamp: number }>();
const taInflight = new Map<string, Promise<any>>();

/** Evict oldest entries when cache grows beyond the limit. */
export function evictOldestTaEntries() {
  if (taCache.size <= TA_CACHE_MAX_ENTRIES) return;
  const overflow = taCache.size - TA_CACHE_MAX_ENTRIES;
  const iter = taCache.keys();
  for (let i = 0; i < overflow; i++) {
    const k = iter.next().value;
    if (k) taCache.delete(k);
  }
}

/** Get cached TA result if still within TTL. */
export function getCachedTA(symbol: string, interval: string): any | null {
  const cacheKey = `${symbol}-${interval}`;
  const cached = taCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < (TA_CACHE_TTL_MS[interval] || 30_000)) {
    return cached.result;
  }
  return null;
}

/** Return an existing in-flight promise for this cache key (request coalescing). */
export function getInflightTA(symbol: string, interval: string): Promise<any> | undefined {
  return taInflight.get(`${symbol}-${interval}`);
}

/** Store an in-flight promise for request coalescing. */
export function setInflightTA(symbol: string, interval: string, promise: Promise<any>): void {
  taInflight.set(`${symbol}-${interval}`, promise);
}

/** Remove a promise from the in-flight map (call in finally block). */
export function clearInflightTA(symbol: string, interval: string): void {
  taInflight.delete(`${symbol}-${interval}`);
}

/** Store computed TA result in cache. */
export function setCachedTA(symbol: string, interval: string, result: any): void {
  taCache.set(`${symbol}-${interval}`, { result, timestamp: Date.now() });
  evictOldestTaEntries();
}

/** Fetch candles from REST API, falling back to price-store cache if needed. */
export async function fetchCandlesForTA(symbol: string, interval: string, minCount = 20): Promise<Candlestick[] | null> {
  try {
    return await getCandlesWithCache(symbol, interval);
  } catch (err) {
    const cached = priceStore.getCandles(symbol, interval);
    if (cached && cached.length >= minCount) return cached;
    console.warn(`[TA] REST candles fetch failed for ${symbol} (${interval}):`, err);
    return null;
  }
}
