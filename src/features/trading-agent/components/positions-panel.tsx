"use client";

import { Card, CardHeader, CardTitle } from "@/shared/ui";
import type { PositionData, MultiTickerState } from "../hooks/use-agent";

interface Props {
  positions: PositionData[];
  tickers: MultiTickerState | null;
}

export function PositionsPanel({ positions, tickers }: Props) {
  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="glow-green">Spot Holdings</CardTitle>
        </CardHeader>
        <div className="text-xs text-emerald-800 py-8 text-center cursor-blink">
          No holdings in database — standby for signals
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="glow-green">Spot Holdings ({positions.length})</CardTitle>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-emerald-700 text-left border-b border-emerald-950/60 pb-2">
              <th className="py-2.5 font-bold uppercase tracking-widest">Asset</th>
              <th className="text-right py-2.5 font-bold uppercase tracking-widest">Holdings</th>
              <th className="text-right py-2.5 font-bold uppercase tracking-widest">Avg Price</th>
              <th className="text-right py-2.5 font-bold uppercase tracking-widest">Value</th>
              <th className="text-right py-2.5 font-bold uppercase tracking-widest">Unrealized</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const symTicker = tickers?.[p.symbol];
              const currentPrice = symTicker?.lastPrice ?? p.entryPrice;
              const currentValue = p.size * currentPrice;

              const displayedPnl = p.unrealizedPnL !== undefined ? p.unrealizedPnL : currentValue - (p.size * p.entryPrice);

              return (
                <tr key={p.symbol} className="border-b border-emerald-950/20 last:border-0 hover:bg-emerald-950/5 transition-all duration-150">
                  <td className="py-3 font-semibold text-emerald-400">
                    <div className="flex items-center gap-2">
                      <span>{p.symbol}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider uppercase border bg-emerald-950/20 text-emerald-400 border-emerald-950/40">
                        Spot
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-right tabular-nums text-zinc-300">{p.size.toFixed(4)}</td>
                  <td className="py-3 text-right tabular-nums text-zinc-500">${p.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="py-3 text-right tabular-nums text-zinc-100 font-semibold">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={`py-3 text-right tabular-nums font-bold ${
                    displayedPnl === 0 ? "text-zinc-500" :
                    displayedPnl > 0 ? "text-emerald-400 glow-green" : "text-rose-400 glow-rose"
                  }`}>
                    {displayedPnl === 0 ? "$0.00" : `${displayedPnl >= 0 ? "+" : ""}$${Math.abs(displayedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
