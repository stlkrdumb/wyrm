import type { TickerData, TradingDecision, Signal, Position } from "@/features/trading-agent/types";

export interface TASingle {
  rsi: number;
  macdDif: number;
  macdHist: number;
}

export function buildSinglePrompt(ticker: TickerData, ta: TASingle): string {
  const changeLabel = ticker.change24hPercent >= 0 ? "positive" : "negative";
  const volatility = ticker.lastPrice > 0
    ? (((ticker.high24h - ticker.low24h) / ticker.lastPrice) * 100).toFixed(2)
    : "0.00";

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

Respond with ONLY valid JSON (no comments, no TypeScript union syntax):
{
  "action": "buy" OR "sell" OR "hold" (one of three strings, no quotes around the word OR),
  "strength": number between -1 and 1,
  "confidence": number between 0 and 1,
${process.env.LLM_RISKPROFILE === "true"
  ? `  "slPct": number 1-50 (e.g. 5 = 5% stop loss — for buy actions only, decide based on volatility and conviction),
  "tpPct": number 1-100 (e.g. 12 = 12% take profit — for buy actions only, decide based on volatility and conviction),`
  : `  "riskProfile": "tight" OR "normal" OR "wide" (for buy actions — tight=3%SL/9%TP, normal=5%SL/10%TP, wide=8%SL/16%TP),`}
  "reason": "brief explanation citing specific indicator values"
}`;
}

export function buildMultiPrompt(
  symbolData: Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any; sentiment?: any }>,
  activePositions: Position[] = [],
  recentExits: Array<{ symbol: string; reason: 'Stop Loss' | 'Take Profit'; timestamp: number }> = []
): string {
  const entries = Array.from(symbolData.entries());
  const lines = entries
    .map(([symbol, data]) => {
      const changeLabel = data.ticker.change24hPercent >= 0 ? "positive" : "negative";
      const volatility = data.ticker.lastPrice > 0
        ? (((data.ticker.high24h - data.ticker.low24h) / data.ticker.lastPrice) * 100).toFixed(1)
        : "0.0";

      const fmtClose = (v: any) => v?.close != null ? `$${Number(v.close).toLocaleString()}` : "N/A";
      const fmtRSI = (v: any) => v?.rsi != null ? Number(v.rsi).toFixed(1) : "N/A";
      const fmtMACD = (v: any) => v?.macdHist != null ? `Hist ${v.macdHist > 0 ? "+" : ""}${Number(v.macdHist).toFixed(1)}` : "MACD N/A";
      const fmtBoll = (v: any) => v?.bollLower != null && v?.bollUpper != null && v?.bollMiddle != null
        ? `[${Number(v.bollLower).toLocaleString()} - ${Number(v.bollUpper).toLocaleString()}] (Mid: ${Number(v.bollMiddle).toLocaleString()})`
        : "BOLL N/A";
      const fmtATR = (v: any) => v?.atr != null ? Number(v.atr).toFixed(2) : "N/A";
      const fmtEMA = (v: any) => v?.ema20 != null ? Number(v.ema20).toLocaleString() : "N/A";

      const t5m = data.ta5m ? `[5m] Close: ${fmtClose(data.ta5m)} | RSI: ${fmtRSI(data.ta5m)}` : `[5m] N/A`;
      const t1h = data.ta1h ? `[1h] Close: ${fmtClose(data.ta1h)} | RSI: ${fmtRSI(data.ta1h)} | ${fmtMACD(data.ta1h)} | BOLL: ${fmtBoll(data.ta1h)} | ATR: ${fmtATR(data.ta1h)} | EMA20: ${fmtEMA(data.ta1h)}` : `[1h] N/A`;
      const t1d = data.ta1d ? `[1d] Close: ${fmtClose(data.ta1d)} | RSI: ${fmtRSI(data.ta1d)} | EMA20: ${fmtEMA(data.ta1d)}` : `[1d] N/A`;

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

  const slTpFields = process.env.LLM_RISKPROFILE === "true"
    ? '"slPct": 4.5, "tpPct": 12.0,'
    : '"riskProfile": "normal",';

  const exampleFormat = `  "BTCUSDT": {
    "action": "buy",
    "strength": 0.8,
    "confidence": 0.9,
    ${slTpFields}
    "reason": "Strong RSI support on 1h and bullish MACD crossover."
  },
  "ETHUSDT": {
    "action": "hold",
    "strength": 0.0,
    "confidence": 0.5,
    "reason": "RSI is neutral at 50, waiting for clear trend direction."
  }`;

  let positionsSection = "";
  if (activePositions.length > 0) {
    positionsSection = "\nActive Positions we currently hold:\n" + activePositions
      .map(p => {
        const costBasis = p.entryPrice * p.size;
        const pnlPct = costBasis > 0 ? ((p.unrealizedPnL / costBasis) * 100).toFixed(2) : "0.00";
        return `- ${p.symbol}: Size ${p.size.toFixed(4)} | Avg Entry Price $${p.entryPrice.toLocaleString()} | Unrealized PnL: $${p.unrealizedPnL.toFixed(2)} (${pnlPct}%)`;
      })
      .join("\n") + "\n";
  } else {
    positionsSection = "\n⚠ IMPORTANT: We hold NO positions in any of these symbols. Every symbol below should be evaluated as a fresh entry opportunity (buy) or a skip (hold) — there is nothing to sell and nothing to maintain.\n";
  }

  // Recent auto-exits — tells the LLM which symbols were just SL/TP'd and are no longer held.
  const RECENT_EXITS_WINDOW_MS = 30 * 60 * 1000; // 30 min
  const freshExits = recentExits.filter(e => Date.now() - e.timestamp < RECENT_EXITS_WINDOW_MS);
  let recentExitsSection = "";
  if (freshExits.length > 0) {
    const lines = freshExits
      .map(e => {
        const agoMs = Date.now() - e.timestamp;
        const ago = agoMs < 60_000
          ? `${Math.max(1, Math.round(agoMs / 1000))}s ago`
          : `${Math.round(agoMs / 60_000)}m ago`;
        return `- ${e.symbol}: exited ${ago} via ${e.reason}`;
      })
      .join("\n");
    recentExitsSection = `\nRecent Auto-Exits (these symbols were just closed by the system — DO NOT treat them as active positions):\n${lines}\n`;
  }

  return `You are a professional quantitative trader. Analyze the following cryptocurrencies and provide a decision for EACH one.

Analyze ONLY these symbols and return a JSON object with keys matching each symbol:
${lines}
${positionsSection}${recentExitsSection}
Rules:
- For EACH symbol, decide: buy, sell, or hold
- If we hold a position for a symbol (one that appears in the "Active Positions" section above) and you want to take profit, stop loss, or close it, output "action": "sell".
- If we hold a position (listed above) and you wish to keep it, output "action": "hold".
- If we hold a position (listed above) and you wish to add more (average down), output "action": "buy".
- If we do NOT hold a position for a symbol (NOT listed in the Active Positions section), "sell" is invalid — only "buy" or "hold" are valid actions for it.
- ANTI-HALLUCINATION: NEVER refer to "current position", "our position", "we hold", "we are holding", or "maintaining" in your reason for any symbol UNLESS that symbol is explicitly listed in the Active Positions section above. If no positions are listed, we hold nothing — do not invent one.
- ANTI-HALLUCINATION: If a symbol is listed in the Recent Auto-Exits section, it is NOT an active position — the system just closed it. Treat it as a fresh entry opportunity (buy) or a skip (hold). Do NOT say "hold to manage existing position" or "we already hold" for any symbol in that list.
- For "hold" decisions on symbols we don't own, explain why the technical/fundamental signals don't warrant a fresh entry (e.g., weak RSI, unclear trend, low volume), NOT because you're "maintaining a position".
- Strength: -1 (strong sell) to +1 (strong buy)
- Confidence: 0-1
${process.env.LLM_RISKPROFILE === "true"
  ? `- LLM_RISKPROFILE MODE: For buy actions, decide your own stopLoss (slPct: number 1-50, e.g. 5 = 5%) and takeProfit (tpPct: number 1-100, e.g. 12 = 12%) based on ATR, volatility, and conviction. Output them as numbers in the JSON — do NOT use riskProfile. Tighter for calm markets / high conviction, wider for volatile / uncertain trades. NEVER leave slPct/tpPct blank for a buy action.`
  : `- riskProfile (for buy actions only): "tight" (3% SL / 9% TP) | "normal" (5% SL / 10% TP) | "wide" (8% SL / 16% TP)
- Pick riskProfile based on volatility and conviction — tighter for calm markets / high conviction, wider for volatile / uncertain trades`}
- You can still exit early with "sell" regardless of the SL/TP auto-bracket levels
- Keep reason under 40 words with specific indicator values and sentiment/funding conditions if they influence your decision
- Make a confident call per symbol — avoid defaulting to "hold" when signals are clear

Respond with ONLY valid JSON (no comments, no conversational text, no markdown wrappers — write out the values directly):
{
${exampleFormat}
}`;
}

export function parseSingleResponse(response: string): { decision: TradingDecision; signals: Signal[] } {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract JSON from LLM response");

  let parsed: any;
  try {
    parsed = JSON.parse(repairJSON(jsonMatch[0]));
  } catch (_firstErr) {
    // Second pass: aggressive repair
    try {
      const aggressive = repairJSON(
        jsonMatch[0]
          .replace(/[^\x20-\x7E{}[\],:.\-0-9a-zA-Z_" \n\r\t]/g, "")
          .replace(/:\s*"[^"]*$/m, ': ""')
          .replace(/:\s*[0-9.]*\s*$/m, ": 0")
      );
      parsed = JSON.parse(aggressive);
    } catch (_secondErr) {
      console.error(`[DecisionHelper] JSON parse error — raw:\n${jsonMatch[0].slice(0, 2000)}`);
      throw _secondErr;
    }
  }

  let action: "buy" | "sell" | "hold";
  if (parsed.action === "buy" || parsed.action === "sell" || parsed.action === "hold") {
    action = parsed.action;
  } else {
    console.warn(`[DecisionHelper] Single response: unknown action "${parsed.action}", defaulting to hold`);
    action = "hold";
  }

  const strength = Math.max(-1, Math.min(1, parseFloat(parsed.strength) || 0));
  const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));
  const riskProfile = (parsed.riskProfile === "tight" || parsed.riskProfile === "normal" || parsed.riskProfile === "wide")
    ? parsed.riskProfile
    : undefined;
  const slPct = parsePercentField(parsed.slPct, 1, 50);
  const tpPct = parsePercentField(parsed.tpPct, 1, 100);

  return {
    decision: { action, strength, confidence, riskProfile, slPct, tpPct, reason: sanitizeReason(parsed.reason || "No reasoning provided") },
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

/** Attempt to repair common LLM JSON mistakes before parsing.
 *  String-aware — preserves // inside string values. */
function repairJSON(raw: string): string {
  let cleaned = raw;

  // Strip // and /* */ comments only when outside string literals
  cleaned = stripCommentsOutsideStrings(cleaned);

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
  // Wrap unquoted keys (word before colon, not already quoted)
  cleaned = cleaned.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
  // Insert missing commas between properties at newlines
  cleaned = cleaned.replace(/}\s*\n(\s*)"/g, '},\n$1"');
  cleaned = cleaned.replace(/]\s*\n(\s*)"/g, '],\n$1"');

  // Close unbalanced braces/brackets with proper nesting (LIFO)
  cleaned = closeUnbalancedDelimiters(cleaned);

  return cleaned;
}

/** Strip single-line and multi-line comments only when NOT inside a string literal.
 *  Tracks string state and escaped quotes. */
function stripCommentsOutsideStrings(input: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let stringChar = "";

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < input.length) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === stringChar) inString = false;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      i++;
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/** Close unbalanced braces/brackets using a stack for proper nesting (LIFO). */
function closeUnbalancedDelimiters(input: string): string {
  const stack: string[] = [];
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (ch === "\\" && i + 1 < input.length) { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // Build closing string in LIFO order so nesting is preserved
  let closing = "";
  while (stack.length > 0) {
    const opener = stack.pop()!;
    closing += opener === "{" ? "}" : "]";
  }
  return input + closing;
}

/** Parse and validate a percent field from the LLM. Returns undefined if missing/invalid. */
function parsePercentField(raw: unknown, min: number, max: number): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const clamped = Math.max(min, Math.min(max, raw));
  return Number(clamped.toFixed(2));
}

/** Strip hallucinated position references from the LLM's reason text.
 *  This is a server-side safety net for when the LLM ignores prompt rules
 *  (especially when reasoning is disabled) and invents a position. */
function sanitizeReason(reason: string): string {
  if (!reason || typeof reason !== "string") return reason;
  const patterns: RegExp[] = [
    /manage existing position[^.,]*/gi,
    /current position is held[^.,]*/gi,
    /current position[^.,]*/gi,
    /our position[^.,]*/gi,
    /we hold (a |an )?position[^.,]*/gi,
    /we are holding[^.,]*/gi,
    /maintaining (a |an |our )?position[^.,]*/gi,
    /holding (this |the )?position[^.,]*/gi,
  ];
  let out = reason;
  for (const p of patterns) out = out.replace(p, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

function findDecisionForSymbol(parsed: any, symbol: string): any {
  if (!parsed) return null;

  const targetSymbol = symbol.toUpperCase();
  const baseSymbol = symbol.replace(/USDT$/, "").toUpperCase();

  const matchesSymbol = (str: unknown): boolean => {
    if (typeof str !== "string") return false;
    const s = str.toUpperCase();
    return s === targetSymbol || s === baseSymbol;
  };

  const search = (node: any): any => {
    if (!node) return null;

    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object") {
          if (matchesSymbol(item.symbol) || matchesSymbol(item.pair) || matchesSymbol(item.instId) || matchesSymbol(item.ticker)) {
            return item;
          }
          const res = search(item);
          if (res) return res;
        }
      }
      return null;
    }

    if (typeof node === "object") {
      const keys = Object.keys(node);
      for (const key of keys) {
        if (matchesSymbol(key)) {
          return node[key];
        }
      }

      if (matchesSymbol(node.symbol) || matchesSymbol(node.pair) || matchesSymbol(node.instId) || matchesSymbol(node.ticker)) {
        if (node.action) return node;
      }

      for (const key of keys) {
        const val = node[key];
        if (val && typeof val === "object") {
          const res = search(val);
          if (res) return res;
        }
      }
    }

    return null;
  };

  return search(parsed);
}

function extractJSONObjects(input: string): any[] {
  const objects: any[] = [];
  let braceCount = 0;
  let startIdx = -1;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (ch === "\\" && i + 1 < input.length) {
        i++;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") {
      if (braceCount === 0) {
        startIdx = i;
      }
      braceCount++;
    } else if (ch === "}") {
      braceCount--;
      if (braceCount === 0 && startIdx !== -1) {
        const candidate = input.slice(startIdx, i + 1);
        try {
          const parsed = JSON.parse(repairJSON(candidate));
          objects.push(parsed);
        } catch {
          try {
            const repaired = repairJSON(candidate);
            objects.push(JSON.parse(repaired));
          } catch {
            // ignore invalid blocks
          }
        }
        startIdx = -1;
      }
    }
  }

  return objects;
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

  let parsed: any;
  try {
    const extracted = extractJSONObjects(jsonMatch[0]);
    if (extracted.length > 0) {
      const merged: Record<string, any> = {};
      for (const obj of extracted) {
        Object.assign(merged, obj);
      }
      parsed = merged;
    } else {
      parsed = JSON.parse(repairJSON(jsonMatch[0]));
    }
  } catch (_firstErr) {
    // Second pass: aggressive repair for stubborn LLM output patterns
    const aggressive = repairJSON(
      jsonMatch[0]
        .replace(/[^\x20-\x7E{}[\],:.\-0-9a-zA-Z_" \n\r\t]/g, "")
        .replace(/:\s*"[^"]*$/m, ': ""')
        .replace(/:\s*[0-9.]*\s*$/m, ": 0")
    );
    try {
      parsed = JSON.parse(aggressive);
    } catch (_secondErr) {
      console.error(`[DecisionHelper] JSON parse error — raw:\n${jsonMatch[0].slice(0, 2000)}`);
      throw _secondErr;
    }
  }
  const decisions: Record<string, TradingDecision> = {};
  const allSignals: Signal[] = [];

  for (const symbol of symbols) {
    const raw = findDecisionForSymbol(parsed, symbol);
    if (!raw || !raw.action) {
      console.warn(`[DecisionHelper] Multi-response: missing decision for ${symbol} — defaulting to hold`);
      decisions[symbol] = { action: "hold", strength: 0, confidence: 0, reason: "No decision from LLM" };
      continue;
    }

    let action: "buy" | "sell" | "hold";
    if (raw.action === "buy" || raw.action === "sell" || raw.action === "hold") {
      action = raw.action;
    } else {
      console.warn(`[DecisionHelper] Multi-response ${symbol}: unknown action "${raw.action}", defaulting to hold`);
      action = "hold";
    }

    const strength = Math.max(-1, Math.min(1, parseFloat(raw.strength) || 0));
    const confidence = Math.max(0, Math.min(1, parseFloat(raw.confidence) || 0.5));
    const riskProfile = (raw.riskProfile === "tight" || raw.riskProfile === "normal" || raw.riskProfile === "wide")
      ? raw.riskProfile
      : undefined;
    const slPct = parsePercentField(raw.slPct, 1, 50);
    const tpPct = parsePercentField(raw.tpPct, 1, 100);

    decisions[symbol] = { action, strength, confidence, riskProfile, slPct, tpPct, reason: sanitizeReason(raw.reason || "No reasoning") };

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
  symbolData: Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any }>
): { decisions: Record<string, TradingDecision>; allSignals: Signal[] } {
  const decisions: Record<string, TradingDecision> = {};
  const allSignals: Signal[] = [];

  for (const [symbol, data] of symbolData) {
    if (!data || !data.ticker) {
      console.warn(`[Fallback] Missing ticker data for ${symbol} — skipping`);
      continue;
    }
    const { ticker, ta5m, ta1h, ta1d } = data;
    const t5m = ta5m || { rsi: 50, close: ticker.lastPrice };
    const t1h = ta1h || { rsi: 50, macdHist: 0, bollUpper: ticker.lastPrice * 1.05, bollMiddle: ticker.lastPrice, bollLower: ticker.lastPrice * 0.95, atr: 0, ema20: ticker.lastPrice, close: ticker.lastPrice };
    const t1d = ta1d || { rsi: 50, close: ticker.lastPrice, ema20: ticker.lastPrice };

    let strength = 0;

    // RSI oscillator checks (different thresholds per timeframe — 5m uses tighter 25/75)
    if (t1h.rsi < 30) strength += 0.25;
    else if (t1h.rsi > 70) strength -= 0.25;

    if (t5m.rsi < 25) strength += 0.15;
    else if (t5m.rsi > 75) strength -= 0.15;

    // Bollinger Band checks (strict breach required — not just touch)
    if (t1h.close < t1h.bollLower) strength += 0.25;
    else if (t1h.close > t1h.bollUpper) strength -= 0.25;

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
      reason: `Fallback Heuristic: RSI 1h(${t1h.rsi.toFixed(0)}) 5m(${t5m.rsi.toFixed(0)}) | BB ${t1h.close < t1h.bollLower ? "below lower" : t1h.close > t1h.bollUpper ? "above upper" : "within"} | MACD ${t1h.macdHist > 0 ? "bullish" : "bearish"}`,
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
