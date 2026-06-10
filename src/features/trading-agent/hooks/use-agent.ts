"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface TickerData {
  symbol: string;
  lastPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24hPercent: number;
}

export interface MultiTickerState {
  [symbol: string]: TickerData | null;
}
export interface SignalData { name: string; source: string; direction: "bullish" | "bearish" | "neutral"; strength: number; }
export interface DecisionData { action: "buy" | "sell" | "hold"; strength: number; confidence: number; reason: string; }
export interface PortfolioData { cash: number; equity: number; initialCash: number; totalTrades: number; winRate: number; totalPnL: number; }
export interface TradeData {
  id: string;
  timestamp: string;
  symbol: string;
  side: "buy" | "sell";
  action: "entry" | "exit" | "add" | "reduce";
  size: number;
  price: number;
  pnl: number | null;
}

export interface PositionData { symbol: string; side: "long" | "short"; size: number; entryPrice: number; unrealizedPnL: number; }

export type WSConnectionStatus = "connecting" | "connected" | "reconnecting";

interface AgentState {
  status: "running" | "stopped" | "paused";
  lastCycleAt: string | null;
  ticker: TickerData | null;          // Primary display ticker (BTCUSDT)
  tickers: MultiTickerState | null;   // All active symbols
  wsStatus: WSConnectionStatus;
  wsConnection?: { type: "direct" | "proxy" | "fallback"; proxy: string | null } | null;
  decision: DecisionData | null;
  executionReason: string;
  signals: SignalData[];
  portfolio: PortfolioData;
  positions: PositionData[];
  trades: TradeData[];
  showHistory: boolean;
  showBacktest: boolean;
  circuitBreakerTripped: boolean;
  circuitBreakerThresholdPct: number;
  peakEquity: number;
  llmProgress?: { text: string; tokensReceived: number } | null;
  modelName: string;
  watchlist: string[];
  equityHistory: { timestamp: string; equity: number }[];
}

let lastKnownState: AgentState | null = null;
const POLL_MS = 3000;

export function useAgent() {
  const [state, setState] = useState<AgentState>(lastKnownState ?? {
    status: "stopped", lastCycleAt: null, ticker: null, tickers: null, wsStatus: "connecting",
    wsConnection: null, decision: null, executionReason: "",
    signals: [], portfolio: { cash: 1000, equity: 1000, initialCash: 1000, totalTrades: 0, winRate: 0, totalPnL: 0 }, positions: [], trades: [],
    showHistory: false,
    showBacktest: false,
    circuitBreakerTripped: false,
    circuitBreakerThresholdPct: 5.0,
    peakEquity: 1000,
    modelName: "qwen3.6-plus",
    watchlist: [],
    equityHistory: [],
  });

  // Stable fetch function — only recreates if URL changes
  const fetchState = useCallback(async () => {
    try {
      console.log(`[Client] Fetching state... (current local status: ${state.status})`);
      const res = await fetch("/api/agent/cycle");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log(`[Client] Got state — status=${data.status} tickers=${Object.keys(data.tickers || {}).join(",") || "(none)"}`);

      // Normalize response into state shape
      const normalized: AgentState = {
        status: data.status,
        lastCycleAt: data.lastCycleAt || null,
        ticker: data.tickers?.BTCUSDT || data.ticker || null,  // Primary display ticker
        tickers: data.tickers || null,
        wsStatus: data.wsStatus || "connecting",
        wsConnection: data.wsConnection || null,
        decision: data.decision || null,
        executionReason: data.executionReason || "",
        signals: data.signals || [],
        portfolio: data.portfolio || { cash: 1000, equity: 1000, initialCash: 1000, totalTrades: 0, winRate: 0, totalPnL: 0 },
        positions: data.positions || [],
        trades: data.trades || [],
        showHistory: state.showHistory,
        showBacktest: state.showBacktest,
        circuitBreakerTripped: !!data.circuitBreakerTripped,
        circuitBreakerThresholdPct: Number(data.circuitBreakerThresholdPct) || 5.0,
        peakEquity: Number(data.peakEquity) || 1000,
        llmProgress: data.llmProgress || null,
        modelName: data.modelName || "qwen3.6-plus",
        watchlist: data.watchlist || [],
        equityHistory: data.equityHistory || [],
      };

      lastKnownState = normalized;
      setState(normalized);
    } catch (err) {
      console.error("[Client] Fetch error:", err);
    }
  }, [state.status, state.showHistory, state.showBacktest]);

  const runCycle = useCallback(async () => {
    try {
      console.log(`[Client] Running agent cycle...`);
      await fetch("/api/agent/cycle", { method: "POST" });
      await fetchState(); // immediately get updated state
    } catch (err) { console.error("[Client] Run cycle error:", err); }
  }, [fetchState]);

  const setAgentStatus = useCallback(async (status: "running" | "stopped" | "paused") => {
    console.log(`[Client] Setting agent status to: ${status}`);
    // Persist to server first
    try {
      const res = await fetch(`/api/agent/cycle?status=${status}`, { method: "PUT" });
      if (res.ok && status === "stopped") {
        const data = await res.json();
        console.log(`[Client] Agent stopped — positions closed: ${data.closed}, realized PnL: ${data.realizedPnl}`);
      } else if (!res.ok) {
        const data = await res.json();
        alert(data.message || "Failed to update agent status");
      }
    } catch (err) {
      console.error("[Client] Set status error:", err);
    }

    setState((prev) => {
      const next = { ...prev, status };
      console.log(`[Client] Local state updated: ${prev.status} → ${status}`);
      return next;
    });

    // After stopping, refresh state to show flattened positions and realized PnL
    await fetchState();
  }, [fetchState]);

  const resetBreaker = useCallback(async () => {
    try {
      console.log(`[Client] Resetting circuit breaker...`);
      const res = await fetch("/api/agent/breaker", {
        method: "POST",
        body: JSON.stringify({ action: "reset" }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        await fetchState();
      } else {
        const data = await res.json();
        alert(data.message || "Failed to reset breaker");
      }
    } catch (err) {
      console.error("[Client] Reset breaker error:", err);
    }
  }, [fetchState]);

  const updateBreakerThreshold = useCallback(async (pct: number) => {
    try {
      console.log(`[Client] Updating circuit breaker threshold to: ${pct}%`);
      const res = await fetch("/api/agent/breaker", {
        method: "POST",
        body: JSON.stringify({ action: "updateThreshold", thresholdPct: pct }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        await fetchState();
      } else {
        const data = await res.json();
        alert(data.message || "Failed to update threshold");
      }
    } catch (err) {
      console.error("[Client] Update threshold error:", err);
    }
  }, [fetchState]);

  // Fetch initial state on mount to sync with persisted portfolio-state.json
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Polling effect — starts when running, stops otherwise
  useEffect(() => {
    if (state.status !== "running") {
      console.log("[Client] Status is not running, no polling");
      return;
    }
    console.log("[Client] Starting polling every", POLL_MS, "ms");
    const id = setInterval(fetchState, POLL_MS);
    fetchState(); // immediate poll
    return () => { clearInterval(id); console.log("[Client] Stopping polling"); };
  }, [state.status, fetchState]);

  return {
    state,
    runCycle,
    setAgentStatus,
    resetBreaker,
    updateBreakerThreshold,
    refresh: fetchState,
    setShowHistory: (val: boolean) => setState(s => ({ ...s, showHistory: val })),
    setShowBacktest: (val: boolean) => setState(s => ({ ...s, showBacktest: val }))
  };
}
