import type { PriceSnapshot } from "./price-store";
import { updatePositionUnrealizedPnL } from "./agent-engine";
import { priceStore, type PriceStore } from "./price-store";
import { config } from "./agent-engine";
import { WebSocket as WSClient } from "ws";
import { optionalFetch, getProxyAgentForWS, PROXIES, mask } from "./proxy-client";
import { dispatchWsMessage } from "./ws-helpers";

export interface WSSubscription {
  instType: "SPOT";
  channel: "ticker" | `candle${string}`;
  instId: string;
}



export class MarketWebSocketService {
  private ws: WSClient | null = null;
  private subscriptions: WSSubscription[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30_000;
  private baseReconnectDelay = 1_000;
  private proxyIndex = 0;


  getConnectionInfo(): { type: "direct" | "proxy" | "fallback"; proxy: string | null } {
    if (this.ws && this.ws.readyState === WSClient.OPEN) {
      const proxyUrl = PROXIES.length > 0 ? PROXIES[this.proxyIndex % PROXIES.length] : null;
      return {
        type: proxyUrl ? "proxy" : "direct",
        proxy: proxyUrl ? mask(proxyUrl) : null,
      };
    }
    return {
      type: "fallback",
      proxy: null,
    };
  }

  async subscribe(channels: WSSubscription[]): Promise<void> {
    this.subscriptions = channels;
    console.log(`[WS] Subscribing to ${channels.length} channel(s):`, channels.map(c => `${c.instType}/${c.channel}/${c.instId}`).join(", "));

    if (!this.ws || this.ws.readyState === WSClient.CLOSED) {
      await this.connect();
    } else {
      this.sendSubscribe(channels);
    }
  }

  disconnect(): void {
    this.clearPingTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000, "manual shutdown");
      this.ws = null;
    }
  }

  private async connect(): Promise<void> {
    console.log("[WS] Connecting to wss://ws.bitget.com/v2/ws/public...");

    try {
      await new Promise<void>((resolve, reject) => {
        const agent = getProxyAgentForWS(this.proxyIndex);
        const options = agent ? { agent } : {};

        if (agent) {
          const proxyUrl = PROXIES[this.proxyIndex % PROXIES.length];
          console.log(`[WS] Routing through proxy: ${mask(proxyUrl)}`);
        }

        const ws = new WSClient("wss://ws.bitget.com/v2/ws/public", options);

        ws.on("open", () => {
          if (agent) {
            const proxyUrl = PROXIES[this.proxyIndex % PROXIES.length];
            console.log(`[WS] Connected ✓ (via ${mask(proxyUrl)})`);
          } else {
            console.log("[WS] Connected ✓ (direct)");
          }
          this.reconnectAttempt = 0;
          this.ws = ws;
          if (this.subscriptions.length > 0) {
            this.sendSubscribe(this.subscriptions);
          }
          this.startPingTimer();
          resolve();
        });

        ws.on("message", (data) => {
          try { this.processWsMsg(data.toString("utf-8")); } catch (err) { console.error("[WS] Msg parse error:", err); }
        });

        ws.on("error", (err) => {
          console.warn("[WS] Socket error:", err.message);
        });

        ws.on("close", (code, reason) => {
          this.ws = null;
          this.clearPingTimer();
          if (code !== 1000) {
            if (PROXIES.length > 0) {
              this.proxyIndex = (this.proxyIndex + 1) % PROXIES.length;
            }
            this.scheduleReconnect();
          }
          reject(new Error(`WebSocket closed code=${code} reason=${reason.toString()}`));
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
        console.warn(`[WS] Connection failed (proxy) — trying next proxy/REST fallback:`, err instanceof Error ? err.message : String(err));
      } else {
        console.warn(`[WS] Connection failed — trying REST fallback:`, err instanceof Error ? err.message : String(err));
      }
      await this.fallbackToRest();
    }
  }

  private fallbackToRest(): Promise<void> {
    console.log("[WS] Starting REST ticker fallback...");

    const fetchAllTickers = async () => {
      try {
        for (const symbol of config.tradingSymbols) {
          const resp = await optionalFetch<{
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

          priceStore.updateTicker(snapshot);
        }

        console.log(`[WS] REST fallback cached ${priceStore.getSymbolCount()} ticker(s)`);
      } catch (err) {
        console.warn("[WS] REST fetch error:", err instanceof Error ? err.message : String(err));
      }
    };

    fetchAllTickers();
    setInterval(fetchAllTickers, 30_000);

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
    if (!this.ws || this.ws.readyState !== WSClient.OPEN) return;
    const msg = JSON.stringify({ op: "subscribe", args: channels });
    this.ws.send(msg);
    console.log("[WS] Subscribe:", channels.map(c => `${c.channel}/${c.instId}`).join(", "));
  }

  private processWsMsg(data: string): void {
    dispatchWsMessage(
      data,
      (snapshots) => { for (const s of snapshots) { priceStore.updateTicker(s); updatePositionUnrealizedPnL(s.symbol, s.lastPrice); } },
      (msg: Record<string, unknown>) => {
        const arg = msg.arg! as { channel?: string; instId?: string };
        const dataArr = msg.data as string[][] | undefined;
        if (!arg?.channel || !dataArr) return;
        const interval = arg.channel.replace(/^candle/, "");
        for (const row of dataArr) {
          if (row.length < 6) continue;
          priceStore.updateCandle(arg.instId ?? "UNKNOWN", interval, { timestamp: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) });
        }
      },
      (channel, instId) => console.log("[WS] Subscribed:", `${channel}/${instId ?? "*"}`),
      (code, msg) => console.warn(`[WS] Server error: code=${code}, msg="${msg}"`),
    );

    if (data === "ping") { this.sendPong(); return; }
    if (data === "pong") { console.log("[WS] Server pong ✓"); this.reconnectAttempt = 0; }
  }

  private startPingTimer(): void {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WSClient.OPEN) {
        this.sendPong();
      } else {
        this.clearPingTimer();
      }
    }, 30_000);
  }

  private sendPong(): void {
    if (this.ws?.readyState === WSClient.OPEN) {
      this.ws.send("ping");
    }
  }

  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  getPriceStore(): PriceStore {
    return priceStore;
  }
}

export const marketWS = new MarketWebSocketService();
