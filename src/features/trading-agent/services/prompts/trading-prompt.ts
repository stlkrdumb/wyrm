import type { TickerData, Position } from "@/features/trading-agent/types";

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
  recentExits: Array<{ symbol: string; reason: 'Stop Loss' | 'Take Profit' | 'Dust Cleanup' | 'Manual Close'; timestamp: number }> = []
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
    positionsSection = "\n\u26a0 IMPORTANT: We hold NO positions in any of these symbols. Every symbol below should be evaluated as a fresh entry opportunity (buy) or a skip (hold) \u2014 there is nothing to sell and nothing to maintain.\n";
  }

  const RECENT_EXITS_WINDOW_MS = 30 * 60 * 1000;
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
    recentExitsSection = `\nRecent Auto-Exits (these symbols were just closed by the system \u2014 DO NOT treat them as active positions):\n${lines}\n`;
  }

  return `You are a professional quantitative trader. Analyze the following cryptocurrencies and provide a decision for EACH one.

Analyze ONLY these symbols and return a JSON object with keys matching each symbol:
${lines}
${positionsSection}${recentExitsSection}
Rules:
- You MUST provide a decision for EVERY SINGLE symbol listed above (specifically: ${Array.from(symbolData.keys()).join(", ")}). Never omit any symbol from your JSON response. If you want to take no action on a symbol, explicitly output "action": "hold" for it.
- For EACH symbol, decide: buy, sell, or hold
- If we hold a position for a symbol (one that appears in the "Active Positions" section above) and you want to take profit, stop loss, or close it, output "action": "sell".
- If we hold a position (listed above) and you wish to keep it, output "action": "hold".
- If we hold a position (listed above) and you wish to add more (average down), output "action": "buy".
- If we do NOT hold a position for a symbol (NOT listed in the Active Positions section), "sell" is invalid \u2014 only "buy" or "hold" are valid actions for it.
- ANTI-HALLUCINATION: NEVER refer to "current position", "our position", "we hold", "we are holding", or "maintaining" in your reason for any symbol UNLESS that symbol is explicitly listed in the Active Positions section above. If no positions are listed, we hold nothing \u2014 do not invent one.
- ANTI-HALLUCINATION: If a symbol is listed in the Recent Auto-Exits section, it is NOT an active position \u2014 the system just closed it. Treat it as a fresh entry opportunity (buy) or a skip (hold). Do NOT say "hold to manage existing position" or "we already hold" for any symbol in that list.
- For "hold" decisions on symbols we don't own, explain why the technical/fundamental signals don't warrant a fresh entry (e.g., weak RSI, unclear trend, low volume), NOT because you're "maintaining a position".
- Strength and Action Rules:
  * For "hold" decisions, "strength" MUST be 0.0. Do NOT include "riskProfile" (or "slPct"/"tpPct").
  * For "sell" decisions, "strength" MUST be a negative number between -0.1 and -1.0 representing exit size percentage (e.g., strength -0.5 means sell 50% of the position, -1.0 means sell 100%). Do NOT include "riskProfile" (or "slPct"/"tpPct").
  * For "buy" decisions, "strength" MUST be a positive number between 0.1 and 1.0. You MUST specify a "riskProfile" (or "slPct"/"tpPct").
- Confidence: 0-1
${process.env.LLM_RISKPROFILE === "true"
  ? `- LLM_RISKPROFILE MODE: For buy actions, decide your own stopLoss (slPct: number 1-50, e.g. 5 = 5%) and takeProfit (tpPct: number 1-100, e.g. 12 = 12%) based on ATR, volatility, and conviction. Output them as numbers in the JSON \u2014 do NOT use riskProfile. Tighter for calm markets / high conviction, wider for volatile / uncertain trades. NEVER leave slPct/tpPct blank for a buy action.`
  : `- riskProfile (for buy actions only): "tight" (3% SL / 9% TP) | "normal" (5% SL / 10% TP) | "wide" (8% SL / 16% TP)
- Pick riskProfile based on volatility and conviction \u2014 tighter for calm markets / high conviction, wider for volatile / uncertain trades`}
- You can still exit early with "sell" regardless of the SL/TP auto-bracket levels
- Keep reason under 40 words with specific indicator values and sentiment/funding conditions if they influence your decision
- Make a confident call per symbol \u2014 avoid defaulting to "hold" when signals are clear

Respond with ONLY valid JSON (no comments, no conversational text, no markdown wrappers \u2014 write out the values directly):
{
${exampleFormat}
}`;
}
