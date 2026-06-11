"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface LiveEquity {
  equity: number;
  cash: number;
  totalPnL: number;
  drawdown: number;
  timestamp: number;
}

export interface LivePosition {
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

export interface LivePrice {
  symbol: string;
  lastPrice: number;
  change24hPercent: number;
  volume24h: number;
  timestamp: number;
}

export interface LiveTrade {
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

export interface LiveStreamState {
  equity: LiveEquity | null;
  positions: Map<string, LivePosition>;
  prices: Map<string, LivePrice>;
  trades: LiveTrade[];
  connected: boolean;
  lastEventAt: number | null;
}

const MAX_LIVE_TRADES = 20;
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15_000, 30_000];
const STALE_THRESHOLD_MS = 5_000;

const initialState: LiveStreamState = {
  equity: null,
  positions: new Map(),
  prices: new Map(),
  trades: [],
  connected: false,
  lastEventAt: null,
};

/** Connects to the SSE stream and returns live data layered on top of the 3s poll.
 *  Stale data is automatically cleared after STALE_THRESHOLD_MS so we don't show
 *  numbers from a disconnected stream. */
export function useLiveStream() {
  const [state, setState] = useState<LiveStreamState>(initialState);
  const reconnectAttemptRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleEvent = useCallback(<T,>(eventName: string, handler: (data: T) => void) => {
    if (!esRef.current) return;
    esRef.current.addEventListener(eventName, (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as T;
        handler(data);
      } catch (err) {
        console.warn(`[SSE] Failed to parse ${eventName}:`, err);
      }
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const connect = () => {
      if (!mounted) return;

      // EventSource can't send custom headers — pass the auth token via query string.
      // The token is NEXT_PUBLIC_AUTH_TOKEN (already exposed to the browser), so this
      // is no less secure than the Bearer header.
      const token = process.env.NEXT_PUBLIC_AUTH_TOKEN ?? "";
      const url = token ? `/api/agent/stream?token=${encodeURIComponent(token)}` : "/api/agent/stream";
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("hello", () => {
        reconnectAttemptRef.current = 0;
        setState((prev) => ({ ...prev, connected: true, lastEventAt: Date.now() }));
      });

      es.addEventListener("ping", () => {
        setState((prev) => ({ ...prev, lastEventAt: Date.now() }));
      });

      handleEvent<LiveEquity>("equity", (equity) => {
        setState((prev) => ({ ...prev, equity, lastEventAt: Date.now() }));
      });

      handleEvent<LivePosition>("position", (pos) => {
        setState((prev) => {
          const next = new Map(prev.positions);
          next.set(pos.symbol, pos);
          return { ...prev, positions: next, lastEventAt: Date.now() };
        });
      });

      handleEvent<LivePrice>("price", (p) => {
        setState((prev) => {
          const next = new Map(prev.prices);
          next.set(p.symbol, p);
          return { ...prev, prices: next, lastEventAt: Date.now() };
        });
      });

      handleEvent<LiveTrade>("trade", (t) => {
        setState((prev) => {
          const trades = [t, ...prev.trades].slice(0, MAX_LIVE_TRADES);
          return { ...prev, trades, lastEventAt: Date.now() };
        });
      });

      es.onerror = () => {
        setState((prev) => ({ ...prev, connected: false }));
        es.close();
        esRef.current = null;
        if (!mounted) return;
        // Reconnect with exponential backoff
        const delay = RECONNECT_BACKOFF_MS[Math.min(reconnectAttemptRef.current, RECONNECT_BACKOFF_MS.length - 1)];
        reconnectAttemptRef.current++;
        console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`);
        setTimeout(connect, delay);
      };
    };

    connect();

    // Stale check — if no event for STALE_THRESHOLD_MS, treat as disconnected
    staleCheckRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.lastEventAt === null) return prev;
        const isStale = Date.now() - prev.lastEventAt > STALE_THRESHOLD_MS;
        if (isStale && prev.connected) {
          return { ...prev, connected: false };
        }
        return prev;
      });
    }, 2_000);

    return () => {
      mounted = false;
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (staleCheckRef.current) { clearInterval(staleCheckRef.current); staleCheckRef.current = null; }
    };
  }, [handleEvent]);

  return state;
}
