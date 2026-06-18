"use client";

import { memo } from "react";
import { Badge } from "@/shared/ui";
import type { TradeData, PortfolioData } from "@/features/trading-agent/hooks/use-agent";

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "--:--";
  }
}

const actionLabel: Record<string, string> = {
  entry: "BUY", exit: "SELL", add: "ADD", reduce: "REDUCE",
};

const actionColor: Record<string, string> = {
  entry: "border-l-emerald-500/40",
  exit: "border-l-rose-500/40",
  add: "border-l-emerald-500/25",
  reduce: "border-l-amber-500/25",
};

export const TradeLog = memo(function TradeLog({ trades, portfolio, isTabMode }: { trades: TradeData[]; portfolio: PortfolioData; isTabMode?: boolean }) {
  const hasTrades = trades.length > 0;
  const reversed = hasTrades ? [...trades].reverse() : [];

  const content = (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none pr-1 -mr-1 mt-2">
        {hasTrades ? (
          <div className="overflow-x-auto w-full scrollbar-none">
            <div className="min-w-[400px]">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left w-14">Time</th>
                    <th className="text-left w-14">Type</th>
                    <th className="text-left">Symbol</th>
                    <th className="text-right w-20">Size</th>
                    <th className="text-right w-24">Price</th>
                    <th className="text-right w-18">Fee</th>
                    <th className="text-right w-20">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {reversed.map((t) => {
                    const hasPnl = t.pnl !== null && t.pnl !== undefined;
                    return (
                      <tr key={t.id} className={actionColor[t.action] ?? ""}>
                        <td className="tabular-nums text-zinc-600 text-[11px]">{formatTime(t.timestamp)}</td>
                        <td>
                          <Badge variant={t.action === "entry" || t.action === "add" ? "success" : t.action === "reduce" ? "warning" : "danger"} className="text-[10px] px-1.5">
                            {actionLabel[t.action] ?? t.action}
                          </Badge>
                        </td>
                        <td className="font-bold text-zinc-100 text-[11px]">{t.symbol}</td>
                        <td className="text-right tabular-nums text-zinc-500">{t.size.toFixed(4)}</td>
                        <td className="text-right tabular-nums text-zinc-400">${t.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="text-right tabular-nums text-zinc-600">${(t.fee ?? 0).toFixed(2)}</td>
                        <td className={`text-right tabular-nums font-bold ${hasPnl ? (t.pnl! >= 0 ? "text-emerald-400" : "text-rose-400") : "text-zinc-600"}`}>
                          {hasPnl ? `${t.pnl! >= 0 ? "+" : "-"}$${Math.abs(t.pnl!).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="relative flex items-center justify-center py-6 overflow-hidden">
            <div className="relative z-10 flex flex-col items-center gap-1.5 text-[12px] font-mono text-zinc-500 tracking-wide uppercase">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-empty-pulse" />
              <span>Awaiting execution logs — system idle</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/60 mt-1 flex-shrink-0 font-mono">
        <div className="flex gap-3 text-[12px] text-zinc-500">
          <span>TOTAL: <strong className="text-zinc-300">{portfolio.totalTrades}</strong></span>
          <span>WIN RATE: <strong className={portfolio.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}>
            {portfolio.winRate.toFixed(1)}%
          </strong></span>
        </div>
        <span className={`text-[12px] font-bold tabular-nums ${portfolio.totalPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
           {portfolio.totalPnL >= 0 ? "+" : "-"}${Math.abs(portfolio.totalPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    </>
  );

  if (isTabMode) return <div className="flex flex-col flex-1 min-h-0">{content}</div>;

  return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
        <span className="text-[12px] tracking-widest text-zinc-500 font-bold uppercase">Execution Log</span>
      </div>
      {content}
    </div>
  );
});
