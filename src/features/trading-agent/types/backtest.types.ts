import type { TradingDecision } from "./signal.types";

/**
 * Represents a single snapshot of market data at a specific point in time.
 */
export interface HistoricalSnapshot {
  timestamp: Date;
  tickers: Record<string, {
    lastPrice: number;
    change24hPercent: number;
  }>;
}

/**
 * The result of a completed backtest run.
 */
export interface BacktestResult {
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  equityCurve: {
    timestamp: Date;
    equity: number;
  }[];
  trades: Array<{
    timestamp: Date;
    symbol: string;
    side: "buy" | "sell";
    price: number;
    pnl: number;
  }>;
}
