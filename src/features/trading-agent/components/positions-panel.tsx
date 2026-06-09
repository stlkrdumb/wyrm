"use client";

import type { PositionData, MultiTickerState } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  positions: PositionData[];
  tickers: MultiTickerState | null;
}

export function PositionsPanel({ positions, tickers }: Props) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
          <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">Spot Positions</span>
        </div>
        <div className="text-[11px] font-mono text-zinc-500 py-12 text-center tracking-wide uppercase">
          No holdings active • awaiting entry signals
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">Spot Positions ({positions.length})</span>
        <span className="text-[10px] tracking-widest text-zinc-500 font-mono">
          PORTFOLIO ASSETS
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="text-zinc-500 text-left border-b border-zinc-900/80 pb-2">
              <th className="py-2 font-bold uppercase tracking-wider">Asset</th>
              <th className="text-right py-2 font-bold uppercase tracking-wider">Holdings</th>
              <th className="text-right py-2 font-bold uppercase tracking-wider">Avg Price</th>
              <th className="text-right py-2 font-bold uppercase tracking-wider">Value</th>
              <th className="text-right py-2 font-bold uppercase tracking-wider">Unrealized PnL</th>
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
                <tr key={p.symbol} className="border-b border-zinc-900/40 last:border-0 hover:bg-zinc-900/20 transition-all duration-150">
                  <td className="py-2.5 font-bold text-zinc-100">
                    <div className="flex items-center gap-2">
                      <span>{p.symbol}</span>
                      <span className="text-[8px] px-1 py-0.2 rounded font-bold tracking-wider uppercase border bg-zinc-900 text-zinc-400 border-zinc-850">
                        SPOT
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-zinc-300">{p.size.toFixed(4)}</td>
                  <td className="py-2.5 text-right tabular-nums text-zinc-500">${p.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="py-2.5 text-right tabular-nums text-zinc-200 font-semibold">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={`py-2.5 text-right tabular-nums font-bold ${
                    displayedPnl === 0 ? "text-zinc-500" :
                    displayedPnl > 0 ? "text-emerald-400" : "text-rose-400"
                  }`}>
                    {pnlString}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
