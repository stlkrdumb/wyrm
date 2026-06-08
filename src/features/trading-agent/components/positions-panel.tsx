"use client";

import { Card, CardHeader, CardTitle } from "@/shared/ui";
import type { PositionData } from "../hooks/use-agent";

interface Props {
  positions: PositionData[];
  cash: number;
}

export function PositionsPanel({ positions, cash }: Props) {
  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Positions ({positions.length})</CardTitle>
        </CardHeader>
        <div className="text-sm text-zinc-500 py-8 text-center">No active positions — agent needs to trade first</div>
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
              <th className="text-left py-2 font-medium">Symbol</th>
              <th className="text-left py-2 font-medium">Side</th>
              <th className="text-right py-2 font-medium">Size</th>
              <th className="text-right py-2 font-medium">Entry</th>
              <th className="text-right py-2 font-medium">PnL</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.symbol} className="border-b border-zinc-800/50 last:border-0">
                <td className="py-2 font-medium text-zinc-100">{p.symbol}</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${p.side === "long" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                    {p.side.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums text-zinc-300">{p.size.toFixed(4)}</td>
                <td className="py-2 text-right tabular-nums text-zinc-400">${p.entryPrice.toLocaleString()}</td>
                <td className={`py-2 text-right tabular-nums font-medium ${p.unrealizedPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {p.unrealizedPnL >= 0 ? "+" : ""}${p.unrealizedPnL.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
