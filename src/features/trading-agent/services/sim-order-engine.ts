import { randomUUID } from "crypto";
import type {
  Position,
  TradeRecord,
  PortfolioSnapshot,
  SimExecutionResult,
  EquitySnapshot,
  Signal,
  BacktestReport,
} from "../types";

interface SimEngineConfig {
  initialCash: number;
  maxPositionSizePercent: number;
  maxDrawdownPercent: number;
  dailyTradeLimit: number;
}

interface TradeResult {
  success: boolean;
  reason?: string;
  trade?: TradeRecord;
}

export class SimOrderEngine {
  private cash: number;
  private positions: Map<string, Position>;
  private trades: TradeRecord[];
  private equityCurve: EquitySnapshot[];
  private dayTrades: number;
  private lastTradeDate: string | null;
  private config: SimEngineConfig;

  constructor(config: SimEngineConfig) {
    this.config = config;
    this.cash = config.initialCash;
    this.positions = new Map();
    this.trades = [];
    this.equityCurve = [{ timestamp: new Date(), equity: config.initialCash, cash: config.initialCash }];
    this.dayTrades = 0;
    this.lastTradeDate = null;
  }

  // ---- Core execution ----

  placeOrder(order: {
    symbol: string;
    side: "buy" | "sell";
    size: number;
    price?: number;
    lastPrice?: number;
    reason: string;
    signals: Signal[];
  }): TradeResult {
    if (!this.passDailyLimitCheck()) {
      return { success: false, reason: "Daily trade limit reached" };
    }

    const fillPrice = order.price ?? order.lastPrice;
    if (fillPrice == null) {
      return { success: false, reason: "No price available for execution" };
    }

    const cost = fillPrice * order.size;

    // Validate risk rules before executing
    if (order.side === "buy") {
      if (cost > this.cash) {
        return { success: false, reason: "Insufficient cash" };
      }
      if (!this.passPositionSizeLimit(order.symbol, cost)) {
        return { success: false, reason: "Exceeds max position size" };
      }
    }

    // Execute the trade
    const trade: TradeRecord = {
      id: randomUUID(),
      timestamp: new Date(),
      symbol: order.symbol,
      side: order.side,
      orderType: order.price ? "limit" : "market",
      price: fillPrice,
      size: order.size,
      executedPrice: fillPrice,
      filled: true,
      reason: order.reason,
      signals: order.signals,
    };

    this.trades.push(trade);
    this.updatePosition(order.symbol, order.side, order.size, fillPrice);
    this.recordEquitySnapshot();
    this.dayTrades++;

    return { success: true, trade };
  }

  // ---- Risk checks ----

  private passDailyLimitCheck(): boolean {
    const today = new Date().toDateString();
    if (this.lastTradeDate !== today) {
      this.dayTrades = 0;
      this.lastTradeDate = today;
    }
    return this.dayTrades < this.config.dailyTradeLimit;
  }

  private passPositionSizeLimit(symbol: string, cost: number): boolean {
    const totalEquity = this.cash + this.getTotalPositionValue();
    const maxAllowed = totalEquity * (this.config.maxPositionSizePercent / 100);
    return cost <= maxAllowed;
  }

  getDrawdown(): number {
    if (this.equityCurve.length === 0) return 0;
    const peak = Math.max(...this.equityCurve.map((s) => s.equity));
    const current = this.equityCurve[this.equityCurve.length - 1].equity;
    return peak > 0 ? ((peak - current) / peak) * 100 : 0;
  }

  // ---- State queries ----

  getPortfolioSnapshot(currentPrice?: number): PortfolioSnapshot {
    const positions = Array.from(this.positions.values());
    const totalPnL = this.calculateTotalPnL();
    const equity = this.cash + this.getTotalPositionValue();

    const wins = this.trades.filter((t) => t.side === "buy").length;
    const losses = this.trades.filter((t) => t.side === "sell").length;
    const totalClosed = wins + losses;

    return {
      timestamp: new Date(),
      initialCash: this.config.initialCash,
      cash: this.cash,
      equity,
      positions,
      totalTrades: this.trades.length,
      winRate: totalClosed > 0 ? (wins / totalClosed) * 100 : 0,
      totalPnL,
    };
  }

  getEquityCurve(): EquitySnapshot[] {
    return [...this.equityCurve];
  }

  getTrades(): TradeRecord[] {
    return [...this.trades];
  }

  // ---- Backtesting ----

  generateBacktestReport(
    equityData: Array<{ timestamp: Date; cash: number; positions: Position[] }>
  ): BacktestReport {
    const initialEquity = this.config.initialCash;
    const finalEquity = equityData[equityData.length - 1]?.cash ?? initialEquity;

    const returns = equityData.map((e) => e.cash / (e.cash > 0 ? initialEquity : 1));
    const totalReturn = ((finalEquity - initialEquity) / initialEquity) * 100;

    // Max drawdown calculation
    let peak = 0;
    let maxDD = 0;
    for (const e of equityData) {
      if (e.cash > peak) peak = e.cash;
      const dd = peak > 0 ? ((peak - e.cash) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }

    // Sharpe ratio (simplified — assumes risk-free rate of 0)
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const sharpe = variance > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(365) : 0;

    const wins = this.trades.filter((t) => t.side === "buy").length;
    const losses = this.trades.filter((t) => t.side === "sell").length;

    return {
      startDate: equityData[0]?.timestamp ?? new Date(),
      endDate: equityData[equityData.length - 1]?.timestamp ?? new Date(),
      initialEquity,
      finalEquity,
      totalReturn,
      maxDrawdown: maxDD,
      winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
      totalTrades: this.trades.length,
      sharpeRatio: Number(sharpe.toFixed(2)),
      equityCurve: equityData.map((e) => ({
        timestamp: e.timestamp,
        equity: e.cash,
        cash: e.cash,
      })),
      trades: this.trades,
    };
  }

  // ---- Private helpers ----

  private updatePosition(symbol: string, side: "buy" | "sell", size: number, price: number): void {
    const existing = this.positions.get(symbol);
    if (side === "buy") {
      if (!existing) {
        this.positions.set(symbol, { symbol, side: "long", size, entryPrice: price, unrealizedPnL: 0 });
        this.cash -= price * size;
      } else {
        // Average up
        const totalSize = existing.size + size;
        const avgPrice = (existing.entryPrice * existing.size + price * size) / totalSize;
        this.positions.set(symbol, { ...existing, size: totalSize, entryPrice: avgPrice });
        this.cash -= price * size;
      }
    } else if (side === "sell") {
      if (!existing || existing.size < size) {
        // Short sell or full close + short
        this.positions.set(symbol, { symbol, side: "short", size, entryPrice: price, unrealizedPnL: 0 });
        this.cash += price * size;
      } else {
        this.positions.set(symbol, { ...existing, size: existing.size - size });
        this.cash += price * size;
      }

      // Close full position
      if (this.positions.get(symbol)?.size === 0) {
        this.positions.delete(symbol);
      }
    }
  }

  private getTotalPositionValue(currentPrice?: number): number {
    return Array.from(this.positions.values()).reduce((sum, p) => {
      const value = currentPrice ? p.size * currentPrice : p.size * p.entryPrice;
      return sum + value;
    }, 0);
  }

  private calculateTotalPnL(): number {
    // Total PnL = current equity - initial cash
    const totalPositionValue = this.getTotalPositionValue();
    const equity = this.cash + totalPositionValue;
    return equity - this.config.initialCash;
  }

  private recordEquitySnapshot(): void {
    this.equityCurve.push({
      timestamp: new Date(),
      equity: this.cash + this.getTotalPositionValue(),
      cash: this.cash,
    });
  }
}
