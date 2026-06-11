import type { PriceSnapshot } from "./price-store";
import { updatePositionUnrealizedPnL, getAgentState } from "./agent-engine";
import { priceStore, type PriceStore } from "./price-store";
import { config } from "./agent-engine";
import { agentEvents } from "./agent-events";
import { WebSocket as WSClient } from "ws";
import { getProxyAgentForWS, PROXIES, mask } from "./proxy-client";
import { bitgetClient } from "@/lib/bitget-client";
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
  private cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private cycleInFlight = false;
  private agentCycleHandler: (() => Promise<void>) | null = null;
  private restFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private restFallbackRunning = false;

  setAgentCycleHandler(handler: () => Promise<void>) {
    this.agentCycleHandler = handler;
    if (!this.cycleTimer) {
      const warmupMs = 20_000;
      const intervalMs = Number(process.env.AGENT_CYCLE_INTERVAL_MS) || 60_000;
      console.log(`[WS] Agent cycle timer started (warmup ${warmupMs / 1000}s, every ${(intervalMs / 1000).toFixed(0)}s)`);
      this.scheduleNextCycle(warmupMs);
    }
  }

  stopAgentCycles() {
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.cycleInFlight = false;
    this.agentCycleHandler = null;
    console.log("[WS] Agent cycle timer stopped");
  }

  private scheduleNextCycle(delayMs: number) {
    // Guard against leaked previous timers
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
    }
    this.cycleTimer = setTimeout(() => {
      this.cycleTimer = null;
      this.runCycle();
    }, delayMs);
  }

  private async runCycle() {
    if (this.cycleInFlight) {
      console.warn("[WS] Cycle still in flight — skipping this tick");
      this.scheduleNextCycle(Number(process.env.AGENT_CYCLE_INTERVAL_MS) || 60_000);
      return;
    }
    if (!this.agentCycleHandler) return;

    this.cycleInFlight = true;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        this.agentCycleHandler(),
        new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => reject(new Error("Cycle timed out after 90s")), 90_000);
        }),
      ]);
    } catch (err) {
      console.error("[AGENT CYCLE] Cycle failed or timed out:", err instanceof Error ? err.message : String(err));
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      this.cycleInFlight = false;
    }

    const intervalMs = Number(process.env.AGENT_CYCLE_INTERVAL_MS) || 60_000;
    // Use the full interval for the next cycle — a 100ms minimum was producing
    // double-fire patterns. Drift is naturally corrected by wall-clock subtraction.
    const nextDelay = Math.max(intervalMs, 1000);
    this.scheduleNextCycle(nextDelay);
  }


  getConnectionInfo(): { type: "direct" | "proxy" | "fallback"; proxy: string | null } {
    if (this.ws && this.ws.readyState === WSClient.OPEN) {
      const proxyUrl = PROXIES.length > 0 ? PROXIES[this.proxyIndex % PROXIES.length] : null;
      return {
        type: proxyUrl ? "proxy" : "direct",
        proxy: proxyUrl ? mask(proxyUrl) : null,
      };
    }
    // Only report "fallback" when the REST timer is actually running
    if (this.restFallbackTimer !== null) {
      return { type: "fallback", proxy: null };
    }
    return { type: "fallback", proxy: null };
  }

  /** Send unsubscribe for channels no longer in the new set */
  private sendUnsubscribe(removed: WSSubscription[]): void {
    if (!this.ws || this.ws.readyState !== WSClient.OPEN || removed.length === 0) return;
    try {
      const msg = JSON.stringify({ op: "unsubscribe", args: removed });
      this.ws.send(msg);
      console.log("[WS] Unsubscribe:", removed.map(c => `${c.channel}/${c.instId}`).join(", "));
    } catch (err) {
      console.warn("[WS] Unsubscribe send failed:", err instanceof Error ? err.message : String(err));
    }
  }

  async subscribe(channels: WSSubscription[]): Promise<void> {
    // Compute the diff: only subscribe to NEW channels, only unsubscribe from REMOVED ones.
    // Once a symbol is subscribed and the WS connection stays alive (kept by ping every 30s),
    // the server keeps pushing ticks. Re-subscribing the same symbol every cycle is wasteful.
    const newKeys = new Set(channels.map(c => `${c.channel}:${c.instId}`));
    const oldKeys = new Set(this.subscriptions.map(c => `${c.channel}:${c.instId}`));

    const removed = this.subscriptions.filter(c => !newKeys.has(`${c.channel}:${c.instId}`));
    const added = channels.filter(c => !oldKeys.has(`${c.channel}:${c.instId}`));

    // No-op when the subscription set is unchanged
    if (added.length === 0 && removed.length === 0) return;

    this.subscriptions = channels;
    console.log(`[WS] Subscribing to ${channels.length} channel(s):`, channels.map(c => `${c.instType}/${c.channel}/${c.instId}`).join(", "));

    if (!this.ws || this.ws.readyState === WSClient.CLOSED) {
      await this.connect();
    } else if (this.ws.readyState === WSClient.OPEN) {
      if (removed.length > 0) this.sendUnsubscribe(removed);
      if (added.length > 0) this.sendSubscribe(added);
    } else {
      // CONNECTING or CLOSING — subscriptions are stored; the 'open' handler will re-send them.
      console.warn(`[WS] subscribe() called while socket is ${this.ws.readyState === WSClient.CONNECTING ? "connecting" : "closing"} — queued for open`);
    }
  }

  disconnect(): void {
    this.clearPingTimer();
    this.clearRestFallbackTimer();
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
          // Stop REST fallback timer when WS is live
          this.clearRestFallbackTimer();
          if (this.subscriptions.length > 0) {
            this.sendSubscribe(this.subscriptions);
          }
          this.startPingTimer();
          resolve();
        });

        ws.on("message", (data) => {
          try { this.processWsMsg(data.toString("utf-8")); } catch (err) { console.error("[WS] Handler error:", err); }
        });

        ws.on("error", (err) => {
          console.warn("[WS] Socket error:", err.message);
        });

        ws.on("close", (code) => {
          // Only null the reference if this is still the current socket — prevents
          // a late close event from a replaced connection destroying the new one
          if (this.ws === ws) this.ws = null;
          this.clearPingTimer();
          if (code !== 1000) {
            if (PROXIES.length > 0) {
              this.proxyIndex = (this.proxyIndex + 1) % PROXIES.length;
            }
            this.scheduleReconnect();
          }
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

  private async fallbackToRest(): Promise<void> {
    console.log("[WS] Starting REST ticker fallback...");

    this.clearRestFallbackTimer();

    const fetchAllTickers = async () => {
      // Prevent overlapping runs when previous fetch took longer than 30s
      if (this.restFallbackRunning) return;
      this.restFallbackRunning = true;
      try {
        // Batch fetch — single call returns all tickers
        const result = await bitgetClient.publicGet<Array<Record<string, string>>>(
          "/api/v2/spot/market/tickers"
        );

        const targetSymbols = new Set(config.tradingSymbols);
        const st = getAgentState();
        for (const p of st.positions) targetSymbols.add(p.symbol);
        if (st.watchlist) for (const s of st.watchlist) targetSymbols.add(s);

        let count = 0;
        for (const ticker of result.data ?? []) {
          const symbol = (ticker.symbol ?? ticker.instId ?? "").toUpperCase();
          if (!targetSymbols.has(symbol)) continue;

          const lastPrice = Number(ticker.lastPrice ?? ticker.lastPr ?? ticker.close ?? "0");
          if (lastPrice <= 0) continue;

          const high24h = Number(ticker.high24h ?? ticker.high ?? "0");
          const low24h = Number(ticker.low24h ?? ticker.low ?? "0");
          const quoteVol = Number(ticker.volValue24h ?? ticker.quoteVolume ?? ticker.volumeValue24h ?? "0");
          const changePctRaw = Number(ticker.changeUtc24h ?? ticker.priceRate ?? ticker.changingPercent24h ?? "0");
          // Bitget already returns percentage as a decimal ratio (0.05 = 5%) — multiply by 100
          const changePct = Number((changePctRaw * 100).toFixed(2));
          const tsNum = Number(ticker.ts ?? Date.now());

          const snapshot: PriceSnapshot = {
            symbol,
            lastPrice: Math.round(lastPrice * 100) / 100,
            high24h,
            low24h,
            baseVolume: 0,
            quoteVolume: quoteVol,
            changePercent: changePct,
            updatedAt: new Date(tsNum),
          };

          priceStore.updateTicker(snapshot);
          count++;
        }

        console.log(`[WS] REST fallback cached ${count} ticker(s)`);
      } catch (err) {
        console.warn("[WS] REST fetch error:", err instanceof Error ? err.message : String(err));
      } finally {
        this.restFallbackRunning = false;
      }
    };

    // Fire immediately, then on 30s interval — use recursive setTimeout to avoid overlap
    const schedule = () => {
      this.restFallbackTimer = setTimeout(async () => {
        await fetchAllTickers();
        if (this.restFallbackTimer) schedule(); // re-schedule only if still active
      }, 30_000);
    };
    await fetchAllTickers();
    schedule();
  }

  private clearRestFallbackTimer(): void {
    if (this.restFallbackTimer) {
      clearTimeout(this.restFallbackTimer);
      this.restFallbackTimer = null;
    }
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
    try {
      const msg = JSON.stringify({ op: "subscribe", args: channels });
      this.ws.send(msg);
      console.log("[WS] Subscribe:", channels.map(c => `${c.channel}/${c.instId}`).join(", "));
    } catch (err) {
      console.warn("[WS] Subscribe send failed:", err instanceof Error ? err.message : String(err));
    }
  }

  private processWsMsg(data: string): void {
    // Check for heartbeat frames FIRST so they never reach dispatchWsMessage
    if (data === "ping") {
      try { this.ws?.send("pong"); } catch (err) { console.warn("[WS] Pong send failed:", err instanceof Error ? err.message : String(err)); }
      return;
    }
    if (data === "pong") {
      console.log("[WS] Server pong ✓");
      this.reconnectAttempt = 0;
      return;
    }

    dispatchWsMessage(
      data,
      (snapshots) => {
        for (const s of snapshots) {
          priceStore.updateTicker(s);
          updatePositionUnrealizedPnL(s.symbol, s.lastPrice);
          agentEvents.emitPrice({
            symbol: s.symbol,
            lastPrice: s.lastPrice,
            change24hPercent: s.changePercent,
            high24h: s.high24h,
            low24h: s.low24h,
            volume24h: s.quoteVolume,
            timestamp: Date.now(),
          });
        }
      },
      (msg: Record<string, unknown>) => {
        const arg = msg.arg as { channel?: string; instId?: string } | undefined;
        const dataArr = msg.data as string[][] | undefined;
        if (!arg?.channel || !dataArr) return;
        const interval = arg.channel.replace(/^candle/, "");
        const instId = arg.instId;
        if (!instId) {
          console.warn("[WS] Candle message missing instId — skipping");
          return;
        }
        for (const row of dataArr) {
          if (row.length < 6) continue;
          priceStore.updateCandle(instId, interval, { timestamp: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) });
        }
      },
      (channel, instId) => console.log("[WS] Subscribed:", `${channel}/${instId ?? "*"}`),
      (code, msg) => console.warn(`[WS] Server error: code=${code}, msg="${msg}"`),
    );
  }

  private startPingTimer(): void {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WSClient.OPEN) {
        // Client initiated heartbeat — send ping to keep connection alive
        try { this.ws.send("ping"); } catch (err) { console.warn("[WS] Ping send failed:", err instanceof Error ? err.message : String(err)); }
      } else {
        this.clearPingTimer();
      }
    }, 30_000);
  }

  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /** Build subscription channels for all configured trading symbols */
  buildSubscriptions(): WSSubscription[] {
    return config.tradingSymbols.map((symbol): WSSubscription => ({
      instType: "SPOT",
      channel: "ticker",
      instId: symbol.toUpperCase(),
    }));
  }

  /** Subscribe to TRADING_SYMBOLS + current position + watchlist symbols */
  syncSubscriptionsForPositions(extraSymbols?: string[]): void {
    const st = getAgentState();
    const posSymbols = st.positions.map(p => p.symbol);
    // Preserve any candle subscriptions — only compute the ticker-channel diff
    const existingTickerKeys = new Set(this.subscriptions.filter(s => s.channel === "ticker").map(s => `${s.channel}:${s.instId}`));
    const all = [...new Set([...config.tradingSymbols, ...posSymbols, ...(extraSymbols ?? [])])];
    const tickerChannels: WSSubscription[] = all.map((symbol): WSSubscription => ({
      instType: "SPOT",
      channel: "ticker",
      instId: symbol.toUpperCase(),
    }));
    // Keep existing candle subscriptions
    const candleChannels = this.subscriptions.filter(s => s.channel !== "ticker");
    const merged = [...candleChannels, ...tickerChannels.filter(c => !existingTickerKeys.has(`${c.channel}:${c.instId}`))];
    this.subscribe(merged).catch(err =>
      console.warn("[WS] syncSubscriptions failed:", err instanceof Error ? err.message : String(err))
    );
  }

  /** Initialize WebSocket connection — call once on app startup */
  async initialize(): Promise<{ type: "direct" | "proxy" | "fallback"; proxy: string | null }> {
    const channels = this.buildSubscriptions();
    await this.subscribe(channels);
    return this.getConnectionInfo();
  }

  getPriceStore(): PriceStore {
    return priceStore;
  }
}

export const marketWS = new MarketWebSocketService();

// Auto-initialize WebSocket on module load (connects at server startup)
marketWS.initialize().catch(err => {
  console.warn("[WS] Auto-initialize failed (will retry on demand):", err instanceof Error ? err.message : String(err));
});
