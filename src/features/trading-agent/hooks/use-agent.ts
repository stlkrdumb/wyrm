"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/shared/utils/api-fetch";
import { usePriceStream, type PriceTick } from "./use-price-stream";

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
  fee?: number;
}

export interface PositionData { symbol: string; side: "long" | "short"; size: number; entryPrice: number; unrealizedPnL: number; stopLossPct: number; takeProfitPct: number; }

export type WSConnectionStatus = "connecting" | "connected" | "reconnecting";

export interface AgentState {
  status: "running" | "stopped" | "paused";
  lastCycleAt: string | null;
  ticker: TickerData | null;
  tickers: MultiTickerState | null;
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
  logs: { timestamp: string; level: string; message: string }[];
  decisionSource: "llm" | "heuristic" | null;
  lastFetchAt: number;
  everConnected: boolean;
  sseConnected: boolean;
}

let lastKnownState: AgentState | null = null;

const POLL_MS_RUNNING = 3000;
const POLL_MS_STOPPED = 5000;

function mergePriceIntoState(prev: AgentState, prices: Map<string, PriceTick>): AgentState {
  if (prices.size === 0) return prev;

  let tickersChanged = false;
  const newTickers: MultiTickerState = { ...(prev.tickers || {}) };

  for (const [symbol, tick] of prices) {
    const existing = newTickers[symbol];
    const asTicker: TickerData = {
      symbol: tick.symbol,
      lastPrice: tick.lastPrice,
      high24h: tick.high24h,
      low24h: tick.low24h,
      volume24h: tick.volume24h,
      change24hPercent: tick.change24hPercent,
    };

    if (!existing || existing.lastPrice !== tick.lastPrice) {
      newTickers[symbol] = asTicker;
      tickersChanged = true;
    }
  }

  if (!tickersChanged && prev.positions.length === 0) {
    return { ...prev, tickers: newTickers };
  }

  let positionsChanged = false;
  const newPositions = prev.positions.map((p) => {
    const tick = prices.get(p.symbol);
    if (!tick || tick.lastPrice <= 0) return p;
    const newPnL = (tick.lastPrice - p.entryPrice) * p.size;
    if (Math.abs(newPnL - p.unrealizedPnL) < 0.001) return p;
    positionsChanged = true;
    return { ...p, unrealizedPnL: Math.round(newPnL * 100) / 100 };
  });

  if (positionsChanged) {
    const totalPosValue = newPositions.reduce((s, p) => s + p.size * p.entryPrice + p.unrealizedPnL, 0);
    const equity = prev.portfolio.cash + totalPosValue;
    const totalPnL = equity - (prev.portfolio.initialCash || 1000);
    return {
      ...prev,
      tickers: newTickers,
      positions: newPositions,
      portfolio: { ...prev.portfolio, equity, totalPnL },
    };
  }

  if (tickersChanged) {
    return { ...prev, tickers: newTickers };
  }

  return prev;
}

export function useAgent() {
  const { prices, connected: sseConnected } = usePriceStream();
  const pricesRef = useRef(prices);
  const sseConnectedRef = useRef(sseConnected);

  // Keep refs in sync via effects (lint rule: don't update refs during render)
  useEffect(() => { pricesRef.current = prices; }, [prices]);
  useEffect(() => { sseConnectedRef.current = sseConnected; }, [sseConnected]);

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
    logs: [],
    decisionSource: null,
    lastFetchAt: 0,
    everConnected: false,
    sseConnected: false,
  });

  const fetchState = useCallback(async () => {
    try {
      const res = await apiFetch("/api/agent/cycle");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setState((prev) => {
        const normalized: AgentState = {
          status: data.status,
          lastCycleAt: data.lastCycleAt || null,
          ticker: data.tickers?.BTCUSDT || data.ticker || null,
          tickers: data.tickers || null,
          wsStatus: data.wsStatus || "connecting",
          wsConnection: data.wsConnection || null,
          decision: data.decision || null,
          executionReason: data.executionReason || "",
          signals: data.signals || [],
          portfolio: data.portfolio || { cash: 1000, equity: 1000, initialCash: 1000, totalTrades: 0, winRate: 0, totalPnL: 0 },
          positions: data.positions || [],
          trades: data.trades || [],
          showHistory: prev.showHistory,
          showBacktest: prev.showBacktest,
          circuitBreakerTripped: !!data.circuitBreakerTripped,
          circuitBreakerThresholdPct: Number(data.circuitBreakerThresholdPct) || 5.0,
          peakEquity: Number(data.peakEquity) || 1000,
          llmProgress: data.llmProgress || null,
          modelName: data.modelName || "qwen3.6-plus",
          watchlist: data.watchlist || [],
          equityHistory: data.equityHistory || [],
          logs: data.logs || [],
          decisionSource: data.decisionSource || null,
          lastFetchAt: Date.now(),
          everConnected: prev.everConnected || (data.wsStatus === "connected"),
          sseConnected: sseConnectedRef.current,
        };

        const merged = mergePriceIntoState(normalized, pricesRef.current);
        merged.everConnected = normalized.everConnected;
        merged.sseConnected = sseConnectedRef.current;

        lastKnownState = merged;
        return merged;
      });
    } catch (err) {
      console.error("[Client] Fetch error:", err);
    }
  }, []);

  // Merge SSE price updates into state — use functional setState to avoid
  // committing an effect just to call setState (which the linter flags).
  // Instead, we derive the merged state reactively from the prices map.
  const mergedState = useMemo(() => mergePriceIntoState(state, prices), [state, prices]);

  // Keep sseConnected in sync — derived reactively, not via effect
  const finalState = useMemo(() => ({ ...mergedState, sseConnected }), [mergedState, sseConnected]);

  const runCycle = useCallback(async () => {
    try {
      await apiFetch("/api/agent/cycle", { method: "POST" });
      await fetchState();
    } catch (err) { console.error("[Client] Run cycle error:", err); }
  }, [fetchState]);

  const setAgentStatus = useCallback(async (status: "running" | "stopped" | "paused") => {
    try {
      const res = await apiFetch(`/api/agent/cycle?status=${status}`, { method: "PUT" });
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
      console.log(`[Client] Local state updated: ${prev.status} → ${status}`);
      return { ...prev, status };
    });

    await fetchState();
  }, [fetchState]);

  const resetBreaker = useCallback(async () => {
    try {
      const res = await apiFetch("/api/agent/breaker", {
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
      const res = await apiFetch("/api/agent/breaker", {
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

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    const interval = (finalState.status === "running" ? POLL_MS_RUNNING : POLL_MS_STOPPED);
    const id = setInterval(fetchState, interval);
    return () => { clearInterval(id); };
  }, [finalState.status, fetchState]);

  return {
    state: finalState,
    runCycle,
    setAgentStatus,
    resetBreaker,
    updateBreakerThreshold,
    refresh: fetchState,
    setShowHistory: (val: boolean) => setState(s => ({ ...s, showHistory: val })),
    setShowBacktest: (val: boolean) => setState(s => ({ ...s, showBacktest: val }))
  };
}