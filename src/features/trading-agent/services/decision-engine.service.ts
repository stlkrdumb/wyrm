import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chatCompletion } from "./llm.service";
import { proxyFetch } from "./proxy-client";
import { priceStore } from "./price-store";
import type { TickerData, TradingDecision, Signal } from "../types";

const exec = promisify(execFile);
const ANALYSIS_SCRIPT = path.join(
  process.cwd(),
  "src/features/trading-agent/analysis/cli.py"
);

/** Per-symbol technical analysis result */
interface TASingle {
  rsi: number;
  macdDif: number;
  macdHist: number;
}

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
    const resp = await proxyFetch<{ code: string; data: string[][] }>(
      `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=1h&limit=50`
    );
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

// ─── Prompt Builders ──────────────────────────────────

function buildSinglePrompt(ticker: TickerData, ta: TASingle): string {
  const changeLabel = ticker.change24hPercent >= 0 ? "positive" : "negative";
  const volatility = ((ticker.high24h - ticker.low24h) / ticker.lastPrice * 100).toFixed(2);

  return `You are a quantitative trading analyst. Analyze ${ticker.symbol} and provide a structured decision.

Market Data:
- Current Price: $${ticker.lastPrice.toLocaleString()} USDT
- 24h High: $${ticker.high24h.toLocaleString()}
- 24h Low: $${ticker.low24h.toLocaleString()}
- 24h Change: ${ticker.change24hPercent > 0 ? "+" : ""}${ticker.change24hPercent}% (${changeLabel})
- 24h Volume: ${Math.round(ticker.volume24h).toLocaleString()} USDT
- 24h Volatility: ${volatility}%

Technical Indicators:
- RSI(14): ${ta.rsi.toFixed(2)} (0-100, >70 overbought, <30 oversold)
- MACD HIST: ${ta.macdHist > 0 ? "+" : ""}${ta.macdHist.toFixed(1)}

Respond with ONLY valid JSON:
{
  "action": "buy" | "sell" | "hold",
  "strength": number between -1 and 1,
  "confidence": number between 0 and 1,
  "reason": "brief explanation citing specific indicator values"
}`;
}

function buildMultiPrompt(symbolData: Map<string, { ticker: TickerData; ta: TASingle }>): string {
  const entries = Array.from(symbolData.entries());
  const lines = entries.map(([symbol, data]) => {
    const changeLabel = data.ticker.change24hPercent >= 0 ? "positive" : "negative";
    const volatility = ((data.ticker.high24h - data.ticker.low24h) / data.ticker.lastPrice * 100).toFixed(1);
    return `- ${symbol}: $${data.ticker.lastPrice.toLocaleString()} | 24h ${data.ticker.change24hPercent > 0 ? "+" : ""}${data.ticker.change24hPercent}% (${changeLabel}) | RSI(14): ${data.ta.rsi.toFixed(1)} | MACD HIST: ${data.ta.macdHist > 0 ? "+" : ""}${data.ta.macdHist.toFixed(1)} | Volatility: ${volatility}%`;
  }).join("\n");

  const exampleFormat = entries.map(([symbol]) => `  "${symbol}": {"action":"buy|sell|hold","strength":-1..1,"confidence":0..1,"reason":"..."},`).join("\n");

  return `You are a professional quantitative trader. Analyze the following cryptocurrencies and provide a decision for EACH one.

Analyze ONLY these symbols and return a JSON object with keys matching each symbol:
${lines}

Rules:
- For EACH symbol, decide: buy, sell, or hold
- Strength: -1 (strong sell) to +1 (strong buy)
- Confidence: 0-1
- Keep reason under 40 words with specific indicator values
- Only trade if conviction is meaningful — "hold" is the default

Respond with ONLY valid JSON in this exact format:
{
${exampleFormat}
}`;
}

// ─── Parsers ──────────────────────────────────────────

function parseSingleResponse(response: string): { decision: TradingDecision; signals: Signal[] } {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract JSON from LLM response");

  const parsed = JSON.parse(jsonMatch[0]);

  let action: "buy" | "sell" | "hold";
  if (["buy", "sell", "hold"].includes(parsed.action)) {
    action = parsed.action;
  } else {
    action = "hold";
  }

  const strength = Math.max(-1, Math.min(1, parseFloat(parsed.strength) || 0));
  const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));

  return {
    decision: { action, strength, confidence, reason: parsed.reason || "No reasoning provided" },
    signals: [
      { id: crypto.randomUUID(), name: "LLM Analysis", source: "llm" as const,
        direction: strength >= 0.1 ? "bullish" : strength <= -0.1 ? "bearish" : "neutral",
        strength: Math.abs(strength), timestamp: new Date() },
    ],
  };
}

function parseMultiResponse(
  response: string,
  symbols: string[]
): { decisions: Record<string, TradingDecision>; allSignals: Signal[] } {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract JSON from LLM multi-pair response");

  const parsed = JSON.parse(jsonMatch[0]);
  const decisions: Record<string, TradingDecision> = {};
  const allSignals: Signal[] = [];

  for (const symbol of symbols) {
    const raw = parsed[symbol];
    if (!raw || !raw.action) {
      decisions[symbol] = { action: "hold", strength: 0, confidence: 0, reason: "No decision from LLM" };
      continue;
    }

    let action: "buy" | "sell" | "hold";
    if (["buy", "sell", "hold"].includes(raw.action)) {
      action = raw.action;
    } else {
      action = "hold";
    }

    const strength = Math.max(-1, Math.min(1, parseFloat(raw.strength) || 0));
    const confidence = Math.max(0, Math.min(1, parseFloat(raw.confidence) || 0.5));

    decisions[symbol] = { action, strength, confidence, reason: raw.reason || "No reasoning" };

    allSignals.push({
      id: crypto.randomUUID(),
      name: `LLM ${symbol}`,
      source: "llm" as const,
      direction: strength >= 0.1 ? "bullish" : strength <= -0.1 ? "bearish" : "neutral",
      strength: Math.abs(strength),
      timestamp: new Date(),
    });
  }

  return { decisions, allSignals };
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

/** Simple rule-based fallback when LLM is unavailable — runs per-symbol */
function fallbackMultiAnalysis(
  symbolData: Map<string, { ticker: TickerData; ta: TASingle }>
): { decisions: Record<string, TradingDecision>; allSignals: Signal[] } {
  const decisions: Record<string, TradingDecision> = {};
  const allSignals: Signal[] = [];

  for (const [symbol, { ticker, ta }] of symbolData) {
    const range = ticker.high24h - ticker.low24h;
    const pricePosition = range > 0 ? (ticker.lastPrice - ticker.low24h) / range : 0.5;

    let strength = 0;
    if (ta.rsi > 70) strength -= 0.3;
    else if (ta.rsi < 30) strength += 0.3;
    if (ta.macdHist > 50) strength += 0.2;
    else if (ta.macdHist < -50) strength -= 0.2;
    if (pricePosition > 0.9) strength -= 0.1;
    else if (pricePosition < 0.1) strength += 0.1;

    const action: "buy" | "sell" | "hold" =
      strength > 0.15 ? "buy" : strength < -0.15 ? "sell" : "hold";

    decisions[symbol] = {
      action,
      strength,
      confidence: Math.min(1, Math.abs(strength)),
      reason: `RSI(${ta.rsi.toFixed(1)}) MACD(${ta.macdHist.toFixed(1)}) Range ${pricePosition > 0.7 ? "top" : pricePosition < 0.3 ? "bottom" : "mid"}: ${(strength > 0 ? "+" : "")}${strength.toFixed(2)}`,
    };

    allSignals.push({
      id: crypto.randomUUID(), name: `Heuristic ${symbol}`, source: "technical" as const,
      direction: strength >= 0.1 ? "bullish" : strength <= -0.1 ? "bearish" : "neutral",
      strength: Math.abs(strength), timestamp: new Date(),
    });
  }

  return { decisions, allSignals };
}
