"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/shared/ui";
import type { TickerData } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  tickers: Record<string, TickerData | null> | null;
  watchlist: string[];
}

function TickerItem({ symbol, ticker }: { symbol: string; ticker: TickerData }) {
  const prevPriceRef = useRef<number>(ticker.lastPrice);
  const [flashClass, setFlashClass] = useState<string>("");
  const [imgError, setImgError] = useState<boolean>(false);

  useEffect(() => {
    if (ticker.lastPrice > prevPriceRef.current) {
      setFlashClass("animate-tick-up");
      const t = setTimeout(() => setFlashClass(""), 800);
      prevPriceRef.current = ticker.lastPrice;
      return () => clearTimeout(t);
    } else if (ticker.lastPrice < prevPriceRef.current) {
      setFlashClass("animate-tick-down");
      const t = setTimeout(() => setFlashClass(""), 800);
      prevPriceRef.current = ticker.lastPrice;
      return () => clearTimeout(t);
    }
  }, [ticker.lastPrice]);

  const isPos = ticker.change24hPercent >= 0;
  const coin = symbol.replace(/USDT$/, "");
  const logoUrl = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${coin.toLowerCase()}.png`;

  return (
    <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded border border-zinc-800/80 bg-zinc-950/40 transition-all duration-300 flex-shrink-0 ${flashClass}`}>
      {!imgError ? (
        <img src={logoUrl} alt={coin} onError={() => setImgError(true)} className="w-4 h-4 rounded-full flex-shrink-0" />
      ) : (
        <span className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 text-[8px] font-bold text-zinc-500 flex items-center justify-center flex-shrink-0 font-sans">
          {coin.slice(0, 2)}
        </span>
      )}
      <span className="font-mono font-bold text-xs text-zinc-100">{coin}/USDT</span>
      <span className="font-mono text-xs font-semibold tabular-nums text-zinc-300">
        ${ticker.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
      <Badge variant={isPos ? "success" : "danger"} className="text-[9px] px-1.5">
        {isPos ? "+" : ""}{ticker.change24hPercent.toFixed(2)}%
      </Badge>
    </div>
  );
}

export function Watchlist({ tickers, watchlist }: Props) {
  if (!watchlist || watchlist.length === 0) {
    return (
      <div className="flex flex-col gap-1.5 overflow-hidden">
        <div className="flex items-center justify-between px-2 flex-shrink-0">
          <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase font-display">Watchlist</span>
        </div>
        <div className="flex items-center justify-center py-6 rounded border border-zinc-800/80 bg-zinc-950/40">
          <span className="text-xs font-mono text-zinc-600 tracking-wider text-center px-4">
            No coins selected yet — start the agent and wait for a cycle
          </span>
        </div>
      </div>
    );
  }

  const entries = watchlist
    .map(sym => [sym, tickers?.[sym] ?? null] as const)
    .filter(([, t]) => t !== null) as [string, TickerData][];

  return (
    <div className="flex flex-col gap-1.5 overflow-hidden">
      <div className="flex items-center justify-between px-2 flex-shrink-0">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase font-display">Watchlist</span>
        <span className="text-[9px] tracking-wider text-emerald-500 font-bold uppercase flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live WebSocket
        </span>
      </div>
      <div className="flex flex-wrap gap-2 border border-zinc-800/80 bg-zinc-950/40 rounded py-2.5 px-3">
        {entries.map(([symbol, ticker]) => (
          <TickerItem key={symbol} symbol={symbol} ticker={ticker} />
        ))}
      </div>
    </div>
  );
}
