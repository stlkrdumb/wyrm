import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chatCompletion } from "./llm.service";
import type { TickerData, TradingDecision, Signal } from "../types";

const exec = promisify(execFile);
// In Next.js dev mode, __dirname can resolve weirdly. Use CWD instead.
const ANALYSIS_SCRIPT = path.join(
  process.cwd(),
  "src/features/trading-agent/analysis/cli.py"
);

/**
 * Fetch real OHLCV data from Bitget and run technical analysis via Python.
 */
async function getTechnicalAnalysis(ticker: TickerData): Promise<{
  indicators: Record<string, any>;
  rsi: number;
  macdDif: number;
  macdHist: number;
}> {
  try {
    const proxyUrl = process.env.BITGET_PROXY;
    let ohlcvs: string[][];

    if (proxyUrl) {
      // Fetch via subprocess curl with proxy (reliable, works on all platforms)
      const result = await exec("curl", [
        "-sS", "--max-time", "10",
        "-x", proxyUrl,
        "--user-agent", "curl/7.81.0",
        `https://api.bitget.com/api/v2/spot/market/candles?symbol=${ticker.symbol}&granularity=1h&limit=50`,
      ]);
      const json = JSON.parse(result.stdout);
      ohlcvs = json.data ?? [];
    } else {
      // No proxy — direct fetch (fallback)
      const res = await fetch(
        `https://api.bitget.com/api/v2/spot/market/candles?symbol=${ticker.symbol}&granularity=1h&limit=50`
      );
      const json = await res.json();
      ohlcvs = json.data ?? [];
    }

    if (!ohlcvs || ohlcvs.length === 0) {
      throw new Error("No candle data returned from Bitget");
    }

    // Run Python CLI with real OHLCV data
    const result = await exec("python3", [
      ANALYSIS_SCRIPT,
      JSON.stringify({
        symbol: ticker.symbol,
        ohlcvs: ohlcvs.map((c: string[]) => [
          Number(c[0]), c[1], c[2], c[3], c[4], c[5]
        ]),
        indicators: {
          MACD: { fast: 12, slow: 26, signal: 9 },
          RSI: { period: 14 },
          BOLL: { period: 20, std_dev: 2 },
        },
      }),
    ], { timeout: 30_000 });

    const output = JSON.parse(result.stdout);

    // Extract latest indicator values
    const rsi = output.indicators?.RSI?.series?.RSI_14;
    const macd = output.indicators?.MACD;

    return {
      indicators: output,
      rsi: rsi ? Number(rsi[rsi.length - 1]) : 0,
      macdDif: macd?.series?.DIF ? Number(macd.series.DIF[macd.series.DIF.length - 1]) : 0,
      macdHist: macd?.series?.HIST ? Number(macd.series.HIST[macd.series.HIST.length - 1]) : 0,
    };
  } catch (error) {
    console.error(`[DecisionEngine] Technical analysis failed:`, error);
    throw new Error("Technical analysis unavailable");
  }
}

/**
 * Build LLM prompt with both market data AND real technical indicators.
 */
function buildAnalysisPrompt(
  ticker: TickerData,
  ta: { rsi: number; macdDif: number; macdHist: number }
): string {
  const changeLabel = ticker.change24hPercent >= 0 ? "positive" : "negative";
  const volatility = ((ticker.high24h - ticker.low24h) / ticker.lastPrice * 100).toFixed(2);

  return `You are a quantitative trading analyst. Analyze BTC/USDT and provide a structured decision.

Market Data:
- Current Price: $${ticker.lastPrice.toLocaleString()} USDT
- 24h High: $${ticker.high24h.toLocaleString()}
- 24h Low: $${ticker.low24h.toLocaleString()}
- 24h Change: ${ticker.change24hPercent > 0 ? "+" : ""}${ticker.change24hPercent}% (${changeLabel})
- 24h Volume: ${Math.round(ticker.volume24h).toLocaleString()} USDT
- 24h Volatility: ${volatility}%

Technical Indicators (from Bitget official analysis):
- RSI(14): ${ta.rsi.toFixed(2)} (0-100, >70 overbought, <30 oversold)
- MACD DIF: ${ta.macdDif.toFixed(2)}, DEA: ${ta.macdHist > 0 ? "positive momentum" : "negative momentum"}

Key questions to consider:
1. Price position relative to 24h range (near high = overbought, near low = oversold?)
2. RSI signal — is it overbought, oversold, or neutral?
3. MACD direction — is momentum building or fading?
4. Volume strength (high volume confirms the move)
5. Risk assessment for current levels

Respond with ONLY valid JSON in this exact format:
{
  "action": "buy" | "sell" | "hold",
  "strength": number between -1 and 1,
  "confidence": number between 0 and 1,
  "reason": "brief explanation of the decision citing specific indicator values",
  "signals": [
    {"name": "RSI(14)", "direction": "bullish" | "bearish" | "neutral", "strength": number 0-1},
    {"name": "MACD Momentum", "direction": "bullish" | "bearish" | "neutral", "strength": number 0-1},
    {"name": "24h Trend", "direction": "bullish" | "bearish" | "neutral", "strength": number 0-1}
  ]
}`;
}

/**
 * Parse LLM response into structured TradingDecision + Signals.
 */
function parseDecisionResponse(response: string): { decision: TradingDecision; signals: Signal[] } {
  // Extract JSON from markdown code blocks if present
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to extract JSON from LLM response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate and sanitize action
  let action: "buy" | "sell" | "hold";
  if (["buy", "sell", "hold"].includes(parsed.action)) {
    action = parsed.action;
  } else {
    action = "hold";
  }

  const strength = Math.max(-1, Math.min(1, parseFloat(parsed.strength) || 0));
  const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));

  const decision: TradingDecision = {
    action,
    strength,
    confidence,
    reason: parsed.reason || "No reasoning provided",
  };

  // Parse signals
  const rawSignals = parsed.signals || [];
  const signals: Signal[] = rawSignals.map((s: any) => ({
    id: crypto.randomUUID(),
    name: s.name || "Unknown Signal",
    source: "llm" as const,
    direction: ["bullish", "bearish", "neutral"].includes(s.direction) ? s.direction : "neutral",
    strength: Math.max(0, Math.min(1, parseFloat(s.strength) || 0)),
    timestamp: new Date(),
  }));

  // Ensure we have at least one signal
  if (signals.length === 0) {
    signals.push({
      id: crypto.randomUUID(),
      name: "LLM Analysis",
      source: "llm" as const,
      direction: strength >= 0.1 ? "bullish" : strength <= -0.1 ? "bearish" : "neutral",
      strength: Math.abs(strength),
      timestamp: new Date(),
    });
  }

  return { decision, signals };
}

/**
 * Core analysis function — real Bitget candles + Python technical indicators → LLM reasoning → Trading Decision.
 */
export async function evaluateSignals(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  // Step 1: Get technical analysis from Python
  let ta: { rsi: number; macdDif: number; macdHist: number } = {
    rsi: 50,
    macdDif: 0,
    macdHist: 0,
  };

  try {
    ta = await getTechnicalAnalysis(ticker);
    console.log(`[DecisionEngine] Technical analysis — RSI: ${ta.rsi.toFixed(1)}, MACD HIST: ${ta.macdHist > 0 ? "+" : ""}${ta.macdHist.toFixed(1)}`);
  } catch {
    console.warn("[DecisionEngine] Technical analysis unavailable, using neutral defaults");
  }

  // Step 2: Send to LLM for decision
  const prompt = buildAnalysisPrompt(ticker, ta);

  try {
    const response = await chatCompletion({
      messages: [
        { role: "system", content: "You are a professional quantitative trader. Analyze market data and provide concise, actionable decisions based on RSI, MACD, and price action. Never use markdown formatting in your response." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3, // Lower = more consistent analysis
      maxTokens: 1024,
    });

    return parseDecisionResponse(response);
  } catch (error) {
    console.error(`[DecisionEngine] LLM analysis failed: ${error}`);
    // Fallback to simple heuristic analysis with indicator context
    return fallbackAnalysis(ticker, ta);
  }
}

/**
 * Simple rule-based fallback when LLM is unavailable.
 */
function fallbackAnalysis(
  ticker: TickerData,
  ta: { rsi: number; macdDif: number; macdHist: number }
): { decision: TradingDecision; signals: Signal[] } {
  const range = ticker.high24h - ticker.low24h;
  const pricePosition = (ticker.lastPrice - ticker.low24h) / range;

  // Combine LLM-like heuristics with real indicator values
  let strength: number = 0;

  // RSI contribution (overbought = sell, oversold = buy)
  if (ta.rsi > 70) strength -= 0.3;      // Overbought → bearish bias
  else if (ta.rsi < 30) strength += 0.3; // Oversold → bullish bias

  // MACD contribution
  if (ta.macdHist > 50) strength += 0.2;  // Strong positive momentum
  else if (ta.macdHist < -50) strength -= 0.2;

  // Price position in range
  if (pricePosition > 0.9) strength -= 0.1; // Near top → caution
  else if (pricePosition < 0.1) strength += 0.1; // Near bottom → opportunity

  const action: "buy" | "sell" | "hold" =
    strength > 0.15 ? "buy" : strength < -0.15 ? "sell" : "hold";

  const reason = `RSI(${ta.rsi.toFixed(1)}) MACD(${ta.macdHist.toFixed(1)}) Range ${pricePosition > 0.7 ? "top" : pricePosition < 0.3 ? "bottom" : "mid"}: ${(strength > 0 ? "+" : "")}${strength.toFixed(2)}`;

  const decision: TradingDecision = {
    action,
    strength,
    confidence: Math.min(1, Math.abs(strength)),
    reason,
  };

  const signals: Signal[] = [
    { id: crypto.randomUUID(), name: "RSI(14)", source: "technical" as const, direction: ta.rsi > 70 ? "bearish" : ta.rsi < 30 ? "bullish" : "neutral", strength: Math.abs((ta.rsi - 50) / 50), timestamp: new Date() },
    { id: crypto.randomUUID(), name: "MACD Momentum", source: "technical" as const, direction: ta.macdHist > 50 ? "bullish" : ta.macdHist < -50 ? "bearish" : "neutral", strength: Math.min(1, Math.abs(ta.macdHist) / 200), timestamp: new Date() },
    { id: crypto.randomUUID(), name: "24h Range", source: "technical" as const, direction: pricePosition > 0.5 ? "bearish" : "bullish", strength: Math.abs(pricePosition - 0.5) * 2, timestamp: new Date() },
  ];

  return { decision, signals };
}
