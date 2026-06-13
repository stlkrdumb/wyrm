import { bitgetClient } from "@/lib/bitget-client";

interface RawTicker {
  symbol: string;
  lastPrice: number;
  volume24h: number;
  change24hPercent: number;
}

const POOL_SIZE = Number(process.env.SCREEN_POOL_SIZE) || 20;
const REVERSAL_DECLINE_THRESHOLD = Number(process.env.REVERSAL_DECLINE_THRESHOLD) || 5;

function isRealCrypto(symbol: string): boolean {
  if (/^R[A-Z]{2,}USDT$/.test(symbol)) return false;
  if (symbol === "USDCUSDT" || symbol === "DAIUSDT" || symbol === "FDUSDUSDT" || symbol === "TUSDUSDT" || symbol === "USDDUSDT") return false;
  return true;
}

async function fetchRawTickers(): Promise<RawTicker[]> {
  const result = await bitgetClient.publicGet<Array<Record<string, string>>>(
    "/api/v2/spot/market/tickers"
  );

  const raw = result.data ?? [];
  const tickers: RawTicker[] = [];

  for (const t of raw) {
    const symbol = (t.symbol ?? "").toUpperCase();
    if (!symbol.endsWith("USDT")) continue;
    if (!isRealCrypto(symbol)) continue;

    const lastPrice = Number(t.lastPrice ?? t.lastPr ?? t.close ?? "0");
    if (lastPrice <= 0) continue;

    tickers.push({
      symbol,
      lastPrice,
      volume24h: Number(t.volValue24h ?? t.quoteVolume ?? t.volumeValue24h ?? "0"),
      change24hPercent: Number((Number(t.changeUtc24h ?? t.priceRate ?? t.changingPercent24h ?? "0") * 100).toFixed(2)),
    });
  }

  return tickers;
}

/** Top N coins by volume, then sorted by absolute 24h change (momentum mode) */
export async function fetchVolumePool(size = POOL_SIZE): Promise<string[]> {
  const tickers = await fetchRawTickers();

  tickers.sort((a, b) => b.volume24h - a.volume24h);
  const liquid = tickers.slice(0, 50);
  liquid.sort((a, b) => Math.abs(b.change24hPercent) - Math.abs(a.change24hPercent));
  console.log(`[Screening] Momentum pool: ${liquid.slice(0, size).length} coins (top vol by |change%|)`);
  return liquid.slice(0, size).map(t => t.symbol);
}

/** Top N coins by volume among 24h losers, sorted by biggest decline first (reversal mode) */
export async function fetchReversalPool(size = POOL_SIZE): Promise<string[]> {
  const tickers = await fetchRawTickers();

  const losers = tickers.filter(t =>
    t.volume24h > 0 && t.change24hPercent < -REVERSAL_DECLINE_THRESHOLD
  );

  losers.sort((a, b) => b.volume24h - a.volume24h);
  const topLosers = losers.slice(0, 50);
  topLosers.sort((a, b) => a.change24hPercent - b.change24hPercent);

  console.log(`[Screening] Reversal pool: ${topLosers.slice(0, size).length} coins (losers >${REVERSAL_DECLINE_THRESHOLD}% down by vol)`);
  if (topLosers.length === 0) {
    console.warn("[Screening] No reversal candidates found — falling back to volume pool");
    return fetchVolumePool(size);
  }
  return topLosers.slice(0, size).map(t => t.symbol);
}

/** Refresh the watchlist pool — merges new pool with currently held positions */
export async function refreshWatchlist(heldSymbols: string[]): Promise<string[]> {
  const mode = process.env.SCREENING_MODE || "momentum";
  const pool = mode === "reversal"
    ? await fetchReversalPool()
    : await fetchVolumePool();

  const merged = [...new Set([...heldSymbols, ...pool])];
  console.log(`[Screening] Watchlist refreshed: ${pool.length} pool + ${heldSymbols.length} held = ${merged.length} total (mode=${mode})`);
  return merged;
}
