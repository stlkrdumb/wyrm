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
          <CardTitle>Active Positions ({positions.length})</CardTitle>
        </CardHeader>
        <div className="text-sm text-zinc-500 py-8 text-center">No holdings yet — start the agent to begin trading</div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Positions ({positions.length})</CardTitle>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 text-xs border-b border-zinc-800">
              <th className="text-left py-2 font-medium">Asset</th>
              <th className="text-right py-2 font-medium">Holdings</th>
              <th className="text-right py-2 font-medium">Avg Buy Price</th>
              <th className="text-right py-2 font-medium">Value</th>
              <th className="text-right py-2 font-medium">Unrealized</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              // Look up per-symbol ticker for current price and value
              const symTicker = tickers?.[p.symbol];
              const currentPrice = symTicker?.lastPrice ?? p.entryPrice; // fallback to entry if no live price
              const currentValue = p.size * currentPrice;

              // Use backend-provided unrealizedPnL as primary, calculate as fallback
              const displayedPnl = p.unrealizedPnL !== undefined ? p.unrealizedPnL : currentValue - (p.size * p.entryPrice);

              return (
                <tr key={p.symbol} className="border-b border-zinc-800/50 last:border-0">
                  <td className="py-2 font-medium text-zinc-100">{p.symbol}</td>
                  <td className="py-2 text-right tabular-nums text-zinc-300">{p.size.toFixed(4)}</td>
                  <td className="py-2 text-right tabular-nums text-zinc-400">${p.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="py-2 text-right tabular-nums text-zinc-200 font-medium">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={`py-2 text-right tabular-nums font-medium ${displayedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {displayedPnl >= 0 ? "+" : ""}${displayedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
