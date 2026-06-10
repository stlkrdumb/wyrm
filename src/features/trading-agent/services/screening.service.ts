import { optionalFetch } from "./proxy-client";
import { chatCompletion } from "./llm.service";
import { buildScreeningPrompt, parseScreeningResponse } from "./decision-helper";
import { strategyService } from "./strategy.service";
import type { Position } from "@/features/trading-agent/types";

interface ScreeningTicker {
  symbol: string;
  lastPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24hPercent: number;
}

async function fetchBulkTickers(monitorSymbols: string[]): Promise<ScreeningTicker[]> {
  const batchSize = 50;
  const results: ScreeningTicker[] = [];

  for (let i = 0; i < monitorSymbols.length; i += batchSize) {
    const batch = monitorSymbols.slice(i, i + batchSize);
    const fetched = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const resp = await optionalFetch<{
            code: string; msg: string; data: Array<Record<string, string>>;
          }>(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`);
          const raw = resp.data?.find(t => t.symbol === symbol || t.instId === symbol);
          if (!raw) return null;
          const lastPrice = Number(raw.lastPrice ?? raw.lastPr ?? raw.close ?? "0");
          if (lastPrice <= 0) return null;
          return {
            symbol: symbol.toUpperCase(),
            lastPrice,
            high24h: Number(raw.high24h ?? raw.high ?? "0"),
            low24h: Number(raw.low24h ?? raw.low ?? "0"),
            volume24h: Number(raw.volValue24h ?? raw.quoteVolume ?? raw.volumeValue24h ?? "0"),
            change24hPercent: Number((Number(raw.changeUtc24h ?? raw.priceRate ?? raw.changingPercent24h ?? "0") * 100).toFixed(2)),
          };
        } catch {
          return null;
        }
      })
    );
    results.push(...fetched.filter((t): t is ScreeningTicker => t !== null));
  }

  return results;
}

export async function runScreening(
  monitorSymbols: string[],
  activePositions: Position[],
): Promise<{ selected: string[]; reason: string }> {
  const tickers = await fetchBulkTickers(monitorSymbols);

  if (tickers.length === 0) {
    console.warn("[Screening] No ticker data available");
    return { selected: [], reason: "No ticker data" };
  }

  tickers.sort((a, b) => b.volume24h - a.volume24h);

  const strategy = strategyService.getStrategy();
  const prompt = buildScreeningPrompt(tickers, activePositions, strategy.persona, strategy.customInstructions);

  const systemPrompt = `You are a coin screening AI. Your task is to select up to 2 coins most likely to have a strong directional move in the next hour based on 24h price action and volume. Be concise and specific.`;

  console.log(`[Screening] Running LLM screening on ${tickers.length} coins (top by volume)`);

  try {
    const response = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 512,
    });

    const validSymbols = new Set(tickers.map(t => t.symbol));
    const result = parseScreeningResponse(response, validSymbols);
    console.log(`[Screening] Selected: ${result.selected.join(", ") || "none"} — ${result.reason}`);
    return result;
  } catch (error) {
    console.error(`[Screening] LLM call failed: ${error}`);
    return { selected: [], reason: "LLM error" };
  }
}
