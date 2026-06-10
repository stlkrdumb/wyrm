import type { Signal, TickerData, TradingDecision, Position, Trade } from "@/features/trading-agent/types";

export interface PortfolioSnapshot {
  timestamp: Date;
  initialCash: number;
  cash: number;
  equity: number;
  totalTrades: number;
  winRate: number;
  totalPnL: number;
}

export interface AgentState {
  status: "running" | "stopped" | "paused";
  lastCycleAt: Date | null;
  ticker: TickerData | null;
  decision: TradingDecision | null;
  executionReason: string;
  signals: Signal[];
  portfolio: PortfolioSnapshot;
  positions: Position[];
  trades: Trade[];
  startEquity: number;
  circuitBreakerTripped: boolean;
  circuitBreakerThresholdPct: number;
  peakEquity: number;
  llmProgress?: { text: string; tokensReceived: number } | null;
  modelName: string;
  watchlist: string[];
  equityHistory: Array<{ timestamp: Date; equity: number }>;
  logs: Array<{ timestamp: Date; level: "info" | "action" | "warning" | "error"; message: string }>;
}

export const config = {
  get initialCash(): number {
    return Number(process.env.SIM_INITIAL_CASH) || 1000;
  },
  tradingSymbols: (process.env.TRADING_SYMBOLS || "BTCUSDT").split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
  maxActivePositions: Number(process.env.MAX_ACTIVE_POSITIONS) || 3,
  get stopLossPct(): number {
    return Number(process.env.SIM_STOP_LOSS_PCT) || 5;
  },
  get takeProfitPct(): number {
    return Number(process.env.SIM_TAKE_PROFIT_PCT) || 10;
  },
  get orderSizePct(): number {
    return Number(process.env.SIM_ORDER_SIZE_PCT) || 0.05;
  },
  get feePct(): number {
    return Number(process.env.SIM_FEE_PCT) || 0.001;
  },
};

let tradeCounter = 0;

export function getTradeCounter(): number {
  return tradeCounter;
}

export function setTradeCounter(val: number): void {
  tradeCounter = val;
}

export function calculateWinRate(trades: Trade[]): number {
  const closed = trades.filter(t => t.pnl !== undefined && t.pnl !== null);
  if (closed.length === 0) return 0;
  const wins = closed.filter(t => t.pnl! > 0).length;
  return (wins / closed.length) * 100;
}
