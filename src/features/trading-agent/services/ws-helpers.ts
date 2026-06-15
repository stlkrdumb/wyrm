import type { PriceSnapshot } from "./price-store";
import type { Candlestick } from "@/features/trading-agent/types";

export interface WSTickerRaw {
  instId?: string;
  instType?: string;
  lastPrice?: string;
  lastPr?: string;
  high24h?: string;
  low24h?: string;
  baseVol?: string;
  vol24h?: string;
  quoteVol?: string;
  volValue24h?: string;
  priceRate?: string;
  change24h?: string;
  changeUtc24h?: string;
  cap24hSwing?: string;
  ts?: string;
}

export interface WSCandleRaw {
  instType: "SPOT";
  channel: string;
  instId: string;
  data?: string[][];
}

/** Parse raw ticker JSON into a PriceSnapshot */
export function parseTicker(raw: WSTickerRaw): PriceSnapshot | null {
  const instId = raw.instId ?? "";
  const lastPrice = Number(raw.lastPrice ?? raw.lastPr ?? "0");
  if (lastPrice <= 0) return null;

  const changePct = (() => {
    let p: number;
    if (raw.change24h) p = Number(raw.change24h) * 100;
    else if (raw.priceRate) p = Number(raw.priceRate) * 100;
    else if (raw.changeUtc24h) p = Number(raw.changeUtc24h) * 100;
    else if (raw.cap24hSwing) p = Number(raw.cap24hSwing) * 100;
    else return 0;
    return Number(p.toFixed(2));
  })();

  let ts = Date.now();
  if (raw.ts) { const n = Number(raw.ts); ts = n > 1e12 ? n : n * 1000; }

  return {
    symbol: instId, lastPrice, high24h: Number(raw.high24h ?? "0"), low24h: Number(raw.low24h ?? "0"),
    baseVolume: Number(raw.baseVol ?? raw.vol24h ?? "0"), quoteVolume: Number(raw.volValue24h ?? raw.quoteVol ?? "0"),
    changePercent: changePct, updatedAt: new Date(ts),
  };
}

/** Parse a candle row into a Candlestick */
export function parseCandle(row: string[]): Candlestick | null {
  if (row.length < 6) return null;
  return { timestamp: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) };
}

/** Dispatcher — called on *every* raw WS text message.
 *  Returns "ping"/"pong"/null for special frames */
type ProcessTickersFn = (snapshots: PriceSnapshot[]) => void;
type ProcessCandleFn = (msg: Record<string, unknown>) => void;
type SubAckFn = (channel: string, instId?: string) => void;
type ErrorCb = (code: number | undefined, msg: string) => void;

export function dispatchWsMessage(
  rawStr: string,
  onTickers: ProcessTickersFn,
  onCandle: ProcessCandleFn,
  onSubAck: SubAckFn,
  onError: ErrorCb,
): "ping" | "pong" | null {
  if (rawStr === "ping") return "ping";
  if (rawStr === "pong") return "pong";

  let msg: Record<string, unknown>;
  try { msg = JSON.parse(rawStr); } catch { console.warn("[WS] Invalid JSON:", rawStr.slice(0, 200)); return null; }

  const eventVal = msg.event as string | undefined;
  if (eventVal === "error" || ("code" in msg && msg.code !== undefined)) {
    onError(msg.code as number | undefined, String((msg.msg ?? "")));
    return null;
  }
  if (eventVal === "subscribe") {
    const arg = msg.arg as { channel?: string; instId?: string };
    onSubAck(arg?.channel ?? "", arg?.instId);
    return null;
  }

  const typed = msg as Record<string, unknown>;
  let dataArr: unknown[] | undefined;
  if (typed.action !== undefined && "data" in typed && "arg" in typed) {
    dataArr = typed.data as unknown[]; // has action+data+arg
  } else if ("event" in typed || ("arg" in typed && "data" in typed)) {
    dataArr = typed.data as unknown[]; // fallback path
  }

  if (!dataArr) return null;
  if (!Array.isArray(dataArr)) return null;

  const arg = typed.arg as { channel?: string; instId?: string } | undefined;
  const snapshots: PriceSnapshot[] = [];

  if (arg?.channel === "ticker") {
    for (const entry of dataArr) {
      const snap = parseTicker(entry as WSTickerRaw);
      if (snap) snapshots.push(snap); else console.error("[WS] Ticker parse failed", (entry as any)?.instId ?? "?");
    }
    if (snapshots.length > 0) onTickers(snapshots);
  } else if (arg?.channel?.startsWith("candle")) {
    onCandle(typed);
  }

  return null;
}
