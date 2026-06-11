import { bitgetClient } from "@/lib/bitget-client";
import { chatCompletion } from "./llm.service";
import { buildScreeningPrompt, parseScreeningResponse } from "./decision-helper";
import { strategyService } from "./strategy.service";
import type { Position } from "@/features/trading-agent/types";

interface RawTicker {
  symbol: string;
  lastPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24hPercent: number;
}

const MAX_SCREEN_POOL = 20;

function isRealCrypto(symbol: string): boolean {
  // Exclude Bitget stock tokens (R-prefixed: RSOXLUSDT, RMUUSDT, etc.)
  if (/^R[A-Z]{2,}USDT$/.test(symbol)) return false;
  // Exclude stablecoin pairs
  if (symbol === "USDCUSDT" || symbol === "DAIUSDT" || symbol === "FDUSDUSDT" || symbol === "TUSDUSDT" || symbol === "USDDUSDT") return false;
  return true;
}

async function fetchAllTickers(): Promise<RawTicker[]> {
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
      high24h: Number(t.high24h ?? t.high ?? "0"),
      low24h: Number(t.low24h ?? t.low ?? "0"),
      volume24h: Number(t.volValue24h ?? t.quoteVolume ?? t.volumeValue24h ?? "0"),
      change24hPercent: Number((Number(t.changeUtc24h ?? t.priceRate ?? t.changingPercent24h ?? "0") * 100).toFixed(2)),
    });
  }

  tickers.sort((a, b) => b.volume24h - a.volume24h);
  const liquid = tickers.slice(0, 50);
  liquid.sort((a, b) => Math.abs(b.change24hPercent) - Math.abs(a.change24hPercent));
  return liquid.slice(0, MAX_SCREEN_POOL);
}

export async function runScreening(
  activePositions: Position[],
): Promise<{ selected: string[]; reason: string }> {
  const tickers = await fetchAllTickers();

  if (tickers.length === 0) {
    console.warn("[Screening] No ticker data available");
    return { selected: [], reason: "No ticker data" };
  }

  console.log(`[Screening] Fetched ${tickers.length} coins from Bitget (top volatility by volume)`);

  const strategy = strategyService.getStrategy();
  const prompt = buildScreeningPrompt(tickers, activePositions, strategy.persona, strategy.customInstructions);

  const systemPrompt = `You are a coin screening AI. Your task is to select up to 2 coins most likely to have a strong directional move in the next hour based on 24h price action and volume. Be concise and specific.`;

  try {
    const response = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 512,
    });

    if (!response || response.trim().length === 0) {
      console.warn("[Screening] LLM returned empty response — retrying with fewer coins");
      const shorterTickers = tickers.slice(0, 15);
      const retryPrompt = buildScreeningPrompt(shorterTickers, activePositions, strategy.persona, strategy.customInstructions);
      const retryResponse = await chatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: retryPrompt },
        ],
        temperature: 0.3,
        maxTokens: 512,
      });
      if (retryResponse && retryResponse.trim().length > 0) {
        const validSymbols = new Set(shorterTickers.map(t => t.symbol));
        const retryResult = parseScreeningResponse(retryResponse, validSymbols);
        if (retryResult.selected.length > 0) {
          console.log(`[Screening] Retry selected: ${retryResult.selected.join(", ")} — ${retryResult.reason}`);
          return retryResult;
        }
      }

      // Both original and retry failed — fallback to volume
      console.warn("[Screening] LLM returned empty — falling back to volume-based selection");
      const posSyms = new Set(activePositions.map(p => p.symbol));
      const topByVolume = tickers.filter(t => !posSyms.has(t.symbol)).slice(0, 2);
      const fallbackSelected = topByVolume.map(t => t.symbol);
      console.log(`[Screening] Volume fallback: ${fallbackSelected.join(", ")}`);
      return { selected: fallbackSelected, reason: `Volume fallback: ${fallbackSelected.join(", ")}` };
    }

    const validSymbols = new Set(tickers.map(t => t.symbol));
    const result = parseScreeningResponse(response, validSymbols);

    if (result.selected.length === 0) {
      // Fallback: pick top 2 by volume that aren't already positions
      const posSyms = new Set(activePositions.map(p => p.symbol));
      const topByVolume = tickers.filter(t => !posSyms.has(t.symbol)).slice(0, 2);
      const fallbackSelected = topByVolume.map(t => t.symbol);
      console.log(`[Screening] LLM returned nothing — fallback to top volume: ${fallbackSelected.join(", ")}`);
      return { selected: fallbackSelected, reason: `Volume fallback: ${fallbackSelected.join(", ")}` };
    }

    console.log(`[Screening] Selected: ${result.selected.join(", ") || "none"} — ${result.reason}`);
    return result;
  } catch (error) {
    console.error(`[Screening] LLM call failed: ${error}`);
    return { selected: [], reason: "LLM error" };
  }
}
