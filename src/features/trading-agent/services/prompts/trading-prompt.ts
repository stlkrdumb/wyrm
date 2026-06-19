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
  
  // Compact single-line format per symbol — reduces token count by ~60%
  const lines = entries
    .map(([symbol, data]) => {
      const { ticker, ta5m, ta1h, ta1d, sentiment } = data;
      
      const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));
      const fmtM = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));
      
      const volatility = ticker.lastPrice > 0
        ? (((ticker.high24h - ticker.low24h) / ticker.lastPrice) * 100).toFixed(1)
        : "0.0";
      
      // Compact TA indicators
      const t5m = ta5m ? `RSI${Number(ta5m.rsi).toFixed(0)}` : "?";
      const t1h = ta1h
        ? `RSI${Number(ta1h.rsi).toFixed(0)} MACD${ta1h.macdHist > 0 ? "+" : ""}${Number(ta1h.macdHist).toFixed(1)} BB[${fmtK(ta1h.bollLower)}-${fmtK(ta1h.bollUpper)}] ATR${fmtK(ta1h.atr)} EMA${fmtK(ta1h.ema20)}`
        : "?";
      const t1d = ta1d ? `RSI${Number(ta1d.rsi).toFixed(0)} EMA${fmtK(ta1d.ema20)}` : "?";
      
      const sentimentStr = sentiment
        ? `F&G${sentiment.fearAndGreedValue}(${sentiment.fearAndGreedClassification}) L/S${sentiment.longShortRatio.toFixed(2)} FR${(sentiment.fundingRate * 100).toFixed(3)}% OI${fmtM(sentiment.openInterest)}`
        : "";
      
      return `${symbol}: $${ticker.lastPrice.toLocaleString()} ${ticker.change24hPercent >= 0 ? "+" : ""}${ticker.change24hPercent.toFixed(1)}% Vol:${volatility}% | 5m:${t5m} | 1h:${t1h} | 1d:${t1d}${sentimentStr ? ` | ${sentimentStr}` : ""}`;
    })
    .join("\n");

  const slTpFields = process.env.LLM_RISKPROFILE === "true"
    ? '"slPct": 4.5, "tpPct": 12.0,'
    : '"riskProfile": "normal",';

  const exampleFormat = `  "BTCUSDT": { "action": "buy", "strength": 0.8, "confidence": 0.9, ${slTpFields} "reason": "Strong RSI support on 1h and bullish MACD crossover." },
  "ETHUSDT": { "action": "hold", "strength": 0.0, "confidence": 0.5, "reason": "RSI neutral at 50, waiting for clear trend." }`;

  let positionsSection = "";
  if (activePositions.length > 0) {
    positionsSection = "\nActive Positions:\n" + activePositions
      .map(p => {
        const costBasis = p.entryPrice * p.size;
        const pnlPct = costBasis > 0 ? ((p.unrealizedPnL / costBasis) * 100).toFixed(2) : "0.00";
        return `- ${p.symbol}: Size ${p.size.toFixed(4)} | Entry $${p.entryPrice.toLocaleString()} | SL:${p.stopLossPct}% TP:${p.takeProfitPct}% | PnL $${p.unrealizedPnL.toFixed(2)} (${pnlPct}%)`;
      })
      .join("\n") + "\n";
  } else {
    positionsSection = "\n⚠ NO POSITIONS HELD — all symbols are fresh entry opportunities (buy) or skip (hold).\n";
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
    recentExitsSection = `\nRecent Auto-Exits (DO NOT treat as active):\n${lines}\n`;
  }

  return `You are a professional quantitative trader. Analyze these cryptocurrencies and provide a decision for EACH.

Market Data:
${lines}
${positionsSection}${recentExitsSection}
Rules:
- Provide a decision for EVERY symbol: buy, sell, hold, or modify_position
- If we hold a position (in Active Positions), you can buy/sell/hold/modify
- If we don't hold a position, only buy/hold are valid (no sell/modify_position)
- ANTI-HALLUCINATION: Never say "we hold" or "maintaining" unless the symbol is in Active Positions
- For "hold": strength=0.0, no slPct/tpPct
- For "modify_position": strength=0.0, provide slPct and tpPct
- For "sell": strength -0.1 to -1.0 (exit size %), no slPct/tpPct
- For "buy": strength 0.1 to 1.0, provide slPct and tpPct
- Confidence: 0-1
${process.env.LLM_RISKPROFILE === "true"
  ? `- For buy: decide slPct (1-50) and tpPct (1-100) based on volatility/conviction`
  : `- riskProfile for buy: "tight" (3%SL/9%TP) | "normal" (5%SL/10%TP) | "wide" (8%SL/16%TP)`}
- Keep reason under 40 words with specific indicator values
- Make confident calls — avoid defaulting to "hold" when signals are clear

Respond with ONLY valid JSON (no markdown, no comments):
{${exampleFormat}}`;
}
