"use client";

import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";
import type { PositionData, MultiTickerState } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  positions: PositionData[];
  tickers: MultiTickerState | null;
}

export function PositionsPanel({ positions, tickers }: Props) {
  if (positions.length === 0) {
    return (
      <Card className="h-[300px]">
        <CardHeader>
          <CardTitle>Spot Holdings (0)</CardTitle>
          <span className="text-[10px] tracking-widest text-zinc-500 font-mono">PORTFOLIO ASSETS</span>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-full text-[11px] font-mono text-zinc-500 tracking-wide uppercase">
            No holdings active • awaiting entry signals
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[300px]">
      <CardHeader>
        <CardTitle>Spot Positions ({positions.length})</CardTitle>
        <span className="text-[10px] tracking-widest text-zinc-500 font-mono">PORTFOLIO ASSETS</span>
      </CardHeader>
      <CardContent>
        <div className="h-full overflow-y-auto scrollbar-none">
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-10">
              <tr className="text-zinc-500 text-left border-b border-zinc-800/80 pb-2">
                <th className="py-2 font-bold uppercase tracking-wider">Asset</th>
                <th className="text-right py-2 font-bold uppercase tracking-wider">Holdings</th>
                <th className="text-right py-2 font-bold uppercase tracking-wider">Avg Price</th>
                <th className="text-right py-2 font-bold uppercase tracking-wider">Value</th>
                <th className="text-right py-2 font-bold uppercase tracking-wider">Unrealized PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {positions.map((p) => {
                const symTicker = tickers?.[p.symbol];
                const currentPrice = symTicker?.lastPrice ?? p.entryPrice;
                const currentValue = p.size * currentPrice;
                const rawPnl = p.unrealizedPnL !== undefined ? p.unrealizedPnL : currentValue - (p.size * p.entryPrice);
                const displayedPnl = Math.round(rawPnl * 100) / 100;
                const pnlString = displayedPnl === 0
                  ? "$0.00"
                  : (displayedPnl > 0 ? "+" : "-") + "$" + Math.abs(displayedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                return (
                  <tr key={p.symbol} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-900/20 transition-all duration-150">
                    <td className="py-2.5 font-bold text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span>{p.symbol}</span>
                        <Badge variant="neutral" className="text-[8px]">SPOT</Badge>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-zinc-300">{p.size.toFixed(4)}</td>
                    <td className="py-2.5 text-right tabular-nums text-zinc-500">${p.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 text-right tabular-nums text-zinc-200 font-semibold">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={`py-2.5 text-right tabular-nums font-bold ${
                      displayedPnl === 0 ? "text-zinc-500" : displayedPnl > 0 ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      {pnlString}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
