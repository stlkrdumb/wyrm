"use client";

import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";
import { Clock } from "lucide-react";
import type { PendingOrderData } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  pendingOrders: PendingOrderData[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

export function PendingOrdersPanel({ pendingOrders }: Props) {
  if (pendingOrders.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Orders ({pendingOrders.length})</CardTitle>
        <span className="text-[12px] tracking-widest text-zinc-500 font-mono">LIMIT ORDERS</span>
      </CardHeader>
      <CardContent>
        <div className="overflow-y-auto scrollbar-none max-h-[160px]">
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">Asset</th>
                <th className="text-right">Side</th>
                <th className="text-right">Limit</th>
                <th className="text-right">Size</th>
                <th className="text-right">Age</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map((o) => (
                <tr key={o.id}>
                  <td className="font-bold text-zinc-100">
                    <div className="flex items-center gap-2">
                      <span>{o.symbol}</span>
                      <Badge variant="neutral" className="text-[10px]">LIMIT</Badge>
                    </div>
                  </td>
                  <td className="text-right">
                    <Badge variant={o.side === "buy" ? "success" : "danger"} className="text-[10px]">
                      {o.side.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="text-right tabular-nums text-zinc-300 font-semibold">
                    ${o.limitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="text-right tabular-nums text-zinc-500">{o.size.toFixed(4)}</td>
                  <td className="text-right text-zinc-500 flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3" />
                    <span className="tabular-nums text-[11px]">{timeAgo(o.createdAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
