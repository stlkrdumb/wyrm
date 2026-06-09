import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chatCompletion } from "./llm.service";
import { priceStore } from "./price-store";
import type { TickerData, TradingDecision, Signal } from "@/features/trading-agent/types";
import {
  type TASingle,
  buildMultiPrompt,
  parseMultiResponse,
  fallbackMultiAnalysis,
} from "./decision-helper";
import { optionalFetch } from "./proxy-client";
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
}

// ─── Technical Analysis ──────────────────────────────

async function runTAForTimeframe(symbol: string, interval: string): Promise<any> {
  const store = priceStore;
  let candles = store.getCandles(symbol, interval);

  // If cached candles are stale or missing, fetch from REST
  if (!candles || candles.length < 20 || store.isCandleStale(symbol, interval, 5 * 60_000)) {
    if (store.isBacktesting) {
      // Offline mode: do not fetch from live Bitget API during backtests to avoid lookahead bias and API spam
      if (!candles || candles.length === 0) {
        return null;
      }
    } else {
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
  activePositions: import("@/features/trading-agent/types").Position[] = [],
  onToken?: (token: string) => void
): Promise<MultiPairResult> {
  const symbols = Array.from(priceMap.keys());
  if (symbols.length === 0) {
    return { decisions: {}, allSignals: [] };
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

  // Build symbol data map for prompt
  const symbolData = new Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any; sentiment: any }>();
  for (const { symbol, ta5m, ta1h, ta1d, sentiment } of taResults) {
    symbolData.set(symbol, { ticker: priceMap.get(symbol)!, ta5m, ta1h, ta1d, sentiment });
  }

  // Step 2: Single LLM call with all symbols
  const prompt = buildMultiPrompt(symbolData, activePositions);

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

    return parseMultiResponse(response, symbols);
  } catch (error) {
    console.error(`[DecisionEngine] LLM multi-pair analysis failed: ${error}`);
    // Fallback: heuristic per-symbol analysis
    const { decisions, allSignals } = fallbackMultiAnalysis(symbolData);
    return { decisions, allSignals };
  }
}
