"use client";

import { memo } from "react";
import { Badge } from "@/shared/ui";
import type { TradeData, PortfolioData } from "@/features/trading-agent/hooks/use-agent";

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

const actionBadgeVariant = (action: string): "success" | "danger" | "warning" | "neutral" => {
  switch (action) {
    case "entry": return "success";
    case "add": return "success";
    case "exit": return "danger";
    case "reduce": return "warning";
    default: return "neutral";
  }
};

const actionLabel: Record<string, string> = {
  entry: "Buy", exit: "Sell", add: "Buy More", reduce: "Partial Sell",
};

export const TradeLog = memo(function TradeLog({ trades, portfolio, isTabMode }: { trades: TradeData[]; portfolio: PortfolioData; isTabMode?: boolean }) {
  const hasTrades = trades.length > 0;

  const content = (
    <>
      <div className="flex-grow overflow-y-auto scrollbar-none pr-1 -mr-1 mt-2">
        {hasTrades ? (
          <div className="flex flex-col gap-2 font-mono">
            {[...trades].reverse().map((t) => (
              <TradeRow key={t.id} trade={t} />
            ))}
          </div>
        ) : (
          <div className="relative flex items-center justify-center py-12 overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }} />
            <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent animate-scan-line" />
            <div className="relative z-10 flex flex-col items-center gap-2 text-[11px] font-mono text-zinc-500 tracking-wide uppercase">
              <div className="w-2 h-2 rounded-full bg-white/30 animate-empty-pulse" />
              <span>Awaiting execution logs • system idle</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/60 mt-1 flex-shrink-0 font-mono">
        <div className="flex gap-3 text-[10px] text-zinc-500">
          <span>TOTAL: <strong className="text-zinc-300">{portfolio.totalTrades}</strong></span>
          <span>WIN RATE: <strong className={portfolio.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}>
            {portfolio.winRate.toFixed(1)}%
          </strong></span>
        </div>
        <span className={`text-[10px] font-bold tabular-nums ${portfolio.totalPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {portfolio.totalPnL >= 0 ? "+" : ""}${portfolio.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>
    </>
  );

  if (isTabMode) return <div className="flex flex-col h-full">{content}</div>;

  return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">Execution Log</span>
      </div>
      {content}
    </div>
  );
});

function TradeRow({ trade }: { trade: TradeData }) {
  const pnlDisplay = trade.pnl !== null && trade.pnl !== undefined;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/30 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <Badge variant={actionBadgeVariant(trade.action)} className="text-[8px] px-1.5">
          {actionLabel[trade.action] ?? trade.action}
        </Badge>
        <span className="text-[11px] text-zinc-200 font-semibold font-mono">{trade.symbol}</span>
      </div>
      <div className="flex items-center gap-3 text-[10px] font-mono tabular-nums flex-shrink-0">
        <span className="text-zinc-500">{trade.size.toFixed(4)}</span>
        <span className="text-zinc-400">${trade.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        {pnlDisplay && (
          <span className={`font-bold min-w-[4.5rem] text-right ${trade.pnl! >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {trade.pnl! >= 0 ? "+" : ""}${trade.pnl!.toFixed(2)}
          </span>
        )}
        <span className="text-zinc-600 min-w-[4rem] text-right">{formatRelative(trade.timestamp)}</span>
      </div>
    </div>
  );
}
