import type { TickerData, TradingDecision, Signal } from "@/features/trading-agent/types";

/**
 * Fallback heuristic analysis when the LLM is unreachable or times out.
 * Uses RSI, Bollinger Bands, MACD, and EMA trend alignment to score
 * each symbol and produce a trading decision.
 */
export function fallbackMultiAnalysis(
  symbolData: Map<string, { ticker: TickerData; ta5m: any; ta1h: any; ta1d: any }>
): { decisions: Record<string, TradingDecision>; allSignals: Signal[] } {
  const decisions: Record<string, TradingDecision> = {};
  const allSignals: Signal[] = [];

  for (const [symbol, data] of symbolData) {
    if (!data || !data.ticker) {
      console.warn(`[Fallback] Missing ticker data for ${symbol} \u2014 skipping`);
      continue;
    }
    const { ticker, ta5m, ta1h, ta1d } = data;
    const t5m = ta5m || { rsi: 50, close: ticker.lastPrice };
    const t1h = ta1h || {
      rsi: 50, macdHist: 0,
      bollUpper: ticker.lastPrice * 1.05, bollMiddle: ticker.lastPrice,
      bollLower: ticker.lastPrice * 0.95, atr: 0, ema20: ticker.lastPrice,
      close: ticker.lastPrice,
    };
    const t1d = ta1d || { rsi: 50, close: ticker.lastPrice, ema20: ticker.lastPrice };

    let strength = 0;

    // RSI oscillator checks (different thresholds per timeframe \u2014 5m uses tighter 25/75)
    if (t1h.rsi < 30) strength += 0.25;
    else if (t1h.rsi > 70) strength -= 0.25;

    if (t5m.rsi < 25) strength += 0.15;
    else if (t5m.rsi > 75) strength -= 0.15;

    // Bollinger Band checks (strict breach required \u2014 not just touch)
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
      ...(action === "buy" ? { riskProfile: "normal" } : {}),
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
