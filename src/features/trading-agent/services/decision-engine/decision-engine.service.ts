import type { TickerData, TradingDecision, Signal } from "@/features/trading-agent/types";
import type { Position } from "@/features/trading-agent/types";
import { chatCompletion } from "../llm.service";
import { priceStore } from "../price-store";
import { runTAForTimeframe } from "./ta-runner";
import {
  selectSymbolsForEvaluation,
  scoreSymbolSetup,
} from "./screening";
import { getCandlesWithCache } from "../market-data.service";
import { buildMultiPrompt, parseMultiResponse, fallbackMultiAnalysis } from "../decision-helper";
import { sentimentService } from "../sentiment.service";
import { strategyService } from "../strategy.service";
import { newsService } from "../news.service";

// ─── Re-exports for backward compatibility ────────────
export { calculateRsi } from "./screening";

/** Multi-pair result: per-symbol decisions + all signals combined */
export interface MultiPairResult {
  decisions: Record<string, TradingDecision>;
  allSignals: Signal[];
  source: "llm" | "heuristic";
}

// ─── Backward-compatible single-symbol entry points ───

export async function evaluateSignals(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  return evaluateDecision(ticker);
}

export async function evaluateDecision(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  const priceMap = new Map<string, TickerData>();
  priceMap.set(ticker.symbol, ticker);
  const result = await evaluateMultiPair(priceMap);
  const firstSymbol = Object.keys(result.decisions)[0];
  return { decision: result.decisions[firstSymbol], signals: result.allSignals };
}

// ─── Core: Multi-pair LLM evaluation ─────────────────

export async function evaluateMultiPair(
  priceMap: Map<string, TickerData>,
  activePositions: Position[] = [],
  onToken?: (token: string) => void,
  recentExits: Array<{ symbol: string; reason: "Stop Loss" | "Take Profit" | "Dust Cleanup"; timestamp: number }> = []
): Promise<MultiPairResult> {
  const symbols = Array.from(priceMap.keys());
  if (symbols.length === 0) return { decisions: {}, allSignals: [], source: "llm" };

  // Cap the number of symbols evaluated by the LLM
  const EVAL_MAX_PAIRS = Number(process.env.EVAL_MAX_PAIRS) || 2;
  const selectedSymbols = await selectSymbolsForLLMEvaluation(symbols, activePositions, EVAL_MAX_PAIRS);
  console.log(`[DecisionEngine] LLM evaluation: ${selectedSymbols.join(", ")}`);

  // Run multi-timeframe TA + sentiment in parallel per symbol
  const taResults = await runParallelTA(selectedSymbols);
  logTAResults(taResults);

  // Build symbol data map for prompt
  const symbolData = buildSymbolDataMap(taResults, priceMap);
  if (symbolData.size === 0) {
    console.warn("[DecisionEngine] No valid symbol data — using heuristic fallback");
    const { decisions, allSignals } = fallbackMultiAnalysis(new Map());
    return { decisions, allSignals, source: "heuristic" };
  }

  // Build prompts
  const userPrompt = await buildUserPrompt(symbolData, activePositions, recentExits);
  const systemPrompt = buildSystemPrompt();

  // Call LLM or fall back to heuristics
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

// ─── Private helpers ──────────────────────────────────

/** Select symbols for LLM evaluation using pre-screening. */
async function selectSymbolsForLLMEvaluation(
  symbols: string[],
  activePositions: Position[],
  evalMaxPairs: number
): Promise<string[]> {
  if (symbols.length <= evalMaxPairs) return symbols;

  const positionSymbols = new Set(activePositions.map(p => p.symbol.toUpperCase()));
  const held = symbols.filter(s => positionSymbols.has(s.toUpperCase()));
  const candidates = symbols.filter(s => !positionSymbols.has(s.toUpperCase()));

  const selected = held.slice(0, evalMaxPairs);

  if (candidates.length > 0) {
    const slotsToFill = Math.max(evalMaxPairs, evalMaxPairs - selected.length);
    const poolCandidates = candidates.slice(0, 6);

    const candidateSetups = await Promise.all(
      poolCandidates.map(async (symbol) => scoreSymbolSetup(symbol))
    );

    candidateSetups.sort((a, b) => b.score - a.score);
    console.log(`[DecisionEngine] Pre-screen: ${candidateSetups.map(c => `${c.symbol}(RSI=${c.rsi.toFixed(1)}, score=${c.score.toFixed(1)})`).join(", ")}`);

    selected.push(...candidateSetups.slice(0, slotsToFill).map(c => c.symbol));
  }

  const skipped = symbols.filter(s => !selected.includes(s));
  console.log(`[DecisionEngine] Skipped: ${skipped.join(", ")}`);
  return selected;
}

/** Run multi-timeframe TA + sentiment in parallel for all selected symbols. */
async function runParallelTA(symbols: string[]): Promise<Array<{ symbol: string; ta5m: any; ta1h: any; ta1d: any; sentiment: any }>> {
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const [ta5m, ta1h, ta1d, sentiment] = await Promise.all([
        runTAForTimeframe(symbol, "5m"),
        runTAForTimeframe(symbol, "1h"),
        runTAForTimeframe(symbol, "1d"),
        sentimentService.getSentiment(symbol),
      ]);
      return { symbol, ta5m, ta1h, ta1d, sentiment };
    })
  );

  type TaResult = { symbol: string; ta5m: any; ta1h: any; ta1d: any; sentiment: any };
  const taResults: TaResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") taResults.push(r.value);
    else console.warn("[DecisionEngine] Per-symbol TA failed:", r.reason);
  }
  return taResults;
}

/** Log TA results to console for debugging. */
function logTAResults(taResults: Array<{ symbol: string; ta1h: any }>): void {
  for (const { symbol, ta1h } of taResults) {
    if (ta1h) {
      console.log(`[DecisionEngine] ${symbol} (1h) — RSI: ${ta1h.rsi.toFixed(1)}, MACD HIST: ${ta1h.macdHist > 0 ? "+" : ""}${ta1h.macdHist.toFixed(1)}`);
    }
  }
}

/** Build the symbol data map for prompt generation. */
function buildSymbolDataMap(
  taResults: Array<{ symbol: string; ta5m: any; ta1h: any; ta1d: any; sentiment: any }>,
  priceMap: Map<string, TickerData>
): Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any; sentiment: any }> {
  const symbolData = new Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any; sentiment: any }>();
  for (const { symbol, ta5m, ta1h, ta1d, sentiment } of taResults) {
    const ticker = priceMap.get(symbol);
    if (ticker) symbolData.set(symbol, { ticker, ta5m, ta1h, ta1d, sentiment });
  }
  return symbolData;
}

/** Build the user prompt including market data and news context. */
async function buildUserPrompt(
  symbolData: Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any; sentiment: any }>,
  activePositions: import("@/features/trading-agent/types").Position[],
  recentExits: Array<{ symbol: string; reason: "Stop Loss" | "Take Profit" | "Dust Cleanup"; timestamp: number }>
): Promise<string> {
  const prompt = buildMultiPrompt(symbolData, activePositions, recentExits);

  if (priceStore.isBacktesting) return prompt;

  const newsContext = await newsService.getNewsPromptContext(3);
  return `${prompt}\n\nRecent Market Headlines:\n${newsContext}\n\nFactor these macro news sentiments into your decisions where appropriate (e.g. if the news is highly bullish/bearish, it might affect volatility or direction bias).`;
}

/** Build the system prompt from the current strategy configuration. */
function buildSystemPrompt(): string {
  const strategy = strategyService.getStrategy();
  return `You are an AI quantitative trading agent.
Persona: ${strategy.persona}
Custom Trading Rules: ${strategy.customInstructions}

Analyze the provided market data and generate concise, actionable decisions for each symbol based on RSI, MACD, Bollinger Bands, price action, and futures sentiment metrics (Fear & Greed index, Long/Short ratio, funding rates, open interest). Never use markdown formatting in your response.`;
}
