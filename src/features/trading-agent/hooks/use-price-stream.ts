"use client";

import { useEffect, useRef, useState } from "react";

export interface PriceTick {
  symbol: string;
  lastPrice: number;
  change24hPercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

export interface PriceStreamState {
  prices: Map<string, PriceTick>;
  connected: boolean;
}

const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15_000, 30_000];
const STALE_THRESHOLD_MS = 10_000;

function createEventSource(): EventSource {
  const token = process.env.NEXT_PUBLIC_AUTH_TOKEN ?? "";
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
  
  let path = "/api/agent/stream";
  if (token) {
    path += `?token=${encodeURIComponent(token)}`;
  }
  
  const targetUrl = backendUrl 
    ? `${backendUrl.replace(/\/$/, "")}${path}` 
    : path;

  return new EventSource(targetUrl);
}

export function usePriceStream(): PriceStreamState {
  const [prices, setPrices] = useState<Map<string, PriceTick>>(new Map());
  const [connected, setConnected] = useState(false);
  const reconnectAttempt = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventAt = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handlePriceEvent(e: Event) {
    try {
      const data: PriceTick = JSON.parse((e as MessageEvent).data);
      lastEventAt.current = Date.now();
      setPrices((prev) => {
        const next = new Map(prev);
        next.set(data.symbol, data);
        return next;
      });
    } catch (err) {
      console.warn("[SSE] Failed to parse price event:", err);
    }
  }

  function connect() {
    if (!mountedRef.current) return;

    const es = createEventSource();
    esRef.current = es;

    es.addEventListener("hello", () => {
      reconnectAttempt.current = 0;
      lastEventAt.current = Date.now();
      setConnected(true);
    });

    es.addEventListener("ping", () => {
      lastEventAt.current = Date.now();
    });

    es.addEventListener("price", handlePriceEvent);

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      if (!mountedRef.current) return;
      const delay = RECONNECT_BACKOFF_MS[Math.min(reconnectAttempt.current, RECONNECT_BACKOFF_MS.length - 1)];
      reconnectAttempt.current++;
      connectTimerRef.current = setTimeout(() => {
        connectTimerRef.current = null;
        connect();
      }, delay);
    };
  }

  useEffect(() => {
    mountedRef.current = true;
    connect();

    staleCheckRef.current = setInterval(() => {
      if (lastEventAt.current === null) return;
      const isStale = Date.now() - lastEventAt.current > STALE_THRESHOLD_MS;
      if (isStale) setConnected(false);
    }, 2000);

    return () => {
      mountedRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (staleCheckRef.current) {
        clearInterval(staleCheckRef.current);
        staleCheckRef.current = null;
      }
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current);
        connectTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { prices, connected };
}