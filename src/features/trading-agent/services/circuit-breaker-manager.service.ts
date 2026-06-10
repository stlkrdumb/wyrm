import { config } from "./state-store";
import type { AgentState } from "@/features/trading-agent/services/state-store";
import { saveBalanceState, type PortfolioState } from "./balance-store";

function buildSavePayload(state: AgentState): PortfolioState {
  const savedPositions: Array<{ symbol: string; side: "long" | "short"; size: number; entryPrice: number }> = 
    state.positions.map(p => ({ symbol: p.symbol, side: p.side as "long" | "short", size: p.size, entryPrice: p.entryPrice }));
  return {
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: state.portfolio.cash,
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: savedPositions,
    totalTrades: state.portfolio.totalTrades,
    winRate: state.portfolio.winRate,
    circuitBreakerTripped: false,
    circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
    peakEquity: state.peakEquity,
  };
}

export function checkCircuitBreaker(state: AgentState): void {
  if (state.circuitBreakerTripped) return;

  const currentEquity = state.portfolio.equity;
  if (currentEquity > state.peakEquity) {
    state.peakEquity = currentEquity;
  }

  const drawdownPct = state.peakEquity > 0 
    ? ((state.peakEquity - currentEquity) / state.peakEquity) * 100 
    : 0;

  if (drawdownPct >= state.circuitBreakerThresholdPct) {
    state.circuitBreakerTripped = true;
    state.status = "stopped";
    state.executionReason = `BREAKER TRIPPED: Drawdown of ${drawdownPct.toFixed(2)}% exceeded limit of ${state.circuitBreakerThresholdPct}%`;
    console.warn(`[Agent] [CIRCUIT BREAKER] DRAWDOWN EXCEEDED LIMIT! Tripping circuit breaker and emergency flattening all positions.`);

    // Note: flattenPositions is called externally by the lifecycle service
    saveBalanceState(buildSavePayload(state));
  }
}

export function resetCircuitBreaker(state: AgentState): void {
  state.circuitBreakerTripped = false;
  state.peakEquity = state.portfolio.equity;
  state.executionReason = "Circuit Breaker reset manually.";
  console.log(`[Agent] Circuit Breaker reset. Peak equity set to $${state.peakEquity.toFixed(2)}.`);
  
  saveBalanceState(buildSavePayload(state));
}

export function updateCircuitBreakerThreshold(state: AgentState, thresholdPct: number): void {
  state.circuitBreakerThresholdPct = thresholdPct;
  console.log(`[Agent] Circuit Breaker threshold updated to ${thresholdPct}%.`);
  
  saveBalanceState(buildSavePayload(state));
}
