"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/shared/ui";
import type { TickerData } from "../hooks/use-agent";

interface Props {
  tickers: Record<string, TickerData | null> | null;
}

function PriceChangeBadge({ change }: { change: number }) {
  const isPos = change >= 0;
  return (
    <span className={`text-[10px] font-mono font-bold tabular-nums ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
      {isPos ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
    </span>
  );
}

function TickerRow({ symbol, ticker }: { symbol: string; ticker: TickerData }) {
  const prevPriceRef = useRef<number>(ticker.lastPrice);
  const [flashClass, setFlashClass] = useState<string>("");

  useEffect(() => {
    if (ticker.lastPrice > prevPriceRef.current) {
      setFlashClass("flash-up");
      const t = setTimeout(() => setFlashClass(""), 1000);
      prevPriceRef.current = ticker.lastPrice;
      return () => clearTimeout(t);
    } else if (ticker.lastPrice < prevPriceRef.current) {
      setFlashClass("flash-down");
      const t = setTimeout(() => setFlashClass(""), 1000);
      prevPriceRef.current = ticker.lastPrice;
      return () => clearTimeout(t);
    }
  }, [ticker.lastPrice]);

  const priceStr = `$${ticker.lastPrice.toLocaleString()}`;

  return (
    <div className={`px-4 py-2.5 flex items-center justify-between hover:bg-emerald-950/15 border-b border-emerald-950/20 last:border-0 transition-colors duration-150 ${flashClass}`}>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-emerald-400 text-xs w-20">{symbol}</span>
        <PriceChangeBadge change={ticker.change24hPercent} />
      </div>

      <div className="flex items-center gap-5 text-xs tabular-nums">
        <div className="text-right">
          <div className="text-emerald-300 font-bold glow-green">{priceStr}</div>
          <div className="text-emerald-800 text-[9px] h-3.5 flex items-end justify-end">
            {ticker.volume24h > 1e9
              ? `$${(ticker.volume24h / 1e9).toFixed(1)}B`
              : ticker.volume24h > 1e6
                ? `$${(ticker.volume24h / 1e6).toFixed(1)}M`
                : `$${Math.round(ticker.volume24h / 1e3)}K`}
          </div>
        </div>

        <div className="text-right min-w-[90px]">
          <div className="text-emerald-700/60 text-[9px] uppercase tracking-wide">Range</div>
          <div className="text-emerald-500/80 text-[10px] leading-tight">
            ${ticker.low24h.toLocaleString()}–${ticker.high24h.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketWatch({ tickers }: Props) {
  if (!tickers || Object.keys(tickers).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Feed</CardTitle>
        </CardHeader>
        <div className="text-xs text-emerald-700 py-6 text-center cursor-blink">Loading price feeds</div>
      </Card>
    );
  }

  const entries = Object.entries(tickers).filter(([, t]) => t !== null) as [string, TickerData][];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Active Market Feed</span>
          <span className="text-[10px] text-emerald-600 font-mono tracking-widest uppercase">
            Live WS
          </span>
        </CardTitle>
      </CardHeader>
      <div className="max-h-[200px] overflow-y-auto divide-y divide-emerald-950/20">
        {entries.map(([symbol, ticker]) => (
          <TickerRow key={symbol} symbol={symbol} ticker={ticker} />
        ))}
      </div>
    </Card>
  );
}
