import type { PriceSnapshot } from "./price-store";
import type { Candlestick } from "../types";

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
  changeUtc24h?: string;
  cap24hSwing?: string;
  ts?: string;
}

export function parseTicker(raw: WSTickerRaw): PriceSnapshot | null {
  const instId = raw.instId ?? "";
  const lastPrice = Number(raw.lastPrice ?? raw.lastPr ?? "0");
  if (lastPrice <= 0) return null;

  const high24h = Number(raw.high24h ?? "0");
  const low24h = Number(raw.low24h ?? "0");
  const baseVol = Number(raw.baseVol ?? raw.vol24h ?? "0");
  const quoteVol = Number(raw.volValue24h ?? raw.quoteVol ?? "0");

  let changePct = 0;
  if (raw.priceRate) {
    changePct = Number(raw.priceRate) * 100;
  } else if (raw.changeUtc24h) {
    changePct = Number(raw.changeUtc24h) * 100;
  } else if (raw.cap24hSwing) {
    changePct = Number(raw.cap24hSwing) * 100;
  }

  let ts = Date.now();
  if (raw.ts) {
    const parsed = Number(raw.ts);
    ts = parsed > 1e12 ? parsed : parsed * 1000;
  }

  return {
    symbol: instId,
    lastPrice,
    high24h,
    low24h,
    baseVolume: baseVol,
    quoteVolume: quoteVol,
    changePercent: changePct,
    updatedAt: new Date(ts),
  };
}

export function parseCandle(row: string[]): Candlestick | null {
  if (row.length < 6) return null;
  return {
    timestamp: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}
