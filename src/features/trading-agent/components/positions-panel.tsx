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
      <Card>
        <CardHeader>
          <CardTitle>Spot Holdings (0)</CardTitle>
          <span className="text-[12px] tracking-widest text-zinc-500 font-mono">PORTFOLIO ASSETS</span>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-[12px] font-mono text-zinc-500 tracking-wide uppercase">
            <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-empty-pulse mr-2" />
            No holdings active — awaiting entry signals
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spot Positions ({positions.length})</CardTitle>
        <span className="text-[12px] tracking-widest text-zinc-500 font-mono">PORTFOLIO ASSETS</span>
      </CardHeader>
      <CardContent>
        <div className="overflow-y-auto scrollbar-none max-h-[240px]">
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">Asset</th>
                <th className="text-right">Holdings</th>
                <th className="text-right">Avg Price</th>
                <th className="text-right">Value</th>
                <th className="text-right">Unrealized PnL</th>
              </tr>
            </thead>
            <tbody>
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
                  <tr key={p.symbol}>
                    <td className="font-bold text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span>{p.symbol}</span>
                        <Badge variant="neutral" className="text-[10px]">SPOT</Badge>
                      </div>
                    </td>
                    <td className="text-right tabular-nums text-zinc-300">{p.size.toFixed(4)}</td>
                    <td className="text-right tabular-nums text-zinc-500">${p.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="text-right tabular-nums text-zinc-200 font-semibold">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={`text-right tabular-nums font-bold ${
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
