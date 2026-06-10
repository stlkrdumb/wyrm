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
          <span className="text-[10px] tracking-widest text-phosphor-muted font-mono">PORTFOLIO ASSETS</span>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-full text-[11px] font-mono text-phosphor-dim tracking-wide uppercase">
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
        <span className="text-[10px] tracking-widest text-phosphor-muted font-mono">PORTFOLIO ASSETS</span>
      </CardHeader>
      <CardContent>
        <div className="h-full overflow-y-auto scrollbar-none">
          <table className="w-full text-[11px] font-mono terminal-table">
            <thead className="sticky top-0 bg-[#080808]/90 backdrop-blur-sm z-10">
              <tr className="text-phosphor-muted text-left border-b border-amber-900/20 pb-2">
                <th className="py-2 font-bold uppercase tracking-wider">Asset</th>
                <th className="text-right py-2 font-bold uppercase tracking-wider">Holdings</th>
                <th className="text-right py-2 font-bold uppercase tracking-wider">Avg Price</th>
                <th className="text-right py-2 font-bold uppercase tracking-wider">Value</th>
                <th className="text-right py-2 font-bold uppercase tracking-wider">Unrealized PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-900/10">
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
                  <tr key={p.symbol} className="border-b border-amber-900/10 last:border-0 hover:bg-amber-500/[0.03] transition-all duration-150">
                    <td className="py-2.5 font-bold text-phosphor">
                      <div className="flex items-center gap-2">
                        <span>{p.symbol}</span>
                        <Badge variant="neutral" className="text-[8px]">SPOT</Badge>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-amber-100/70">{p.size.toFixed(4)}</td>
                    <td className="py-2.5 text-right tabular-nums text-phosphor-dim">${p.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 text-right tabular-nums text-amber-100/90 font-semibold">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={`py-2.5 text-right tabular-nums font-bold ${
                      displayedPnl === 0 ? "text-phosphor-dim" : displayedPnl > 0 ? "text-phosphor-green phosphor-glow-green" : "text-phosphor-red phosphor-glow-red"
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
