import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chatCompletion } from "./llm.service";
import { priceStore } from "./price-store";
import type { TickerData, TradingDecision, Signal } from "../types";
import {
  type TASingle,
  buildMultiPrompt,
  parseMultiResponse,
  fallbackMultiAnalysis,
} from "./decision-helper";

const exec = promisify(execFile);
const ANALYSIS_SCRIPT = path.join(
  process.cwd(),
  "src/features/trading-agent/analysis/cli.py"
);

/** Multi-pair result: per-symbol decisions + all signals combined */
export interface MultiPairResult {
  decisions: Record<string, TradingDecision>; // { BTCUSDT: {...}, ETHUSDT: {...} }
  allSignals: Signal[];
}

// ─── Technical Analysis ──────────────────────────────

/** Run Python TA on a candles array */
async function runPythonTAOnCandles(symbol: string, candles: import("../types").Candlestick[]): Promise<TASingle> {
  try {
    const result = await exec("python3", [
      ANALYSIS_SCRIPT,
      JSON.stringify({
        symbol,
        ohlcvs: candles.map((c) => [c.timestamp, c.open, c.high, c.low, c.close, c.volume]),
        indicators: { MACD: { fast: 12, slow: 26, signal: 9 }, RSI: { period: 14 }, BOLL: { period: 20, std_dev: 2 } },
      }),
    ], { timeout: 30_000 });

    const output = JSON.parse(result.stdout);
    const rsi = output.indicators?.RSI?.series?.RSI_14;
    const macd = output.indicators?.MACD;

    return {
      rsi: rsi ? Number(rsi[rsi.length - 1]) : 50,
      macdDif: macd?.series?.DIF ? Number(macd.series.DIF[macd.series.DIF.length - 1]) : 0,
      macdHist: macd?.series?.HIST ? Number(macd.series.HIST[macd.series.HIST.length - 1]) : 0,
    };
  } catch {
    return { rsi: 50, macdDif: 0, macdHist: 0 };
  }
}

/** Get TA for a single symbol (WS-cached candles → Python, or REST fallback) */
async function getTechnicalAnalysisForSymbol(symbol: string): Promise<TASingle> {
  const interval = "1h";
  const store = priceStore;

  // Check cached candle data from WS
  if (!store.isCandleStale(symbol, interval, 5 * 60_000)) {
    const candles = store.getCandles(symbol, interval);
    if (candles && candles.length >= 20) {
      return runPythonTAOnCandles(symbol, candles);
    }
  }

  // REST fallback: fetch candles + Python TA
  try {
    const res = await fetch(
      `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=1h&limit=50`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`Fetch failed with ${res.status}`);
    const resp = (await res.json()) as { code: string; data: string[][] };
    const ohlcvs = resp.data ?? [];

    if (!ohlcvs || ohlcvs.length === 0) {
      throw new Error("No candle data");
    }

    // Run Python TA once and parse results
    const result = await exec("python3", [
      ANALYSIS_SCRIPT,
      JSON.stringify({
        symbol,
        ohlcvs: ohlcvs.map((c: string[]) => [Number(c[0]), c[1], c[2], c[3], c[4], c[5]]),
        indicators: { MACD: { fast: 12, slow: 26, signal: 9 }, RSI: { period: 14 }, BOLL: { period: 20, std_dev: 2 } },
      }),
    ], { timeout: 30_000 });

    const output = JSON.parse(result.stdout);

    const rsi = output.indicators?.RSI?.series?.RSI_14;
    const macd = output.indicators?.MACD;

    return {
      rsi: rsi ? Number(rsi[rsi.length - 1]) : 50,
      macdDif: macd?.series?.DIF ? Number(macd.series.DIF[macd.series.DIF.length - 1]) : 0,
      macdHist: macd?.series?.HIST ? Number(macd.series.HIST[macd.series.HIST.length - 1]) : 0,
    };
  } catch {
    console.warn(`[TA] Analysis unavailable for ${symbol}, using neutral defaults`);
    return { rsi: 50, macdDif: 0, macdHist: 0 };
  }
}

// ─── Core Analysis Functions ──────────────────────────

/**
 * Evaluate signals for a SINGLE symbol. Backward-compatible entry point.
 */
export async function evaluateSignals(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  // Run parallel TA + LLM pipeline (even for single symbol)
  const priceMap = new Map<string, TickerData>();
  priceMap.set(ticker.symbol, ticker);
  const result = await evaluateMultiPair(priceMap);

  // Return first (and only) decision
  const firstSymbol = Object.keys(result.decisions)[0];
  return {
    decision: result.decisions[firstSymbol],
    signals: result.allSignals,
  };
}

/**
 * Evaluate signals for MULTIPLE symbols simultaneously.
 * One LLM call for all pairs → per-symbol decisions.
 */
export async function evaluateMultiPair(priceMap: Map<string, TickerData>): Promise<MultiPairResult> {
  const symbols = Array.from(priceMap.keys());
  if (symbols.length === 0) {
    return { decisions: {}, allSignals: [] };
  }

  // Step 1: Run technical analysis for ALL symbols in parallel
  console.log(`[DecisionEngine] Running TA on ${symbols.length} symbol(s):`, symbols.join(", "));
  const taResults = await Promise.all(
    symbols.map(async (symbol) => ({ symbol, ta: await getTechnicalAnalysisForSymbol(symbol) }))
  );

  for (const { symbol, ta } of taResults) {
    console.log(`[DecisionEngine] ${symbol} — RSI: ${ta.rsi.toFixed(1)}, MACD HIST: ${ta.macdHist > 0 ? "+" : ""}${ta.macdHist.toFixed(1)}`);
  }

  // Build symbol data map for prompt
  const symbolData = new Map<string, { ticker: TickerData; ta: TASingle }>();
  for (const { symbol, ta } of taResults) {
    symbolData.set(symbol, { ticker: priceMap.get(symbol)!, ta });
  }

  // Step 2: Single LLM call with all symbols
  const prompt = buildMultiPrompt(symbolData);

  try {
    const response = await chatCompletion({
      messages: [
        { role: "system", content: "You are a professional quantitative trader. Analyze market data and provide concise, actionable decisions for each cryptocurrency based on RSI, MACD, and price action. Never use markdown formatting in your response." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 2048,
    });

    return parseMultiResponse(response, symbols);
  } catch (error) {
    console.error(`[DecisionEngine] LLM multi-pair analysis failed: ${error}`);
    // Fallback: heuristic per-symbol analysis
    const { decisions, allSignals } = fallbackMultiAnalysis(symbolData);
    return { decisions, allSignals };
  }
}
