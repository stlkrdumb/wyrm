import type { TickerData, TradingDecision, Signal, Position } from "@/features/trading-agent/types";

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
  "riskProfile": "tight" | "normal" | "wide",
  "reason": "brief explanation citing specific indicator values"
}`;
}

export function buildMultiPrompt(
  symbolData: Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any; sentiment?: any }>,
  activePositions: Position[] = [],
  pendingOrders: Array<{ symbol: string; side: "buy" | "sell"; limitPrice: number }> = []
): string {
  const entries = Array.from(symbolData.entries());
  const lines = entries
    .map(([symbol, data]) => {
      const changeLabel = data.ticker.change24hPercent >= 0 ? "positive" : "negative";
      const volatility = (((data.ticker.high24h - data.ticker.low24h) / data.ticker.lastPrice) * 100).toFixed(1);

      const t5m = data.ta5m ? `[5m] Close: $${data.ta5m.close.toLocaleString()} | RSI: ${data.ta5m.rsi.toFixed(1)}` : `[5m] N/A`;
      const t1h = data.ta1h ? `[1h] Close: $${data.ta1h.close.toLocaleString()} | RSI: ${data.ta1h.rsi.toFixed(1)} | MACD: Hist ${data.ta1h.macdHist > 0 ? "+" : ""}${data.ta1h.macdHist.toFixed(1)} | BOLL: [${data.ta1h.bollLower.toLocaleString()} - ${data.ta1h.bollUpper.toLocaleString()}] (Mid: ${data.ta1h.bollMiddle.toLocaleString()}) | ATR: ${data.ta1h.atr.toFixed(2)} | EMA20: ${data.ta1h.ema20.toLocaleString()}` : `[1h] N/A`;
      const t1d = data.ta1d ? `[1d] Close: $${data.ta1d.close.toLocaleString()} | RSI: ${data.ta1d.rsi.toFixed(1)} | EMA20: ${data.ta1d.ema20.toLocaleString()}` : `[1d] N/A`;
      
      const sentimentStr = data.sentiment 
        ? `\n  * Sentiment: Fear & Greed: ${data.sentiment.fearAndGreedValue} (${data.sentiment.fearAndGreedClassification}) | Long/Short Ratio: ${data.sentiment.longShortRatio.toFixed(2)} (Long: ${(data.sentiment.longRatio * 100).toFixed(1)}%, Short: ${(data.sentiment.shortRatio * 100).toFixed(1)}%) | Funding Rate: ${(data.sentiment.fundingRate * 100).toFixed(4)}% | Open Interest: ${data.sentiment.openInterest.toLocaleString()}`
        : "";

      return `- ${symbol}:
  * 24h Summary: $${data.ticker.lastPrice.toLocaleString()} | 24h ${data.ticker.change24hPercent > 0 ? "+" : ""}${data.ticker.change24hPercent}% (${changeLabel}) | Volatility: ${volatility}%
  * ${t5m}
  * ${t1h}
  * ${t1d}${sentimentStr}`;
    })
    .join("\n\n");

  const exampleFormat = entries
    .map(([symbol]) => `  "${symbol}": {"action":"buy|sell|hold","strength":-1..1,"confidence":0..1,"riskProfile":"tight|normal|wide","orderType":"market|limit","limitPrice":<price>,"reason":"..."},`)
    .join("\n");

  let positionsSection = "";
  if (activePositions.length > 0) {
    positionsSection = "\nActive Positions we currently hold:\n" + activePositions
      .map(p => {
        const pnlPct = p.entryPrice > 0 ? (((p.unrealizedPnL) / (p.entryPrice * p.size)) * 100).toFixed(2) : "0.00";
        return `- ${p.symbol}: Size ${p.size.toFixed(4)} | Avg Entry Price $${p.entryPrice.toLocaleString()} | Unrealized PnL: $${p.unrealizedPnL.toFixed(2)} (${pnlPct}%)`;
      })
      .join("\n") + "\n";
  } else {
    positionsSection = "\nNo active positions currently held.\n";
  }

  let pendingSection = "";
  if (pendingOrders.length > 0) {
    pendingSection = "\nPending Limit Orders:\n" + pendingOrders
      .map(o => `- ${o.symbol}: LIMIT ${o.side.toUpperCase()} @ $${o.limitPrice.toFixed(2)}`)
      .join("\n") + "\n";
  }

  return `You are a professional quantitative trader. Analyze the following cryptocurrencies and provide a decision for EACH one.
 
Analyze ONLY these symbols and return a JSON object with keys matching each symbol:
${lines}
${positionsSection}
${pendingSection}
Rules:
- For EACH symbol, decide: buy, sell, or hold
- If we hold a position for a symbol and you want to take profit, stop loss, or close it, output "action": "sell".
- If we hold a position and you wish to keep it, output "action": "hold".
- If we hold a position and you wish to add more (average down), output "action": "buy".
- Strength: -1 (strong sell) to +1 (strong buy)
- Confidence: 0-1
- riskProfile (for buy actions only): "tight" (3% SL / 9% TP) | "normal" (5% SL / 10% TP) | "wide" (8% SL / 16% TP)
- Pick riskProfile based on volatility and conviction — tighter for calm markets / high conviction, wider for volatile / uncertain trades
- orderType: "market" (executes immediately at current price) or "limit" (waits for limitPrice)
- limitPrice: ONLY set when orderType is "limit". For limit buys, set below current price (dip entry). For limit sells, set above current price (pump exit).
- You can still exit early with "sell" regardless of the SL/TP auto-bracket levels
- Keep reason under 40 words with specific indicator values and sentiment/funding conditions if they influence your decision
- Make a confident call per symbol — avoid defaulting to "hold" when signals are clear

Respond with ONLY valid JSON in this exact format:
{
${exampleFormat}
}`;
}

export function parseSingleResponse(response: string): { decision: TradingDecision; signals: Signal[] } {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract JSON from LLM response");

  const cleaned = repairJSON(jsonMatch[0]);
  const parsed = JSON.parse(cleaned);

  let action: "buy" | "sell" | "hold";
  if (["buy", "sell", "hold"].includes(parsed.action)) {
    action = parsed.action;
  } else {
    action = "hold";
  }

  const strength = Math.max(-1, Math.min(1, parseFloat(parsed.strength) || 0));
  const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));
  const riskProfile = ["tight", "normal", "wide"].includes(parsed.riskProfile)
    ? (parsed.riskProfile as "tight" | "normal" | "wide")
    : undefined;
  const orderType = parsed.orderType === "limit" ? "limit" as const : undefined;
  const limitPrice = orderType ? (parseFloat(parsed.limitPrice) || undefined) : undefined;

  return {
    decision: { action, strength, confidence, riskProfile, orderType, limitPrice, reason: parsed.reason || "No reasoning provided" },
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

/** Attempt to repair common LLM JSON mistakes before parsing */
function repairJSON(raw: string): string {
  let cleaned = raw;

  // Remove comments (// and /* */)
  cleaned = cleaned.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  // Replace bare Python/JS literals
  cleaned = cleaned.replace(/\b(None|undefined)\b/g, "null");
  cleaned = cleaned.replace(/\bTrue\b/g, "true");
  cleaned = cleaned.replace(/\bFalse\b/g, "false");
  // Fix trailing decimal dot (e.g. 1. → 1.0)
  cleaned = cleaned.replace(/\.(?=\s*[,\}\]])/g, ".0");
  // Strip unescaped control characters from JSON
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Replace single-quoted strings with double-quoted strings
  cleaned = cleaned.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
  // Wrap unquoted keys (word before colon, not already quoted)
  cleaned = cleaned.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
  // Insert missing commas between properties at newlines
  cleaned = cleaned.replace(/}\s*\n(\s*)"/g, '},\n$1"');
  cleaned = cleaned.replace(/]\s*\n(\s*)"/g, '],\n$1"');
  // Close unbalanced braces (handle truncated LLM output)
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;
  cleaned += "}".repeat(Math.max(0, openBraces - closeBraces));
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/\]/g) || []).length;
  cleaned += "]".repeat(Math.max(0, openBrackets - closeBrackets));

  return cleaned;
}

export function parseMultiResponse(
  response: string,
  symbols: string[]
): { decisions: Record<string, TradingDecision>; allSignals: Signal[] } {
  let cleaned = response.replace(/```(?:json)?\s*/gi, "").replace(/\s*```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`[DecisionHelper] LLM raw response (no JSON found):\n${response.slice(0, 2000)}`);
    throw new Error("Failed to extract JSON from LLM multi-pair response");
  }

  cleaned = repairJSON(jsonMatch[0]);
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_firstErr) {
    // Second pass: aggressive repair for stubborn LLM output patterns
    let aggressive = cleaned
      .replace(/[^\x20-\x7E{}[\],:.\-0-9a-zA-Z_" \n\r\t]/g, "")
      .replace(/:\s*"[^"]*$/m, ': ""')
      .replace(/:\s*[0-9.]*\s*$/m, ": 0");
    aggressive = repairJSON(aggressive);
    try {
      parsed = JSON.parse(aggressive);
    } catch (_secondErr) {
      console.error(`[DecisionHelper] JSON parse error — raw:\n${jsonMatch[0].slice(0, 2000)}`);
      throw _firstErr;
    }
  }
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
    const riskProfile = ["tight", "normal", "wide"].includes(raw.riskProfile)
      ? (raw.riskProfile as "tight" | "normal" | "wide")
      : undefined;
    const orderType = raw.orderType === "limit" ? "limit" as const : undefined;
    const limitPrice = orderType ? (parseFloat(raw.limitPrice) || undefined) : undefined;

    decisions[symbol] = { action, strength, confidence, riskProfile, orderType, limitPrice, reason: raw.reason || "No reasoning" };

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

/** Build a compact one-line-per-symbol prompt for Stage 1 screening */
export function buildScreeningPrompt(
  symbols: Array<{ symbol: string; lastPrice: number; change24hPercent: number; volume24h: number }>,
  activePositions: Position[],
  persona: string,
  instructions: string,
): string {
  const lines = symbols.map(s => {
    const label = s.change24hPercent >= 0 ? "positive" : "negative";
    return `${s.symbol}: $${s.lastPrice.toLocaleString()} | ${s.change24hPercent >= 0 ? "+" : ""}${s.change24hPercent}% (${label}) | Vol: ${(s.volume24h / 1_000_000).toFixed(1)}M USDT`;
  });

  let positionsSection = "";
  if (activePositions.length > 0) {
    positionsSection = "\nPositions we hold:\n" + activePositions
      .map(p => `- ${p.symbol}: ${p.size.toFixed(4)} @ $${p.entryPrice.toLocaleString()}`)
      .join("\n");
  }

  return `You are a quantitative coin screener.
Persona: ${persona}
Instructions: ${instructions}

Select up to 2 coins MOST likely to have a strong directional move in the next hour.
We hold: ${positionsSection || "none"}

${lines.join("\n")}

Respond ONLY with this exact JSON, no markdown, no explanation:
{"selected":["SYMBOL1","SYMBOL2"],"reason":"<20 words>"}`;
}

/** Parse screening LLM response — returns selected symbols */
export function parseScreeningResponse(response: string, validSymbols: Set<string>): { selected: string[]; reason: string } {
  // Strip markdown code fences if present
  let cleaned = response.replace(/```(?:json)?\s*/gi, "").replace(/\s*```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const preview = response.length > 0 ? response.slice(0, 200) : "(empty)";
    console.error(`[Screening] No JSON in response (len=${response.length}): ${preview}`);
    return { selected: [], reason: "Parse failure" };
  }

  cleaned = repairJSON(jsonMatch[0]);
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error(`[Screening] JSON parse error: ${e}\nRaw:\n${jsonMatch[0].slice(0, 1500)}`);
    return { selected: [], reason: "JSON parse failure" };
  }

  const raw = Array.isArray(parsed.selected) ? parsed.selected : (Array.isArray(parsed) ? parsed : []);
  const selected = raw
    .map((s: string) => s.toUpperCase().trim())
    .filter((s: string) => validSymbols.has(s))
    .slice(0, 2);

  return { selected, reason: parsed.reason || "" };
}

export function fallbackMultiAnalysis(
  symbolData: Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any }>
): { decisions: Record<string, TradingDecision>; allSignals: Signal[] } {
  const decisions: Record<string, TradingDecision> = {};
  const allSignals: Signal[] = [];

  for (const [symbol, { ticker, ta5m, ta1h, ta1d }] of symbolData) {
    const t5m = ta5m || { rsi: 50, close: ticker.lastPrice };
    const t1h = ta1h || { rsi: 50, macdHist: 0, bollUpper: ticker.lastPrice * 1.05, bollMiddle: ticker.lastPrice, bollLower: ticker.lastPrice * 0.95, atr: 0, ema20: ticker.lastPrice, close: ticker.lastPrice };
    const t1d = ta1d || { rsi: 50, close: ticker.lastPrice, ema20: ticker.lastPrice };

    let strength = 0;

    // RSI oscillator checks
    if (t1h.rsi < 30) strength += 0.25;
    else if (t1h.rsi > 70) strength -= 0.25;

    if (t5m.rsi < 30) strength += 0.15;
    else if (t5m.rsi > 70) strength -= 0.15;

    // Bollinger Band checks
    if (t1h.close <= t1h.bollLower) strength += 0.25;
    else if (t1h.close >= t1h.bollUpper) strength -= 0.25;

    // MACD momentum
    if (t1h.macdHist > 0) strength += 0.1;
    else if (t1h.macdHist < 0) strength -= 0.1;

    // Trend alignment (close vs EMA20 on daily)
    if (t1d.close > t1d.ema20) strength += 0.05;
    else if (t1d.close < t1d.ema20) strength -= 0.05;

    const action: "buy" | "sell" | "hold" =
      strength > 0.15 ? "buy" : strength < -0.15 ? "sell" : "hold";

    decisions[symbol] = {
      action,
      strength,
      confidence: Math.min(1, Math.abs(strength)),
      reason: `Fallback Heuristic: RSI 1h(${t1h.rsi.toFixed(0)}) 5m(${t5m.rsi.toFixed(0)}) | BB ${t1h.close <= t1h.bollLower ? "below lower" : t1h.close >= t1h.bollUpper ? "above upper" : "within"} | MACD ${t1h.macdHist > 0 ? "bullish" : "bearish"}`,
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
