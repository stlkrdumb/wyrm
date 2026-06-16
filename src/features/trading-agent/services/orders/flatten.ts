/**
 * Flatten positions — liquidates all open positions at current market prices.
 * Used for emergency shutdown or portfolio reset.
 */
import type { AgentState } from "../state-store";
import type { TickerData } from "@/features/trading-agent/types";
import { getTradeCounter, setTradeCounter, config, calculateWinRate } from "../state-store";
import { getLivePrice } from "../price-fetcher.service";
import { saveBalanceState } from "../balance-store";

export async function flattenPositions(state: AgentState): Promise<{ closed: number; totalPnlRealized: number }> {
  const positionsToClose = state.positions.filter(p => p.size > 0);
  if (positionsToClose.length === 0) {
    return { closed: 0, totalPnlRealized: 0 };
  }

  const uniqueSymbols = [...new Set(positionsToClose.map(p => p.symbol))];
  const prices: Map<string, TickerData> = new Map();

  for (const symbol of uniqueSymbols) {
    try {
      const ticker = await getLivePrice(symbol);
      if (ticker && ticker.lastPrice > 0) prices.set(symbol, ticker);
    } catch (err) {
      console.warn(`[Agent] Could not fetch ${symbol} for flatten:`, err instanceof Error ? err.message : String(err));
    }
  }

  if (prices.size === 0) {
    console.warn("[Agent] Cannot flatten — no price data available, keeping positions");
    return { closed: 0, totalPnlRealized: 0 };
  }

  let totalPnlRealized = 0;
  let closedCount = 0;
  const closedSymbols = new Set<string>();

  for (const pos of positionsToClose) {
    const ticker = prices.get(pos.symbol);
    if (!ticker) {
      console.warn(`[Agent] Flatten: skipping ${pos.symbol} — no price data`);
      continue;
    }

    const price = ticker.lastPrice;
    const revenue = price * pos.size;
    const fee = revenue * config.feePct;
    const pnl = (price - pos.entryPrice) * pos.size - fee;

    const counter = getTradeCounter() + 1;
    setTradeCounter(counter);
    state.trades.push({
      id: `T${counter}`, timestamp: new Date(), symbol: pos.symbol,
      side: "sell", action: "exit", size: pos.size, price, pnl, fee,
    });
    totalPnlRealized += pnl;
    state.portfolio.cash += revenue - fee;
    closedCount++;
    closedSymbols.add(pos.symbol);
  }

  state.positions = state.positions.filter(p => !closedSymbols.has(p.symbol));

  let remainingPosVal = 0;
  for (const p of state.positions) {
    const symTicker = prices.get(p.symbol);
    remainingPosVal += p.size * (symTicker?.lastPrice ?? p.entryPrice);
  }

  state.portfolio = {
    ...state.portfolio,
    timestamp: new Date(),
    equity: state.portfolio.cash + remainingPosVal,
    totalPnL: state.portfolio.cash + remainingPosVal - state.startEquity,
    winRate: calculateWinRate(state.trades),
  };

  if (state.peakEquity < state.portfolio.equity) state.peakEquity = state.portfolio.equity;

  saveBalanceState({
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: state.portfolio.cash,
    accumulatedRealizedPnL: totalPnlRealized,
    positions: state.positions.map(p => ({
      symbol: p.symbol, side: p.side as "long" | "short", size: p.size,
      entryPrice: p.entryPrice, stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct,
    })),
    totalTrades: state.portfolio.totalTrades,
    winRate: state.portfolio.winRate,
    circuitBreakerTripped: state.circuitBreakerTripped,
    circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
    peakEquity: state.peakEquity,
    tradeCounter: getTradeCounter(),
  });

  console.log(`[Agent] Flattened ${closedCount}/${positionsToClose.length} position(s) — realized $${totalPnlRealized.toFixed(2)}`);
  return { closed: closedCount, totalPnlRealized };
}
