import type { PriceSnapshot } from "../price-store";
import { updatePositionUnrealizedPnL } from "../agent-engine";
import { priceStore } from "../price-store";
import { agentEvents } from "../agent-events";
import { dispatchWsMessage } from "../ws-helpers";

/**
 * Process raw WebSocket messages and dispatch to appropriate handlers.
 * Handles ticker updates, candle updates, and server control frames.
 */
export function processWsMessage(data: string): void {
  // Heartbeat frames
  if (data === "ping") return; // handled by connection before reaching here
  if (data === "pong") {
    console.log("[WS] Server pong ✓");
    return;
  }

  dispatchWsMessage(
    data,
    handleTickerUpdate,
    handleCandleUpdate,
    (channel, instId) => console.log("[WS] Subscribed:", `${channel}/${instId ?? "*"}`),
    (code, msg) => console.warn(`[WS] Server error: code=${code}, msg="${msg}"`),
  );
}

function handleTickerUpdate(snapshots: PriceSnapshot[]): void {
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
}

function handleCandleUpdate(msg: Record<string, unknown>): void {
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
    priceStore.updateCandle(instId, interval, {
      timestamp: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    });
  }
}
