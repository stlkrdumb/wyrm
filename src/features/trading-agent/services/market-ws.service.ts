import { WSSubscription, WebSocketConnection } from "./market-ws/connection";
import { SubscriptionManager } from "./market-ws/subscriptions";
import { CycleScheduler } from "./market-ws/cycle-scheduler";
import { processWsMessage } from "./market-ws/message-processor";
import { getAgentState } from "./agent-engine";
import { priceStore, type PriceStore } from "./price-store";
import { config } from "./agent-engine";

export type { WSSubscription } from "./market-ws/connection";

export class MarketWebSocketService {
  private connection = new WebSocketConnection();
  private subscriptions = new SubscriptionManager(() => this.connection.getWebSocket());
  private cycleScheduler = new CycleScheduler();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30_000;
  private baseReconnectDelay = 1_000;

  constructor() {
    // Wire up connection callbacks
    this.connection.setMessageHandler((msg) => processWsMessage(msg));
    this.connection.setReconnectHandler(() => this.scheduleReconnect());
  }

  setAgentCycleHandler(handler: () => Promise<void>) {
    this.cycleScheduler.setAgentCycleHandler(handler);
  }

  stopAgentCycles() {
    this.cycleScheduler.stopAgentCycles();
  }

  getConnectionInfo() {
    return this.connection.getConnectionInfo();
  }

  async subscribe(channels: WSSubscription[]): Promise<void> {
    const { added, removed } = this.subscriptions.updateSubscriptions(channels);
    if (added.length === 0 && removed.length === 0) return;

    console.log(`[WS] Subscribing to ${channels.length} channel(s):`, channels.map(c => `${c.instType}/${c.channel}/${c.instId}`).join(", "));

    if (!this.connection.isOpen()) {
      await this.connect();
    } else {
      if (removed.length > 0) this.subscriptions.sendUnsubscribe(removed);
      if (added.length > 0) this.subscriptions.sendSubscribe(added);
    }
  }

  disconnect(): void {
    this.stopAgentCycles();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connection.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.connection.isOpen()) {
      // Re-send subscriptions if reconnecting
      const subs = this.subscriptions.getSubscriptions();
      if (subs.length > 0) this.subscriptions.sendSubscribe(subs);
      return;
    }
    if (this.connection.isConnecting()) {
      // Wait for pending connection
      return;
    }

    await this.connection.connect();
    // Resend subscriptions after connect
    const subs = this.subscriptions.getSubscriptions();
    if (subs.length > 0) this.subscriptions.sendSubscribe(subs);
  }

  private scheduleReconnect(): void {
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

  buildSubscriptions(): WSSubscription[] {
    return this.subscriptions.buildSubscriptions(config.tradingSymbols);
  }

  syncSubscriptionsForPositions(extraSymbols?: string[]): void {
    const st = getAgentState();
    const posSymbols = st.positions.map(p => p.symbol);
    const allSubs = this.subscriptions.syncWithPositions(config.tradingSymbols, posSymbols, extraSymbols);
    const candleChannels = this.subscriptions.getSubscriptions().filter(s => s.channel !== "ticker");
    const merged = [...candleChannels, ...allSubs];
    this.subscribe(merged).catch(err =>
      console.warn("[WS] syncSubscriptions failed:", err instanceof Error ? err.message : String(err))
    );
  }

  async initialize(): Promise<{ type: "direct" | "proxy" | "fallback"; proxy: string | null }> {
    const channels = this.buildSubscriptions();
    await this.subscribe(channels);
    return this.getConnectionInfo();
  }

  getPriceStore(): PriceStore {
    return priceStore;
  }
}

// Share the MarketWebSocketService instance across Next.js bundles using Node's global object
const globalForMarketWS = global as unknown as { marketWS?: MarketWebSocketService };

export const marketWS = globalForMarketWS.marketWS ?? new MarketWebSocketService();

if (process.env.NODE_ENV !== "production") {
  globalForMarketWS.marketWS = marketWS;
}

// Auto-initialize WebSocket on module load (connects at server startup)
if (!globalForMarketWS.marketWS) {
  marketWS.initialize().catch(err => {
    console.warn("[WS] Auto-initialize failed (will retry on demand):", err instanceof Error ? err.message : String(err));
  });
}
