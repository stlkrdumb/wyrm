// Signal types from market analysis skills

export type SignalDirection = "bullish" | "bearish" | "neutral";
export type SignalSource = "technical" | "sentiment" | "macro" | "on-chain" | "news" | "llm" | "heuristic";
export type MarketRegime = "bull" | "bear" | "ranging" | "volatile";

export interface Signal {
  id: string;
  name: string;
  source: SignalSource;
  direction: SignalDirection;
  strength: number;      // 0-1
  timestamp: Date;
  details?: Record<string, unknown>;
}

export interface TechnicalAnalysisReport {
  indicators: IndicatorResult[];
  overallDirection: SignalDirection;
  confidence: number;    // 0-1
}

export interface IndicatorResult {
  name: string;
  category: string;
  value: number;
  signal: SignalDirection;
}

export interface SentimentScore {
  fearGreedyIndex: number;   // 0-100
  fundingRate: number;
  longShortRatio: number;
  direction: SignalDirection;
}

export interface Trade {
  id: string;
  timestamp: Date;
  symbol: string;
  side: "buy" | "sell";
  action: "entry" | "exit" | "add" | "reduce";
  size: number;
  price: number;
  pnl?: number;
  fee?: number;
}

export interface TradingDecision {
  action: "buy" | "sell" | "hold";
  strength: number;       // -1 (strong sell) to +1 (strong buy)
  confidence: number;     // 0-1
  reason: string;
  riskStatus?: "approved" | "blocked" | "adjusted";
  size?: number;
  riskProfile?: "tight" | "normal" | "wide";
  /** Direct stop-loss % (1-50) — only set when LLM_RISKPROFILE=true. Overrides RISK_PROFILES. */
  slPct?: number;
  /** Direct take-profit % (1-100) — only set when LLM_RISKPROFILE=true. Overrides RISK_PROFILES. */
  tpPct?: number;
}
