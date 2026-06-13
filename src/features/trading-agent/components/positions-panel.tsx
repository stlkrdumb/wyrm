"use client";

import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";
import type { PositionData, MultiTickerState } from "@/features/trading-agent/hooks/use-agent";
import { useAnimatedNumber } from "@/features/trading-agent/hooks/use-animated-number";

interface Props {
  positions: PositionData[];
  tickers: MultiTickerState | null;
  everConnected?: boolean;
}

function AnimatedPnL({ value, everConnected }: { value: number; everConnected: boolean }) {
  const animated = useAnimatedNumber(value);
  const isProfit = animated >= 0;

  if (!everConnected) {
    return <span className="text-zinc-600">—</span>;
  }

  if (Math.abs(animated) < 0.005) {
    return <span className="text-zinc-500">$0.00</span>;
  }

  return (
    <span className={isProfit ? "text-emerald-400" : "text-rose-400"}>
      {isProfit ? "+" : "-"}${Math.abs(animated).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function PositionsPanel({ positions, tickers, everConnected = true }: Props) {
  if (positions.length === 0) {
    return (
      <Card className="flex flex-col h-full">
        <CardHeader>
          <CardTitle>Spot Holdings (0)</CardTitle>
          <span className="text-[12px] tracking-widest text-zinc-500 font-mono">PORTFOLIO ASSETS</span>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="flex items-center justify-center py-8 text-[12px] font-mono text-zinc-500 tracking-wide uppercase">
            <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-empty-pulse mr-2" />
            No holdings active — awaiting entry signals
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Spot Positions ({positions.length})</CardTitle>
        <span className="text-[12px] tracking-widest text-zinc-500 font-mono">PORTFOLIO ASSETS</span>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <div className="overflow-y-auto scrollbar-none h-full">
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

                return (
                  <tr key={p.symbol}>
                    <td className="font-bold text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span>{p.symbol}</span>
                        <Badge variant="neutral" className="text-[10px]">SPOT</Badge>
                      </div>
                    </td>
                    <td className="text-right tabular-nums text-zinc-300">{p.size.toFixed(4)}</td>
                    <td className="text-right tabular-nums">
                      <div className="text-zinc-500">${p.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </td>
                    <td className="text-right tabular-nums text-zinc-200 font-semibold">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="text-right tabular-nums font-bold">
                      <AnimatedPnL value={p.unrealizedPnL} everConnected={everConnected} />
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