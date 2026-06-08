import type { PriceSnapshot } from "./price-store";
import type { Candlestick } from "../types";

/** ────────────────────── types ────────────────────── */

/** Bitget WS ticker — may use either full or abbreviated names depending on API version */
interface WSTickerRaw {
  instId?: string;
  instType?: string;
  lastPrice?: string;
  lastPr?: string;
  high24h?: string;
  low24h?: string;
  baseVol?: string;
  vol24h?: string;           // raw volume in base currency
  quoteVol?: string;
  volValue24h?: string;      // volume value in quote currency (USDT)
  priceRate?: string;
  changeUtc24h?: string;
  cap24hSwing?: string;
  ts?: string;
}

interface WSCandleRaw {
  instType: "SPOT";
  channel: string; // e.g. "candle1h"
  instId: string;
  data?: string[][]; // [[ts, o, h, l, c, vol], ...]
}

interface WSMsgSubscribeAck {
  event: "subscribe";
  arg: { instType?: string; channel: string; instId?: string };
}

interface WSMsgError {
  event?: "error";
  code?: number;
  msg: string;
}

type WSMessage = WSMsgSubscribeAck | WSMsgError | Record<string, unknown>;

/** ────────────────────── channel config ──────────── */

export interface WSSubscription {
  instType: "SPOT";
  channel: "ticker" | `candle${string}`; // e.g. "candle1h", "candle5m"
  instId: string;
}

/** ────────────────────── Price Store import (lazy) ─ */

import { priceStore } from "./price-store";
import type { PriceStore } from "./price-store";
import { proxyFetch } from "./proxy-client";
import { config } from "./agent-engine";

function getPriceStore(): PriceStore {
  return priceStore;
}

const PROXY_URL = process.env.BITGET_PROXY || "";

/** ────────────────────── WebSocket Service ───────── */

export class MarketWebSocketService {
  private ws: WebSocket | null = null;
  private subscriptions: WSSubscription[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30_000;
  private baseReconnectDelay = 1_000;
  private useProxyForRest = !!PROXY_URL;
  private wsFailed = false;

  /** Called by agent-engine to start subscription */
  async subscribe(channels: WSSubscription[]): Promise<void> {
    this.subscriptions = channels;
    console.log(`[WS] Subscribing to ${channels.length} channel(s):`, channels.map(c => `${c.instType}/${c.channel}/${c.instId}`).join(", "));

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      await this.connect();
    } else {
      this.sendSubscribe(channels);
    }
  }

  /** Called by agent-engine to stop / on shutdown */
  disconnect(): void {
    this.clearPingTimer();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      this.ws.onclose = null; // prevent auto-reconnect
      this.ws.close(1000, "manual shutdown");
      this.ws = null;
    }
  }

  /** Try connecting — direct first, REST fallback on failure */
  private async connect(): Promise<void> {
    console.log("[WS] Connecting to wss://ws.bitget.com/v2/ws/public...");

    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket("wss://ws.bitget.com/v2/ws/public");

        ws.onopen = () => {
          console.log("[WS] Connected ✓");
          this.reconnectAttempt = 0;
          this.ws = null; // Don't store — handle via event listeners
          this.ws = ws;
          if (this.subscriptions.length > 0) {
            this.sendSubscribe(this.subscriptions);
          }
          this.startPingTimer();
          resolve();
        };

        ws.onmessage = (event: MessageEvent) => {
          try {
            const data = event.data.toString("utf-8");
            this.handleMessage(data);
          } catch (err) {
            console.error("[WS] Message parse error:", err);
          }
        };

        ws.onerror = () => { /* close will handle it */ };

        ws.onclose = (event: CloseEvent) => {
          this.ws = null;
          this.clearPingTimer();
          if (event.code !== 1000) {
            this.scheduleReconnect();
          }
          reject(new Error(`WebSocket closed code=${event.code}`));
        };

        // Timeout on connect
        const timeout = setTimeout(() => {
          ws.close(4004, "timeout");
          reject(new Error("Direct WS connection timed out (10s)"));
        }, 10_000);
        ws.addEventListener("open", () => clearTimeout(timeout), { once: true });
      });
    } catch (err) {
      console.warn(`[WS] Direct connection failed — will fall back to REST polling:`, err instanceof Error ? err.message : String(err));

      // Final fallback: populate PriceStore via REST polling (which uses proxy)
      await this.fallbackToRest();
    }
  }

  /** Fallback: populate PriceStore via REST polling */
  private fallbackToRest(): Promise<void> {
    console.log("[WS] Starting REST ticker fallback...");

    const fetchAllTickers = async () => {
      try {
        const proxy = this.useProxyForRest;
        for (const symbol of config.tradingSymbols) {
          const resp = await proxyFetch<{
            code: string;
            msg: string;
            data: Array<Record<string, string>>;
          }>(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`);

          const ticker = resp.data.find((t) => t.symbol === symbol || t.instId === symbol);
          if (!ticker) continue;

          const lastPrice = Number(ticker.lastPrice ?? ticker.lastPr ?? ticker.close ?? "0");
          if (lastPrice <= 0) continue;

          const high24h = Number(ticker.high24h ?? ticker.high ?? "0");
          const low24h = Number(ticker.low24h ?? ticker.low ?? "0");
          const quoteVol = Number(ticker.volValue24h ?? ticker.quoteVolume ?? ticker.volumeValue24h ?? "0");
          const changePctRaw = Number(ticker.changeUtc24h ?? ticker.priceRate ?? ticker.changingPercent24h ?? "0");
          const tsNum = Number(ticker.ts ?? Date.now());

          const snapshot: PriceSnapshot = {
            symbol,
            lastPrice: Math.round(lastPrice * 100) / 100,
            high24h,
            low24h,
            baseVolume: 0,
            quoteVolume: quoteVol,
            changePercent: Number((changePctRaw * 100).toFixed(2)),
            updatedAt: new Date(tsNum),
          };

          getPriceStore().updateTicker(snapshot);
        }

        console.log(`[WS] REST fallback cached ${getPriceStore().getSymbolCount()} ticker(s)`);
      } catch (err) {
        console.warn("[WS] REST fetch error:", err instanceof Error ? err.message : String(err));
      }
    };

    // Fetch immediately, then poll every 30s to keep prices fresh
    fetchAllTickers();
    const interval = setInterval(fetchAllTickers, 30_000);

    return Promise.resolve();
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempt),
      this.maxReconnectDelay,
    );

    this.reconnectAttempt++;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error("[WS] Reconnect failed:", err.message);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private sendSubscribe(channels: WSSubscription[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = JSON.stringify({ op: "subscribe", args: channels });
    this.ws.send(msg);
    console.log("[WS] Subscribe:", channels.map(c => `${c.channel}/${c.instId}`).join(", "));
  }

  private handleMessage(data: string): void {
    // Handle plain strings (server ping/pong are sent as bare text)
    if (data === "ping") {
      this.sendPong();
      return;
    }
    if (data === "pong") {
      console.log("[WS] Server pong ✓");
      this.reconnectAttempt = 0;
      return;
    }

    let msg: WSMessage;
    try {
      msg = JSON.parse(data) as WSMessage;
    } catch {
      console.warn("[WS] Invalid JSON:", data.slice(0, 200));
      return;
    }

    // Check for pong (response to our ping)
    if ("pong" in msg) {
      console.log("[WS] Pong received ✓");
      this.reconnectAttempt = 0;
      return;
    }

    // Error event
    if (("event" in msg && msg.event === "error") || "code" in msg) {
      const err = msg as WSMsgError;
      console.warn(`[WS] Server error: code=${err.code}, msg="${err.msg}"`);
      return;
    }

    // Subscribe acknowledgment
    if ("event" in msg && msg.event === "subscribe") {
      const ack = msg as WSMsgSubscribeAck;
      console.log("[WS] Subscribed:", `${ack.arg.channel}/${ack.arg.instId ?? "*"}`);
      return;
    }

    // Ticker data — action: "snapshot" or "incremental"
    if ("action" in msg && "data" in msg && "arg" in msg) {
      const typed = msg as Record<string, unknown>;
      const arg = typed.arg as { channel?: string; instId?: string };
      const dataArr = typed.data as WSTickerRaw[] | undefined;

      if (dataArr && Array.isArray(dataArr) && arg?.channel === "ticker") {
        for (const raw of dataArr) {
          this.handleTicker(raw);
        }
      } else if (arg?.channel?.startsWith("candle")) {
        this.handleCandle(typed);
      }
      return;
    }

    // Subscribe ack with "event" instead of "action"
    if (("event" in msg && msg.event === "subscribe") || ("arg" in msg && "data" in msg)) {
      const typed = msg as Record<string, unknown>;
      const arg = typed.arg as { channel?: string; instId?: string };
      const dataArr = typed.data as WSTickerRaw[] | undefined;

      if (dataArr && Array.isArray(dataArr) && arg?.channel === "ticker") {
        for (const raw of dataArr) {
          this.handleTicker(raw);
        }
      } else if (arg?.channel?.startsWith("candle")) {
        this.handleCandle(typed);
      }
    }
  }

  private handleTicker(raw: WSTickerRaw): void {
    try {
      const store = getPriceStore();

      // Flexible field resolution — Bitget WS may use different naming conventions
      const instId = raw.instId ?? "";
      const lastPrice = Number(raw.lastPrice ?? raw.lastPr ?? "0");
      const high24h = Number(raw.high24h ?? "0");
      const low24h = Number(raw.low24h ?? "0");
      const baseVol = Number(raw.baseVol ?? raw.vol24h ?? "0");
      const quoteVol = Number(raw.volValue24h ?? raw.quoteVol ?? "0");

      // Change percentage: try multiple field names
      let changePct = 0;
      if (raw.priceRate) {
        changePct = Number(raw.priceRate) * 100;
      } else if (raw.changeUtc24h) {
        changePct = Number(raw.changeUtc24h) * 100;
      } else if (raw.cap24hSwing) {
        changePct = Number(raw.cap24hSwing) * 100;
      }

      // Timestamp: try multiple formats
      let ts = Date.now();
      if (raw.ts) {
        const parsed = Number(raw.ts);
        ts = parsed > 1e12 ? parsed : parsed * 1000;
      }

      // Only update store if price is valid (> 0)
      if (lastPrice > 0) {
        const snapshot: PriceSnapshot = {
          symbol: instId,
          lastPrice,
          high24h,
          low24h,
          baseVolume: baseVol,
          quoteVolume: quoteVol,
          changePercent: changePct,
          updatedAt: new Date(ts),
        };
        store.updateTicker(snapshot);
      }
    } catch (err) {
      const instId = raw.instId ?? "unknown";
      console.error(`[WS] Ticker parse error for ${instId}:`, err);
    }
  }

  private handleCandle(msg: Record<string, unknown>): void {
    const arg = msg.arg as { instType?: string; channel: string; instId?: string };
    const dataArr = msg.data as WSCandleRaw["data"];

    if (!arg?.channel || !dataArr || dataArr.length === 0) return;

    const symbol = arg.instId ?? "UNKNOWN";
    const interval = arg.channel.replace(/^candle/, ""); // "1h", "5m" → "1h", "5m"
    const store = getPriceStore();

    for (const row of dataArr) {
      if (row.length < 6) continue;
      const candle: Candlestick = {
        timestamp: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      };
      store.updateCandle(symbol, interval, candle);
    }
  }

  private startPingTimer(): void {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendPong();
      } else {
        this.clearPingTimer();
      }
    }, 30_000);
  }

  private sendPong(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send("ping");
    }
  }

  private clearPingTimer(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  /** Exposed for external consumers who need the store instance */
  getPriceStore(): PriceStore {
    return priceStore;
  }
}

// ─────────────── singleton export ───────────────────

export const marketWS = new MarketWebSocketService();
