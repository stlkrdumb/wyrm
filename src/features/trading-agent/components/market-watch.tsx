"use client";

import { useEffect, useRef, useState } from "react";
import type { TickerData } from "../hooks/use-agent";

interface Props {
  tickers: Record<string, TickerData | null> | null;
}

function TickerItem({ symbol, ticker }: { symbol: string; ticker: TickerData }) {
  const prevPriceRef = useRef<number>(ticker.lastPrice);
  const [flashClass, setFlashClass] = useState<string>("");

  useEffect(() => {
    if (ticker.lastPrice > prevPriceRef.current) {
      setFlashClass("text-emerald-400 bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)] border-emerald-500/30");
      const t = setTimeout(() => setFlashClass(""), 1000);
      prevPriceRef.current = ticker.lastPrice;
      return () => clearTimeout(t);
    } else if (ticker.lastPrice < prevPriceRef.current) {
      setFlashClass("text-rose-400 bg-rose-500/10 shadow-[0_0_8px_rgba(244,63,94,0.2)] border-rose-500/30");
      const t = setTimeout(() => setFlashClass(""), 1000);
      prevPriceRef.current = ticker.lastPrice;
      return () => clearTimeout(t);
    }
  }, [ticker.lastPrice]);

  const isPos = ticker.change24hPercent >= 0;

  return (
    <div className={`flex items-center gap-3 px-3 py-1.5 rounded border border-zinc-900 bg-zinc-950/40 transition-all duration-300 ${flashClass}`}>
      <span className="font-mono font-bold text-xs text-zinc-100">{symbol}</span>
      <span className="font-mono text-xs font-semibold tabular-nums text-zinc-300">
        ${ticker.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
      <span className={`text-[9px] font-bold font-mono tabular-nums ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
        {isPos ? "+" : ""}{ticker.change24hPercent.toFixed(2)}%
      </span>
    </div>
  );
}

export function MarketWatch({ tickers }: Props) {
  if (!tickers || Object.keys(tickers).length === 0) {
    return (
      <div className="flex items-center justify-between px-6 py-4 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md">
        <span className="text-xs font-mono tracking-widest text-zinc-500 uppercase animate-pulse">
          INITIALIZING MARKET STREAM...
        </span>
      </div>
    );
  }

  const entries = Object.entries(tickers).filter(([, t]) => t !== null) as [string, TickerData][];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">Market Tickers</span>
        <span className="text-[9px] tracking-wider text-emerald-500 font-bold uppercase flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live WebSocket
        </span>
      </div>
      <div className="flex items-center gap-3 overflow-x-auto py-1 px-0.5 scrollbar-none">
        {entries.map(([symbol, ticker]) => (
          <TickerItem key={symbol} symbol={symbol} ticker={ticker} />
        ))}
      </div>
    </div>
  );
}
