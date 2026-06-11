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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runTAForTimeframe(symbol: string, interval: string): Promise<any | null> {
  if (priceStore.isBacktesting) {
    const cached = priceStore.getCandles(symbol, interval);
    if (!cached || cached.length === 0) return null;
  }

  let candles: Candlestick[];
  try {
    candles = await getCandlesWithCache(symbol, interval);
  } catch (err) {
    const cached = priceStore.getCandles(symbol, interval);
    if (cached && cached.length >= 8) candles = cached;
    else { console.warn(`[DecisionEngine] REST candles fetch failed for ${symbol} (${interval}):`, err); return null; }
  }

  if (!candles || candles.length < 20) return null;

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
  activePositions: import("@/features/trading-agent/types").Position[] = [],
  pendingOrders: import("@/features/trading-agent/types").PendingOrder[] = [],
  onToken?: (token: string) => void
): Promise<MultiPairResult> {
  const symbols = Array.from(priceMap.keys());
  if (symbols.length === 0) {
    return { decisions: {}, allSignals: [], source: "llm" };
  }

  console.log(`[DecisionEngine] Running multi-timeframe TA + sentiment on ${symbols.length} symbol(s):`, symbols.join(", "));
  const taResults = await Promise.all(
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

  for (const { symbol, ta1h } of taResults) {
    if (ta1h) {
      console.log(`[DecisionEngine] ${symbol} (1h) — RSI: ${ta1h.rsi.toFixed(1)}, MACD HIST: ${ta1h.macdHist > 0 ? "+" : ""}${ta1h.macdHist.toFixed(1)}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const symbolData = new Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any; sentiment: import("./sentiment.service").SentimentSnapshot | null }>();
  for (const { symbol, ta5m, ta1h, ta1d, sentiment } of taResults) {
    symbolData.set(symbol, { ticker: priceMap.get(symbol)!, ta5m, ta1h, ta1d, sentiment });
  }

  // Step 2: Single LLM call with all symbols
  const prompt = buildMultiPrompt(symbolData, activePositions, pendingOrders);

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

    const result = parseMultiResponse(response, symbols);
    return { ...result, source: "llm" };
  } catch (error) {
    console.error(`[DecisionEngine] LLM multi-pair analysis failed: ${error}`);
    const { decisions, allSignals } = fallbackMultiAnalysis(symbolData);
    return { decisions, allSignals, source: "heuristic" };
  }
}
