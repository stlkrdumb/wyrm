import { WSSubscription } from "./connection";
import { WebSocket as WSClient } from "ws";

export class SubscriptionManager {
  private subscriptions: WSSubscription[] = [];

  constructor(private getWebSocket: () => WSClient | null) {}

  getSubscriptions(): WSSubscription[] {
    return this.subscriptions;
  }

  setSubscriptions(subs: WSSubscription[]): void {
    this.subscriptions = subs;
  }

  /** Send unsubscribe for channels no longer in the new set */
  sendUnsubscribe(removed: WSSubscription[]): void {
    const ws = this.getWebSocket();
    if (!ws || ws.readyState !== ws.OPEN || removed.length === 0) return;
    try {
      const msg = JSON.stringify({ op: "unsubscribe", args: removed });
      ws.send(msg);
      console.log("[WS] Unsubscribe:", removed.map(c => `${c.channel}/${c.instId}`).join(", "));
    } catch (err) {
      console.warn("[WS] Unsubscribe send failed:", err instanceof Error ? err.message : String(err));
    }
  }

  /** Send subscribe for new channels */
  sendSubscribe(added: WSSubscription[]): void {
    const ws = this.getWebSocket();
    if (!ws || ws.readyState !== ws.OPEN) return;
    try {
      const msg = JSON.stringify({ op: "subscribe", args: added });
      ws.send(msg);
      console.log("[WS] Subscribe:", added.map(c => `${c.channel}/${c.instId}`).join(", "));
    } catch (err) {
      console.warn("[WS] Subscribe send failed:", err instanceof Error ? err.message : String(err));
    }
  }

  /** Compute diff and send subscribe/unsubscribe as needed */
  updateSubscriptions(newChannels: WSSubscription[]): { added: WSSubscription[]; removed: WSSubscription[] } {
    const newKeys = new Set(newChannels.map(c => `${c.channel}:${c.instId}`));
    const oldKeys = new Set(this.subscriptions.map(c => `${c.channel}:${c.instId}`));

    const removed = this.subscriptions.filter(c => !newKeys.has(`${c.channel}:${c.instId}`));
    const added = newChannels.filter(c => !oldKeys.has(`${c.channel}:${c.instId}`));

    this.subscriptions = newChannels;
    return { added, removed };
  }

  /** Build subscription channels for all configured trading symbols */
  buildSubscriptions(tradingSymbols: string[]): WSSubscription[] {
    return tradingSymbols.map(symbol => ({
      instType: "SPOT" as const,
      channel: "ticker" as const,
      instId: symbol.toUpperCase(),
    }));
  }

  /** Sync subscriptions with positions and watchlist */
  syncWithPositions(
    configSymbols: string[],
    positionSymbols: string[],
    extraSymbols: string[] = []
  ): WSSubscription[] {
    const all = [...new Set([...configSymbols, ...positionSymbols, ...extraSymbols])];
    return all.map(symbol => ({
      instType: "SPOT" as const,
      channel: "ticker" as const,
      instId: symbol.toUpperCase(),
    }));
  }
}
