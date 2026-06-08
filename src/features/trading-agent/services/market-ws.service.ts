import type { PriceSnapshot } from "./price-store";
import type { Candlestick } from "../types";

/** ────────────────────── types ────────────────────── */

interface WSTickerRaw {
  instId: string;
  lastPr: string;
  high24h: string;
  low24h: string;
  baseVol: string;
  quoteVol: string;
  priceRate: string;
  ts: string;
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

// Use singleton from price-store.ts — no need for a second instance
import { priceStore } from "./price-store";
import type { PriceStore } from "./price-store";

// Returns the singleton instance for direct use in handleTicker/handleCandle
function getPriceStore(): PriceStore {
  return priceStore;
}

/** ────────────────────── WebSocket Service ───────── */

export class MarketWebSocketService {
  private ws: WebSocket | null = null;
  private subscriptions: WSSubscription[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30_000;
  private baseReconnectDelay = 1_000;

  readonly wsUrl = "wss://ws.bitget.com/v2/ws/public";

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

  private async connect(): Promise<void> {
    console.log("[WS] Connecting to", this.wsUrl);
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.wsUrl);

        ws.onopen = () => {
          console.log("[WS] Connected ✓");
          this.reconnectAttempt = 0;
          this.ws = ws;
          if (this.subscriptions.length > 0) {
            this.sendSubscribe(this.subscriptions);
          }
          this.startPingTimer();
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            this.handleMessage(event.data);
          } catch (err) {
            console.error("[WS] Message parse error:", err);
          }
        };

        ws.onerror = (error) => {
          console.warn("[WS] Error:", error.type || "unknown");
        };

        ws.onclose = (event) => {
          console.log(`[WS] Closed — code: ${event.code}, reason: "${event.reason}"`);
          this.ws = null;
          this.clearPingTimer();
          // Auto-reconnect unless manually closed
          if (event.code !== 1000) {
            this.scheduleReconnect();
          }
        };

        // Timeout on connect
        const timeout = setTimeout(() => {
          ws.close(4000, "connect timeout");
          reject(new Error("WebSocket connect timed out"));
        }, 10_000);
        ws.addEventListener("open", () => clearTimeout(timeout), { once: true });
      } catch (err) {
        reject(err);
      }
    });
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectTimer) return; // already scheduled

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
        this.scheduleReconnect(); // exponential backoff chain
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
    // Handle plain "ping" — server may also send ping as a JSON message
    if (data === "ping") {
      this.sendPong();
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
    if ("event" in msg && msg.event === "error" || "code" in msg) {
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
        // Candle update
        this.handleCandle(typed);
      }
      return;
    }

    // Subscribe ack with "event" instead of "action"
    if ("event" in msg && msg.event === "subscribe" || "arg" in msg && "data" in msg) {
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
      const snapshot: PriceSnapshot = {
        symbol: raw.instId,
        lastPrice: Number(raw.lastPr) || 0,
        high24h: Number(raw.high24h) || 0,
        low24h: Number(raw.low24h) || 0,
        baseVolume: Number(raw.baseVol) || 0,
        quoteVolume: Number(raw.quoteVol) || 0,
        changePercent: (Number(raw.priceRate) * 100) || 0,
        updatedAt: new Date(Number(raw.ts)),
      };
      store.updateTicker(snapshot);
    } catch (err) {
      console.error(`[WS] Ticker parse error for ${raw.instId}:`, err);
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
        this.sendPong(); // "ping" is a plain string to the server
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
