import { WebSocket as WSClient } from "ws";
import { getProxyAgentForWS, PROXIES, mask } from "../proxy-client";
import { HeartbeatManager } from "./heartbeat";

export interface WSSubscription {
  instType: "SPOT";
  channel: "ticker" | `candle${string}`;
  instId: string;
}

export class WebSocketConnection {
  private ws: WSClient | null = null;
  private proxyIndex = 0;
  private heartbeat = new HeartbeatManager();
  private onMessage: ((data: string) => void) | null = null;
  private onReconnect: (() => void) | null = null;

  /** Set callback for incoming messages (must be set before connect) */
  setMessageHandler(handler: (data: string) => void): void {
    this.onMessage = handler;
  }

  /** Set callback for reconnection scheduling (called on unexpected close) */
  setReconnectHandler(handler: () => void): void {
    this.onReconnect = handler;
  }

  async connect(): Promise<void> {
    console.log("[WS] Connecting to wss://ws.bitget.com/v2/ws/public...");

    try {
      await new Promise<void>((resolve, reject) => {
        const agent = getProxyAgentForWS(this.proxyIndex);
        const options: Record<string, any> = agent ? { agent } : {};

        if (process.env.WS_REJECT_UNAUTHORIZED === "false" || process.env.NODE_ENV === "development" || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
          options.rejectUnauthorized = false;
        }

        if (agent) {
          const proxyUrl = PROXIES[this.proxyIndex % PROXIES.length];
          console.log(`[WS] Routing through proxy: ${mask(proxyUrl)}`);
        }

        const ws = new WSClient("wss://ws.bitget.com/v2/ws/public", options);

        // Attach message handler BEFORE open so no messages are missed
        ws.on("message", (data) => {
          const msg = data.toString("utf-8");
          // Handle heartbeat frames immediately
          if (msg === "ping") {
            try { ws.send("pong"); } catch (err) { console.warn("[WS] Pong send failed:", err instanceof Error ? err.message : String(err)); }
            return;
          }
          if (msg === "pong") {
            console.log("[WS] Server pong ✓");
            return;
          }
          // Dispatch to handler
          if (this.onMessage) {
            try { this.onMessage(msg); } catch (err) { console.error("[WS] Handler error:", err); }
          }
        });

        ws.on("error", (err) => {
          console.warn("[WS] Socket error:", err.message);
        });

        ws.on("close", (code) => {
          if (this.ws === ws) this.ws = null;
          this.heartbeat.stop();
          if (code !== 1000) {
            if (PROXIES.length > 0) {
              this.proxyIndex = (this.proxyIndex + 1) % PROXIES.length;
            }
            this.onReconnect?.();
          }
        });

        ws.on("open", () => {
          if (agent) {
            const proxyUrl = PROXIES[this.proxyIndex % PROXIES.length];
            console.log(`[WS] Connected ✓ (via ${mask(proxyUrl)})`);
          } else {
            console.log("[WS] Connected ✓ (direct)");
          }
          this.ws = ws;
          this.heartbeat.start(ws);
          resolve();
        });

        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error("WS connection timed out (10s)"));
        }, 10_000);
        ws.once("open", () => clearTimeout(timeout));
      });
    } catch (err) {
      if (PROXIES.length > 0) {
        this.proxyIndex = (this.proxyIndex + 1) % PROXIES.length;
        console.warn(`[WS] Connection failed (proxy) — trying next proxy:`, err instanceof Error ? err.message : String(err));
      } else {
        console.warn(`[WS] Connection failed:`, err instanceof Error ? err.message : String(err));
      }
      this.onReconnect?.();
    }
  }

  disconnect(): void {
    this.heartbeat.stop();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000, "manual shutdown");
      this.ws = null;
    }
  }

  getConnectionInfo(): { type: "direct" | "proxy" | "fallback"; proxy: string | null } {
    if (this.ws && this.ws.readyState === WSClient.OPEN) {
      const proxyUrl = PROXIES.length > 0 ? PROXIES[this.proxyIndex % PROXIES.length] : null;
      return { type: proxyUrl ? "proxy" : "direct", proxy: proxyUrl ? mask(proxyUrl) : null };
    }
    return { type: "fallback", proxy: null };
  }

  getWebSocket(): WSClient | null {
    return this.ws;
  }

  /** Send raw string data through the WebSocket */
  send(data: string): void {
    this.ws?.send(data);
  }

  /** Check if WebSocket is in OPEN state */
  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WSClient.OPEN;
  }

  /** Check if WebSocket is in CONNECTING state */
  isConnecting(): boolean {
    return this.ws !== null && this.ws.readyState === WSClient.CONNECTING;
  }
}