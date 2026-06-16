import type { TradingDecision, Signal } from "@/features/trading-agent/types";
import { repairJSON, parsePercentField, sanitizeReason, extractJSONObjects } from "./json-utils";

/** Parse a single-symbol LLM response into a TradingDecision + Signal pair. */
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
      console.error(`[DecisionHelper] JSON parse error \u2014 raw:\n${jsonMatch[0].slice(0, 2000)}`);
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

  let strength = Math.max(-1, Math.min(1, parseFloat(parsed.strength) || 0));
  const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));
  let riskProfile = (parsed.riskProfile === "tight" || parsed.riskProfile === "normal" || parsed.riskProfile === "wide")
    ? parsed.riskProfile
    : undefined;
  let slPct = parsePercentField(parsed.slPct, 1, 50);
  let tpPct = parsePercentField(parsed.tpPct, 1, 100);

  // Sanitize values based on the parsed action
  if (action === "hold") {
    strength = 0;
    riskProfile = undefined;
    slPct = undefined;
    tpPct = undefined;
  } else if (action === "sell") {
    if (strength > 0) strength = -strength;
    if (strength === 0) strength = -1.0;
    riskProfile = undefined;
    slPct = undefined;
    tpPct = undefined;
  } else if (action === "buy") {
    if (strength < 0) strength = Math.abs(strength);
    if (strength === 0) strength = 0.5;
  }

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

/** Search a parsed JSON structure for a decision matching a specific symbol.
 *  Handles various LLM output formats: flat dict, nested objects, arrays. */
export function findDecisionForSymbol(parsed: any, symbol: string): any {
  if (!parsed) return null;

  const clean = (str: string) => str.replace(/[^A-Z0-9]/g, "").toUpperCase();
  const targetSymbol = clean(symbol);
  const baseSymbol = clean(symbol.replace(/USDT$/, ""));

  const matchesSymbol = (str: unknown): boolean => {
    if (typeof str !== "string") return false;
    const s = clean(str);
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

/** Attempt to extract a symbol's decision from unstructured text (regex fallback). */
export function parseSymbolDecisionFromText(text: string, symbol: string): any {
  const lines = text.split("\n");
  const clean = (str: string) => str.replace(/[^A-Z0-9]/g, "").toUpperCase();
  const targetSymbol = clean(symbol);
  const baseSymbol = clean(symbol.replace(/USDT$/, ""));

  for (const line of lines) {
    const upperLine = line.toUpperCase();
    if (upperLine.includes(targetSymbol) || upperLine.includes(baseSymbol)) {
      let action: string | undefined;
      if (/\bbuy\b/i.test(line)) action = "buy";
      else if (/\bsell\b/i.test(line)) action = "sell";
      else if (/\bhold\b/i.test(line)) action = "hold";

      if (!action) continue;

      let strength = 0;
      const strengthMatch = line.match(/strength\s*(-?[0-9.]+)/i);
      if (strengthMatch) {
        strength = parseFloat(strengthMatch[1]);
      } else {
        strength = action === "buy" ? 0.5 : action === "sell" ? -0.5 : 0;
      }

      let confidence = 0.5;
      const confidenceMatch = line.match(/confidence\s*([0-9.]+)/i);
      if (confidenceMatch) {
        confidence = parseFloat(confidenceMatch[1]);
      }

      let slPct: number | undefined;
      const slMatch = line.match(/sl\s*([0-9.]+)/i);
      if (slMatch) slPct = parseFloat(slMatch[1]);

      let tpPct: number | undefined;
      const tpMatch = line.match(/tp\s*([0-9.]+)/i);
      if (tpMatch) tpPct = parseFloat(tpMatch[1]);

      const reason = line.replace(new RegExp(`${symbol}|${baseSymbol}`, "gi"), "").trim();

      return {
        action,
        strength,
        confidence,
        slPct,
        tpPct,
        reason: reason.slice(0, 150),
      };
    }
  }

  return null;
}

/** Parse a multi-symbol LLM response into per-symbol TradingDecisions and Signal pairs. */
export function parseMultiResponse(
  response: string,
  symbols: string[]
): { decisions: Record<string, TradingDecision>; allSignals: Signal[] } {
  let cleaned = response.replace(/```(?:json)?\s*/gi, "").replace(/\s*```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

  let parsed: any = null;
  if (jsonMatch) {
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
        console.warn("[DecisionHelper] JSON parsing failed completely. Will attempt regex fallback parsing.");
      }
    }
  } else {
    console.warn("[DecisionHelper] No JSON structure found in LLM response. Attempting regex fallback parsing.");
  }

  const decisions: Record<string, TradingDecision> = {};
  const allSignals: Signal[] = [];

  for (const symbol of symbols) {
    let raw = parsed ? findDecisionForSymbol(parsed, symbol) : null;
    
    // Regex fallback if JSON parsing failed or symbol is missing from JSON
    if (!raw || !raw.action) {
      raw = parseSymbolDecisionFromText(response, symbol);
    }

    if (!raw || !raw.action) {
      console.warn(`[DecisionHelper] Multi-response: missing decision for ${symbol} \u2014 defaulting to hold`);
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

    let strength = Math.max(-1, Math.min(1, parseFloat(raw.strength) || 0));
    const confidence = Math.max(0, Math.min(1, parseFloat(raw.confidence) || 0.5));
    let riskProfile = (raw.riskProfile === "tight" || raw.riskProfile === "normal" || raw.riskProfile === "wide")
      ? raw.riskProfile
      : undefined;
    let slPct = parsePercentField(raw.slPct, 1, 50);
    let tpPct = parsePercentField(raw.tpPct, 1, 100);

    // Sanitize values based on the parsed action
    if (action === "hold") {
      strength = 0;
      riskProfile = undefined;
      slPct = undefined;
      tpPct = undefined;
    } else if (action === "sell") {
      if (strength > 0) strength = -strength;
      if (strength === 0) strength = -1.0;
      riskProfile = undefined;
      slPct = undefined;
      tpPct = undefined;
    } else if (action === "buy") {
      if (strength < 0) strength = Math.abs(strength);
      if (strength === 0) strength = 0.5;
    }

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