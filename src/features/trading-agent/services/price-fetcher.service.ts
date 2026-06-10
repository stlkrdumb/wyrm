import type { TickerData } from "@/features/trading-agent/types";
import { marketWS } from "./market-ws.service";
import { getTickerPrice } from "./market-data.service";

export async function getLivePrice(symbol: string): Promise<TickerData | null> {
  const cached = marketWS.getPriceStore().getCached(symbol);

  if (cached && !marketWS.getPriceStore().isStale(symbol, 60_000)) {
    return {
      symbol: cached.symbol,
      lastPrice: cached.lastPrice,
      high24h: cached.high24h,
      low24h: cached.low24h,
      volume24h: cached.quoteVolume,
      change24hPercent: cached.changePercent,
      timestamp: cached.updatedAt,
    };
  }

  try {
    const ticker = await getTickerPrice(symbol);
    console.log(`[Agent] REST fallback for ${symbol}: $${ticker.lastPrice}`);
    return ticker;
  } catch (err) {
    console.warn(`[Agent] REST fetch failed for ${symbol}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}
