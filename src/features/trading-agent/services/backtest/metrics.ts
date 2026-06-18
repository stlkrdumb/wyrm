import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";

export interface TradeRecord {
  timestamp: Date;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  pnl?: number;
}

export interface EquityPoint {
  timestamp: Date;
  equity: number;
}

/** Calculate all backtest performance metrics from the trade log and equity curve. */
export function calculateMetrics(
  initialEquity: number,
  finalEquity: number,
  trades: TradeRecord[],
  equityCurve: EquityPoint[]
): {
  totalReturn: number;
  maxDrawdown: number;
  totalTrades: number;
  winRate: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  wins: number;
  losses: number;
  maxConsecutiveLosses: number;
} {
  // Max drawdown
  let peak = initialEquity;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Win/Loss (only count sell trades for win rate as they realize PnL)
  const exitTrades = trades.filter(t => t.side === "sell");
  const winTrades = exitTrades.filter(t => t.pnl !== undefined && t.pnl > 0);
  const lossTrades = exitTrades.filter(t => t.pnl !== undefined && t.pnl < 0);
  const wins = winTrades.length;
  const losses = lossTrades.length;
  const winRate = exitTrades.length > 0 ? (wins / exitTrades.length) * 100 : 0;

  // Average win/loss
  const avgWin = winTrades.length > 0
    ? winTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / winTrades.length
    : 0;
  const avgLoss = lossTrades.length > 0
    ? Math.abs(lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / lossTrades.length)
    : 0;

  // Max consecutive losses
  let maxConsecutiveLosses = 0;
  let currentStreak = 0;
  for (const t of exitTrades) {
    if (t.pnl !== undefined && t.pnl < 0) {
      currentStreak++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
    } else if (t.pnl !== undefined && t.pnl > 0) {
      currentStreak = 0;
    }
  }

  // Sharpe ratio (annualized, using step returns)
  const returns = equityCurve.map((p, i) => {
    const prev = i === 0 ? initialEquity : equityCurve[i - 1].equity;
    return prev > 0 ? (p.equity - prev) / prev : 0;
  });
  const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1);
  const sharpeRatio = variance > 0
    ? Number(((avgReturn / Math.sqrt(variance)) * Math.sqrt(8760)).toFixed(2))
    : 0;

  return {
    totalReturn: Number((((finalEquity - initialEquity) / initialEquity) * 100).toFixed(2)),
    totalTrades: trades.length,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    winRate: Number(winRate.toFixed(2)),
    sharpeRatio,
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    wins,
    losses,
    maxConsecutiveLosses,
  };
}
