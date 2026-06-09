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
  });

  // Stable fetch function — only recreates if URL changes
  const fetchState = useCallback(async () => {
    try {
      console.log(`[Client] Fetching state... (current local status: ${state.status})`);
      const res = await fetch("/api/agent/cycle");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log(`[Client] Got state — status=${data.status} tickers=${Object.keys(data.tickers || {}).join(",") || "(none)"}`);

      // Normalize multi-ticker response into state shape
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
      };

      lastKnownState = normalized;
      setState(normalized);
    } catch (err) {
      console.error("[Client] Fetch error:", err);
    }
  }, [state.status]);

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
      }
    } catch {}

    setState((prev) => {
      const next = { ...prev, status };
      console.log(`[Client] Local state updated: ${prev.status} → ${status}`);
      return next;
    });

    // After stopping, refresh state to show flattened positions and realized PnL
    if (status === "stopped") {
      await fetchState();
    }
  }, [fetchState]);

  // Load initialCash from server config on mount (fixes hardcoded default)
  useEffect(() => {
    if (lastKnownState?.portfolio?.initialCash) return;
    fetch("/api/agent/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg.initialCash) {
          setState((prev) => {
            const next = { ...prev, portfolio: { ...prev.portfolio, initialCash: cfg.initialCash, cash: cfg.initialCash, equity: cfg.initialCash } };
            lastKnownState = next;
            return next;
          });
        }
      })
      .catch(() => {});
  }, []);

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

  return { state, runCycle, setAgentStatus, refresh: fetchState, setShowHistory: (val: boolean) => setState(s => ({ ...s, showHistory: val })), setShowBacktest: (val: boolean) => setState(s => ({ ...s, showBacktest: val })) };
}
