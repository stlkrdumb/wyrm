"use client";

import { memo, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";
import type { PositionData, MultiTickerState } from "@/features/trading-agent/hooks/use-agent";
import { useAnimatedNumber } from "@/features/trading-agent/hooks/use-animated-number";
import { apiFetch } from "@/shared/utils/api-fetch";

interface Props {
  positions: PositionData[];
  tickers: MultiTickerState | null;
  everConnected?: boolean;
  onClosePosition?: () => void;
}

const AnimatedPnL = memo(function AnimatedPnL({ value, everConnected }: { value: number; everConnected: boolean }) {
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
});

export const PositionsPanel = memo(function PositionsPanel({ positions, tickers, everConnected = true, onClosePosition }: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/status")
      .then(res => res.json())
      .then(data => setIsAdmin(!!data.authenticated))
      .catch(() => setIsAdmin(false));
  }, []);

  const handleClose = async (symbol: string) => {
    if (!confirm(`Are you sure you want to flat and liquidate your manual position on ${symbol}?`)) {
      return;
    }

    setClosingSymbol(symbol);
    try {
      const res = await apiFetch("/api/agent/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (res.ok) {
        onClosePosition?.();
      } else {
        const data = await res.json();
        alert(data.message || "Failed to close position");
      }
    } catch (err) {
      console.error("Manual close error:", err);
      alert("Error closing position");
    } finally {
      setClosingSymbol(null);
    }
  };

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
      <CardContent className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
        <div className="overflow-x-auto scrollbar-none w-full">
          <div className="min-w-[500px]">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left">Asset</th>
                  <th className="text-right">Holdings</th>
                  <th className="text-right">Avg Price</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Unrealized PnL</th>
                  {isAdmin && <th className="text-center w-20">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const symTicker = tickers?.[p.symbol];
                  const currentPrice = symTicker?.lastPrice ?? p.entryPrice;
                  const currentValue = p.size * currentPrice;
                  const isClosing = closingSymbol === p.symbol;

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
                      {isAdmin && (
                        <td className="text-center">
                          <button
                            onClick={() => handleClose(p.symbol)}
                            disabled={isClosing}
                            className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-400 border border-rose-500/20 hover:border-rose-400 text-[10px] font-mono font-bold tracking-wider uppercase rounded-sm transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                          >
                            {isClosing ? "CLOSING" : "CLOSE"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});