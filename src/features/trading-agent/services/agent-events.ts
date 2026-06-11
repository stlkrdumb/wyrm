import { EventEmitter } from "node:events";

export interface EquityEvent {
  equity: number;
  cash: number;
  totalPnL: number;
  drawdown: number;
  timestamp: number;
}

export interface PositionEvent {
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  unrealizedPnL: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  pnlPct: number;
  timestamp: number;
}

export interface PositionClosedEvent {
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  closePrice: number;
  realizedPnL: number;
  reason: "auto-bracket-sl" | "auto-bracket-tp" | "manual-sell" | "agent-stop" | "unknown";
  timestamp: number;
}

export interface PriceEvent {
  symbol: string;
  lastPrice: number;
  change24hPercent: number;
  volume24h: number;
  timestamp: number;
}

export interface TradeEvent {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  action: "entry" | "exit" | "add" | "reduce";
  size: number;
  price: number;
  pnl?: number;
  fee?: number;
  timestamp: number;
}

class AgentEvents extends EventEmitter {
  emitEquity(payload: EquityEvent): void {
    this.emit("equity", payload);
  }
  emitPosition(payload: PositionEvent): void {
    this.emit("position", payload);
  }
  emitPositionClosed(payload: PositionClosedEvent): void {
    this.emit("position_closed", payload);
  }
  emitPrice(payload: PriceEvent): void {
    this.emit("price", payload);
  }
  emitTrade(payload: TradeEvent): void {
    this.emit("trade", payload);
  }
}

export const agentEvents = new AgentEvents();
agentEvents.setMaxListeners(100);
