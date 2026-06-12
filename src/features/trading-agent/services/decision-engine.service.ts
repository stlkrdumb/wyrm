import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chatCompletion } from "./llm.service";
import { priceStore } from "./price-store";
import type { TickerData, TradingDecision, Signal, Candlestick } from "@/features/trading-agent/types";
import { getCandlesWithCache } from "./market-data.service";
import {
  buildMultiPrompt,
  parseMultiResponse,
  fallbackMultiAnalysis,
} from "./decision-helper";
import { sentimentService } from "./sentiment.service";
import { strategyService } from "./strategy.service";
import { newsService } from "./news.service";

const exec = promisify(execFile);
const ANALYSIS_SCRIPT = path.join(
  process.cwd(),
  "src/features/trading-agent/analysis/cli.py"
);

/** Multi-pair result: per-symbol decisions + all signals combined */
export interface MultiPairResult {
  decisions: Record<string, TradingDecision>; // { BTCUSDT: {...}, ETHUSDT: {...} }
  allSignals: Signal[];
  source: "llm" | "heuristic";
}

// ─── Technical Analysis ──────────────────────────────

const TA_CACHE_TTL_MS: Record<string, number> = {
  "5m": 30_000,   // 30 seconds — 5m candles close every 5min, recompute each cycle
  "1h": 300_000,  // 5 minutes — 1h candles close hourly
  "1d": 900_000,  // 15 minutes — daily candles close once per day
};
const TA_CACHE_MAX_ENTRIES = 200;
const taCache = new Map<string, { result: any; timestamp: number }>();
const taInflight = new Map<string, Promise<any>>();

/** Evict oldest entries when cache grows beyond the limit. */
function evictOldestTaEntries() {
  if (taCache.size <= TA_CACHE_MAX_ENTRIES) return;
  const overflow = taCache.size - TA_CACHE_MAX_ENTRIES;
  const iter = taCache.keys();
  for (let i = 0; i < overflow; i++) {
    const k = iter.next().value;
    if (k) taCache.delete(k);
  }
}

async function runTAForTimeframe(symbol: string, interval: string): Promise<any> {
  const cacheKey = `${symbol}-${interval}`;
  const now = Date.now();

  // Cache hit within TTL
  const cached = taCache.get(cacheKey);
  if (cached && now - cached.timestamp < (TA_CACHE_TTL_MS[interval] || 30_000)) {
    return cached.result;
  }

  // Coalesce concurrent requests for the same key
  const inflight = taInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = computeTA(symbol, interval, cacheKey, now);
  taInflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    taInflight.delete(cacheKey);
  }
}

async function computeTA(symbol: string, interval: string, cacheKey: string, now: number): Promise<any> {
  let candles: Candlestick[];
  try {
    candles = await getCandlesWithCache(symbol, interval);
  } catch (err) {
    const cached = priceStore.getCandles(symbol, interval);
    if (cached && cached.length >= 20) candles = cached;
    else { console.warn(`[DecisionEngine] REST candles fetch failed for ${symbol} (${interval}):`, err); return null; }
  }

  if (!candles || candles.length < 20) return null;

  try {
    // Run Python TA
    const execResult = await exec("python3", [
      ANALYSIS_SCRIPT,
      JSON.stringify({
        symbol,
        ohlcvs: candles.map((c) => [c.timestamp, c.open, c.high, c.low, c.close, c.volume]),
        indicators: {
          MACD: { fast: 12, slow: 26, signal: 9 },
          RSI: { period: 14 },
          BOLL: { period: 20, std_dev: 2 },
          ATR: { period: 14 },
          EMA: { period: 20 }
        },
      }),
    ], { timeout: 30_000 });

    const output = JSON.parse(execResult.stdout);
    const rsi = output.indicators?.RSI?.series?.RSI_14;
    const macd = output.indicators?.MACD;
    const boll = output.indicators?.BOLL;
    const atrObj = output.indicators?.ATR;
    const emaObj = output.indicators?.EMA;

    const latestClose = candles[candles.length - 1].close;

    const result = {
      close: latestClose,
      rsi: rsi ? Number(rsi[rsi.length - 1]) : 50,
      macdDif: macd?.series?.DIF ? Number(macd.series.DIF[macd.series.DIF.length - 1]) : 0,
      macdHist: macd?.series?.HIST ? Number(macd.series.HIST[macd.series.HIST.length - 1]) : 0,
      bollUpper: boll?.series?.UPPER ? Number(boll.series.UPPER[boll.series.UPPER.length - 1]) : 0,
      bollMiddle: boll?.series?.MIDDLE ? Number(boll.series.MIDDLE[boll.series.MIDDLE.length - 1]) : 0,
      bollLower: boll?.series?.LOWER ? Number(boll.series.LOWER[boll.series.LOWER.length - 1]) : 0,
      atr: atrObj?.series?.ATR ? Number(atrObj.series.ATR[atrObj.series.ATR.length - 1]) : 0,
      ema20: emaObj?.series?.EMA_20 ? Number(emaObj.series.EMA_20[emaObj.series.EMA_20.length - 1]) : 0,
    };
    taCache.set(cacheKey, { result, timestamp: now });
    evictOldestTaEntries();
    return result;
  } catch (err) {
    console.error(`[DecisionEngine] Python TA failed for ${symbol} (${interval}):`, err);
    return null;
  }
}

// ─── Core Analysis Functions ──────────────────────────

/**
 * Evaluate signals for a SINGLE symbol. Backward-compatible entry point.
 */
export async function evaluateSignals(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  return evaluateDecision(ticker);
}

export async function evaluateDecision(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  const priceMap = new Map<string, TickerData>();
  priceMap.set(ticker.symbol, ticker);
  const result = await evaluateMultiPair(priceMap);
  const firstSymbol = Object.keys(result.decisions)[0];
  return {
    decision: result.decisions[firstSymbol],
    signals: result.allSignals,
  };
}

/** Calculate Wilder's RSI (14-period) in TypeScript */
function calculateRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Evaluate signals for MULTIPLE symbols simultaneously.
 * One LLM call for all pairs → per-symbol decisions.
 */
export async function evaluateMultiPair(
  priceMap: Map<string, TickerData>,
  activePositions: import("@/features/trading-agent/types").Position[] = [],
  onToken?: (token: string) => void,
  recentExits: Array<{ symbol: string; reason: "Stop Loss" | "Take Profit"; timestamp: number }> = []
): Promise<MultiPairResult> {
  const symbols = Array.from(priceMap.keys());
  if (symbols.length === 0) {
    return { decisions: {}, allSignals: [], source: "llm" };
  }

  // Cap the number of symbols evaluated by the LLM (default to 2)
  const EVAL_MAX_PAIRS = Number(process.env.EVAL_MAX_PAIRS) || 2;

  let selectedSymbols = symbols;
  if (symbols.length > EVAL_MAX_PAIRS) {
    const positionSymbols = new Set(activePositions.map(p => p.symbol.toUpperCase()));

    // Separate symbols into active positions (held) and screening candidates
    const held = symbols.filter(s => positionSymbols.has(s.toUpperCase()));
    const candidates = symbols.filter(s => !positionSymbols.has(s.toUpperCase()));

    // Prioritize held positions (up to the cap)
    const selected = held.slice(0, EVAL_MAX_PAIRS);

    // If we have remaining slots, score the top 6 pool candidates using 1h RSI
    if (selected.length < EVAL_MAX_PAIRS) {
      const remainingSlots = EVAL_MAX_PAIRS - selected.length;
      const poolCandidates = candidates.slice(0, 6);
      const mode = process.env.SCREENING_MODE || "momentum";
      const candidateSetups: Array<{ symbol: string; rsi: number; score: number }> = [];

      // Fetch 1h candles and compute RSI in parallel
      await Promise.all(
        poolCandidates.map(async (symbol) => {
          try {
            const candles = await getCandlesWithCache(symbol, "1h", 50);
            if (candles && candles.length >= 20) {
              const closes = candles.map(c => c.close);
              const rsi = calculateRsi(closes);
              const score = mode === "reversal" ? (100 - rsi) : rsi;
              candidateSetups.push({ symbol, rsi, score });
            } else {
              candidateSetups.push({ symbol, rsi: 50, score: 0 });
            }
          } catch (err) {
            console.warn(`[DecisionEngine] Setup pre-screen failed for ${symbol}:`, err);
            candidateSetups.push({ symbol, rsi: 50, score: 0 });
          }
        })
      );

      // Sort candidates by setup score in descending order
      candidateSetups.sort((a, b) => b.score - a.score);
      const sortedCandidates = candidateSetups.map(c => c.symbol);
      const filled = sortedCandidates.slice(0, remainingSlots);

      console.log(`[DecisionEngine] Pre-screened candidates setups:`, candidateSetups.map(c => `${c.symbol}(RSI=${c.rsi.toFixed(1)}, score=${c.score.toFixed(1)})`).join(", "));
      selected.push(...filled);
    }

    selectedSymbols = selected;
    const skipped = symbols.filter(s => !selectedSymbols.includes(s));
    console.log(`[DecisionEngine] LLM evaluation capped at ${EVAL_MAX_PAIRS}. Selected: ${selectedSymbols.join(", ")} (Skipped: ${skipped.join(", ")})`);
  }

  console.log(`[DecisionEngine] Running multi-timeframe TA + sentiment on ${selectedSymbols.length} symbol(s):`, selectedSymbols.join(", "));
  // Per-symbol allSettled so one bad symbol doesn't abort the whole batch
  const taResults: Array<{ symbol: string; ta5m: any; ta1h: any; ta1d: any; sentiment: any }> = [];
  const perSymbolResults = await Promise.allSettled(
    selectedSymbols.map(async (symbol) => {
      const [ta5m, ta1h, ta1d, sentiment] = await Promise.all([
        runTAForTimeframe(symbol, "5m"),
        runTAForTimeframe(symbol, "1h"),
        runTAForTimeframe(symbol, "1d"),
        sentimentService.getSentiment(symbol),
      ]);
      return { symbol, ta5m, ta1h, ta1d, sentiment };
    })
  );
  for (const r of perSymbolResults) {
    if (r.status === "fulfilled") taResults.push(r.value);
    else console.warn("[DecisionEngine] Per-symbol TA failed:", r.reason);
  }

  for (const { symbol, ta1h } of taResults) {
    if (ta1h) {
      console.log(`[DecisionEngine] ${symbol} (1h) — RSI: ${ta1h.rsi.toFixed(1)}, MACD HIST: ${ta1h.macdHist > 0 ? "+" : ""}${ta1h.macdHist.toFixed(1)}`);
    }
  }

  // Build symbol data map for prompt
  const symbolData = new Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any; sentiment: any }>();
  for (const { symbol, ta5m, ta1h, ta1d, sentiment } of taResults) {
    const ticker = priceMap.get(symbol);
    if (ticker) symbolData.set(symbol, { ticker, ta5m, ta1h, ta1d, sentiment });
  }

  // If all TA failed, fall back to heuristic without calling the LLM
  if (symbolData.size === 0) {
    console.warn("[DecisionEngine] No valid symbol data — using heuristic fallback");
    const { decisions, allSignals } = fallbackMultiAnalysis(new Map());
    return { decisions, allSignals, source: "heuristic" };
  }

  // Step 2: Single LLM call with all symbols
  const prompt = buildMultiPrompt(symbolData, activePositions, recentExits);

  let userPrompt = prompt;
  if (!priceStore.isBacktesting) {
    const newsContext = await newsService.getNewsPromptContext(3);
    userPrompt = `${prompt}\n\nRecent Market Headlines:\n${newsContext}\n\nFactor these macro news sentiments into your decisions where appropriate (e.g. if the news is highly bullish/bearish, it might affect volatility or direction bias).`;
  }

  const strategy = strategyService.getStrategy();
  const systemPrompt = `You are an AI quantitative trading agent.
Persona: ${strategy.persona}
Custom Trading Rules: ${strategy.customInstructions}

Analyze the provided market data and generate concise, actionable decisions for each symbol based on RSI, MACD, Bollinger Bands, price action, and futures sentiment metrics (Fear & Greed index, Long/Short ratio, funding rates, open interest). Never use markdown formatting in your response.`;

  try {
    const response = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 2048,
      onToken,
    });

    const result = parseMultiResponse(response, Array.from(symbolData.keys()));
    return { ...result, source: "llm" };
  } catch (error) {
    console.error(`[DecisionEngine] LLM multi-pair analysis failed: ${error}`);
    const { decisions, allSignals } = fallbackMultiAnalysis(symbolData);
    return { decisions, allSignals, source: "heuristic" };
  }
}
