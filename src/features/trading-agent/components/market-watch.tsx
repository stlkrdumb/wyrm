"use client";

import { Card, CardHeader, CardTitle } from "@/shared/ui";
import type { TickerData } from "../hooks/use-agent";

interface Props {
  tickers: Record<string, TickerData | null> | null;
}

function PriceChangeBadge({ change }: { change: number }) {
  const isPos = change >= 0;
  return (
    <span className={`text-xs font-mono tabular-nums ${isPos ? "text-emerald-400" : "text-red-400"}`}>
      {isPos ? "+" : ""}{change.toFixed(2)}%
    </span>
  );
}

export function MarketWatch({ tickers }: Props) {
  if (!tickers || Object.keys(tickers).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Watch</CardTitle>
        </CardHeader>
        <div className="text-sm text-zinc-500 py-6 text-center">No symbols loaded — check TRADING_SYMBOLS env var</div>
      </Card>
    );
  }

  const entries = Object.entries(tickers).filter(([, t]) => t !== null) as [string, TickerData][];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Watch ({entries.length})</CardTitle>
      </CardHeader>
      <div className="divide-y divide-zinc-800/50">
        {entries.map(([symbol, ticker]) => {
          if (!ticker) return null;
          const priceStr = `$${ticker.lastPrice.toLocaleString()}`;

          return (
            <div key={symbol} className="px-4 py-2.5 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-center gap-3">
                <span className="font-medium text-zinc-100 text-sm w-20">{symbol}</span>
                <PriceChangeBadge change={ticker.change24hPercent} />
              </div>

              <div className="flex items-center gap-5 text-xs tabular-nums">
                <div className="text-right">
                  <div className="text-zinc-100 font-medium">{priceStr}</div>
                  <div className="text-zinc-600 h-3.5 flex items-end">
                    {ticker.volume24h > 1e9
                      ? `$${(ticker.volume24h / 1e9).toFixed(1)}B`
                      : ticker.volume24h > 1e6
                        ? `$${(ticker.volume24h / 1e6).toFixed(1)}M`
                        : `$${Math.round(ticker.volume24h / 1e3)}K`}
                  </div>
                </div>

                <div className="text-right min-w-[80px]">
                  <div className="text-zinc-500 text-[10px] uppercase tracking-wide">Range</div>
                  <div className="text-zinc-300 font-mono tabular-nums text-xs leading-tight">
                    ${ticker.low24h.toLocaleString()}–${ticker.high24h.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
