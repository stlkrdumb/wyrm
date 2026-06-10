// Portfolio and execution types for sim trading

import type { Signal } from "./signal.types";

export interface Position {
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  unrealizedPnL: number;
}

export interface TradeRecord {
  id: string;
  timestamp: Date;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  price: number;
  size: number;
  executedPrice: number;
  filled: boolean;
  reason: string;
  signals: Signal[];
}

export interface PortfolioSnapshot {
  timestamp: Date;
  initialCash: number;
  cash: number;
  equity: number;
  totalTrades: number;
  winRate: number;
  totalPnL: number;
}

export interface SimExecutionResult {
  success: boolean;
  reason?: string;
  trade?: TradeRecord;
}

export interface EquitySnapshot {
  timestamp: Date;
  equity: number;
  cash: number;
}

// Backtest report returned to dashboard
export interface BacktestReport {
  startDate: Date;
  endDate: Date;
  initialEquity: number;
  finalEquity: number;
  totalReturn: number;           // percentage
  maxDrawdown: number;           // percentage
  winRate: number;               // percentage
  totalTrades: number;
  sharpeRatio: number;
  equityCurve: EquitySnapshot[];
  trades: TradeRecord[];
}
