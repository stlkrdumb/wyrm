"use client";

import { useMemo, useRef } from "react";
import type { AgentState } from "./use-agent";

type Selector<T> = (state: AgentState) => T;

/**
 * Creates a stable selector function that only triggers re-renders
 * when the selected value actually changes.
 */
export function useAgentSelector<T>(state: AgentState, selector: Selector<T>): T {
  const prevValueRef = useRef<T | null>(null);
  const prevDepsRef = useRef<unknown[]>([]);
  
  return useMemo(() => {
    const newValue = selector(state);
    
    // Shallow compare objects/arrays
    if (prevValueRef.current !== null) {
      if (typeof newValue === 'object' && newValue !== null) {
        // For objects and arrays, do shallow equality check
        if (Array.isArray(newValue) && Array.isArray(prevValueRef.current)) {
          if (newValue.length === prevValueRef.current.length) {
            let same = true;
            for (let i = 0; i < newValue.length; i++) {
              if (newValue[i] !== (prevValueRef.current as unknown[])[i]) {
                same = false;
                break;
              }
            }
            if (same) return prevValueRef.current as T;
          }
        } else if (!Array.isArray(newValue) && !Array.isArray(prevValueRef.current)) {
          // For plain objects, compare JSON strings
          if (JSON.stringify(newValue) === JSON.stringify(prevValueRef.current)) {
            return prevValueRef.current as T;
          }
        }
      } else if (newValue === prevValueRef.current) {
        return prevValueRef.current as T;
      }
    }
    
    prevValueRef.current = newValue;
    return newValue;
  }, [state, selector]);
}

/**
 * Individual selectors for specific state slices
 * These are defined outside the component to maintain referential equality
 */
export const selectors = {
  status: (s: AgentState) => s.status,
  modelName: (s: AgentState) => s.modelName,
  lastFetchAt: (s: AgentState) => s.lastFetchAt,
  wsStatus: (s: AgentState) => s.wsStatus,
  wsConnection: (s: AgentState) => s.wsConnection,
  sseConnected: (s: AgentState) => s.sseConnected,
  circuitBreakerTripped: (s: AgentState) => s.circuitBreakerTripped,
  circuitBreakerThresholdPct: (s: AgentState) => s.circuitBreakerThresholdPct,
  peakEquity: (s: AgentState) => s.peakEquity,
  llmProgress: (s: AgentState) => s.llmProgress,
  decisionSource: (s: AgentState) => s.decisionSource,
  
  // Computed selectors
  tickers: (s: AgentState) => s.tickers,
  watchlist: (s: AgentState) => s.watchlist,
  ticker: (s: AgentState) => s.ticker,
  
  // Price-sensitive (changes frequently)
  tickersRef: (s: AgentState) => s.tickers,
  portfolio: (s: AgentState) => s.portfolio,
  positions: (s: AgentState) => s.positions,
  trades: (s: AgentState) => s.trades,
  equityHistory: (s: AgentState) => s.equityHistory,
  
  // Decision-related (changes moderately)
  signals: (s: AgentState) => s.signals,
  decision: (s: AgentState) => s.decision,
  executionReason: (s: AgentState) => s.executionReason,
  
  // Logging (changes frequently)
  logs: (s: AgentState) => s.logs,
  lastCycleAt: (s: AgentState) => s.lastCycleAt,
} as const;
