"use client";

import { useEffect, useRef, useState } from "react";
import type { TickerData } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  tickers: Record<string, TickerData | null> | null;
}

function TickerItem({ symbol, ticker }: { symbol: string; ticker: TickerData }) {
  const prevPriceRef = useRef<number>(ticker.lastPrice);
  const [flashClass, setFlashClass] = useState<string>("");
  const [imgError, setImgError] = useState<boolean>(false);

  useEffect(() => {
    if (ticker.lastPrice > prevPriceRef.current) {
      setFlashClass("animate-tick-up text-emerald-450");
      const t = setTimeout(() => setFlashClass(""), 800);
      prevPriceRef.current = ticker.lastPrice;
      return () => clearTimeout(t);
    } else if (ticker.lastPrice < prevPriceRef.current) {
      setFlashClass("animate-tick-down text-rose-450");
      const t = setTimeout(() => setFlashClass(""), 800);
      prevPriceRef.current = ticker.lastPrice;
      return () => clearTimeout(t);
    }
  }, [ticker.lastPrice]);

  const isPos = ticker.change24hPercent >= 0;
  const coin = symbol.replace(/USDT$/, "");
  const logoUrl = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${coin.toLowerCase()}.png`;

  return (
    <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded border border-zinc-900 bg-zinc-950/40 transition-all duration-300 flex-shrink-0 ${flashClass}`}>
      {/* Coin Logo */}
      {!imgError ? (
        <img 
          src={logoUrl} 
          alt={coin} 
          onError={() => setImgError(true)} 
          className="w-4 h-4 rounded-full flex-shrink-0"
        />
      ) : (
        <span className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 text-[8px] font-bold text-zinc-500 flex items-center justify-center flex-shrink-0 font-sans">
          {coin.slice(0, 2)}
        </span>
      )}

      <span className="font-mono font-bold text-xs text-zinc-100">{coin}/USDT</span>
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

  // Repeat entries if the list is small to ensure marquee fills the viewport and scrolls seamlessly
  const listItems = [...entries];
  while (listItems.length < 8 && entries.length > 0) {
    listItems.push(...entries);
  }

  return (
    <div className="flex flex-col gap-1.5 overflow-hidden">
      <div className="flex items-center justify-between px-2 flex-shrink-0">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">Market Tickers</span>
        <span className="text-[9px] tracking-wider text-emerald-500 font-bold uppercase flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live WebSocket
        </span>
      </div>
      <div className="relative flex overflow-x-hidden border border-zinc-900 bg-zinc-950/40 rounded py-2.5">
        {/* Left/Right Fading Edge Overlays */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#090a0c] to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#090a0c] to-transparent pointer-events-none z-10" />

        {/* Scrolling Tickers */}
        <div className="animate-marquee flex gap-4 pr-4">
          {listItems.map(([symbol, ticker], i) => (
            <TickerItem key={`${symbol}-${i}`} symbol={symbol} ticker={ticker} />
          ))}
          {listItems.map(([symbol, ticker], i) => (
            <TickerItem key={`${symbol}-dup-${i}`} symbol={symbol} ticker={ticker} />
          ))}
        </div>
      </div>
    </div>
  );
}
