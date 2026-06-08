import type { TickerData, TradingDecision, Signal } from "../types";

export interface TASingle {
  rsi: number;
  macdDif: number;
  macdHist: number;
}

export function buildSinglePrompt(ticker: TickerData, ta: TASingle): string {
  const changeLabel = ticker.change24hPercent >= 0 ? "positive" : "negative";
  const volatility = (((ticker.high24h - ticker.low24h) / ticker.lastPrice) * 100).toFixed(2);

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

export function buildMultiPrompt(symbolData: Map<string, { ticker: TickerData; ta: TASingle }>): string {
  const entries = Array.from(symbolData.entries());
  const lines = entries
    .map(([symbol, data]) => {
      const changeLabel = data.ticker.change24hPercent >= 0 ? "positive" : "negative";
      const volatility = (((data.ticker.high24h - data.ticker.low24h) / data.ticker.lastPrice) * 100).toFixed(1);
      return `- ${symbol}: $${data.ticker.lastPrice.toLocaleString()} | 24h ${data.ticker.change24hPercent > 0 ? "+" : ""}${data.ticker.change24hPercent}% (${changeLabel}) | RSI(14): ${data.ta.rsi.toFixed(1)} | MACD HIST: ${data.ta.macdHist > 0 ? "+" : ""}${data.ta.macdHist.toFixed(1)} | Volatility: ${volatility}%`;
    })
    .join("\n");

  const exampleFormat = entries
    .map(([symbol]) => `  "${symbol}": {"action":"buy|sell|hold","strength":-1..1,"confidence":0..1,"reason":"..."},`)
    .join("\n");

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

export function parseSingleResponse(response: string): { decision: TradingDecision; signals: Signal[] } {
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
      {
        id: crypto.randomUUID(),
        name: "LLM Analysis",
        source: "llm" as const,
        direction: strength >= 0.1 ? "bullish" : strength <= -0.1 ? "bearish" : "neutral",
        strength: Math.abs(strength),
        timestamp: new Date(),
      },
    ],
  };
}

export function parseMultiResponse(
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

export function fallbackMultiAnalysis(
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
      id: crypto.randomUUID(),
      name: `Heuristic ${symbol}`,
      source: "technical" as const,
      direction: strength >= 0.1 ? "bullish" : strength <= -0.1 ? "bearish" : "neutral",
      strength: Math.abs(strength),
      timestamp: new Date(),
    });
  }

  return { decisions, allSignals };
}
