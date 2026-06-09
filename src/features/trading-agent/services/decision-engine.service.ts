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
import { optionalFetch } from "./proxy-client";

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

async function runTAForTimeframe(symbol: string, interval: string): Promise<any> {
  const store = priceStore;
  let candles = store.getCandles(symbol, interval);

  // If cached candles are stale or missing, fetch from REST
  if (!candles || candles.length < 20 || store.isCandleStale(symbol, interval, 5 * 60_000)) {
    try {
      const granularityMap: Record<string, string> = {
        "5m": "5min",
        "1h": "1h",
        "1d": "1day",
      };
      const gran = granularityMap[interval] ?? "1h";
      const resp = await optionalFetch<{ code: string; data: string[][] }>(
        `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${gran}&limit=50`
      );
      const ohlcvs = resp.data ?? [];
      
      // Convert to Candlestick format
      // Note: Bitget returns candles descending, so we reverse it to ascending
      candles = ohlcvs.reverse().map((c: string[]) => ({
        timestamp: Number(c[0]),
        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        volume: Number(c[5]),
      }));

      // Cache them in store so subsequent requests are fast
      for (const c of candles) {
        store.updateCandle(symbol, interval, c);
      }
    } catch (err) {
      console.warn(`[DecisionEngine] REST candles fetch failed for ${symbol} (${interval}):`, err);
    }
  }

  if (!candles || candles.length < 20) {
    return null;
  }

  try {
    // Run Python TA
    const result = await exec("python3", [
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

    const output = JSON.parse(result.stdout);
    const rsi = output.indicators?.RSI?.series?.RSI_14;
    const macd = output.indicators?.MACD;
    const boll = output.indicators?.BOLL;
    const atrObj = output.indicators?.ATR;
    const emaObj = output.indicators?.EMA;

    const latestClose = candles[candles.length - 1].close;

    return {
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

/**
 * Evaluate signals for MULTIPLE symbols simultaneously.
 * One LLM call for all pairs → per-symbol decisions.
 */
export async function evaluateMultiPair(
  priceMap: Map<string, TickerData>,
  activePositions: import("../types").Position[] = []
): Promise<MultiPairResult> {
  const symbols = Array.from(priceMap.keys());
  if (symbols.length === 0) {
    return { decisions: {}, allSignals: [] };
  }

  console.log(`[DecisionEngine] Running multi-timeframe TA on ${symbols.length} symbol(s):`, symbols.join(", "));
  const taResults = await Promise.all(
    symbols.map(async (symbol) => {
      const [ta5m, ta1h, ta1d] = await Promise.all([
        runTAForTimeframe(symbol, "5m"),
        runTAForTimeframe(symbol, "1h"),
        runTAForTimeframe(symbol, "1d"),
      ]);
      return { symbol, ta5m, ta1h, ta1d };
    })
  );

  for (const { symbol, ta1h } of taResults) {
    if (ta1h) {
      console.log(`[DecisionEngine] ${symbol} (1h) — RSI: ${ta1h.rsi.toFixed(1)}, MACD HIST: ${ta1h.macdHist > 0 ? "+" : ""}${ta1h.macdHist.toFixed(1)}`);
    }
  }

  // Build symbol data map for prompt
  const symbolData = new Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any }>();
  for (const { symbol, ta5m, ta1h, ta1d } of taResults) {
    symbolData.set(symbol, { ticker: priceMap.get(symbol)!, ta5m, ta1h, ta1d });
  }

  // Step 2: Single LLM call with all symbols
  const prompt = buildMultiPrompt(symbolData, activePositions);

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
