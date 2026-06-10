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
          <div className="text-[11px] font-mono text-phosphor-dim py-12 text-center tracking-wide uppercase">
            Awaiting execution logs • system idle
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-amber-900/20 mt-1 flex-shrink-0 font-mono">
        <div className="flex gap-3 text-[10px] text-phosphor-dim">
          <span>TOTAL: <strong className="text-amber-100/70">{portfolio.totalTrades}</strong></span>
          <span>WIN RATE: <strong className={portfolio.winRate >= 50 ? "text-phosphor-green" : "text-phosphor-red"}>
            {portfolio.winRate.toFixed(1)}%
          </strong></span>
        </div>
        <span className={`text-[10px] font-bold tabular-nums ${portfolio.totalPnL >= 0 ? "text-phosphor-green phosphor-glow-green" : "text-phosphor-red phosphor-glow-red"}`}>
          {portfolio.totalPnL >= 0 ? "+" : ""}${portfolio.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>
    </>
  );

  if (isTabMode) return <div className="flex flex-col h-full">{content}</div>;

  return (
    <div className="flex flex-col gap-4 p-5 border border-amber-900/20 bg-[#0a0a0a]/60 backdrop-blur-md relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-amber-900/20 pb-3">
        <span className="text-[10px] tracking-widest text-phosphor-muted font-bold uppercase">Execution Log</span>
      </div>
      {content}
    </div>
  );
});

function TradeRow({ trade }: { trade: TradeData }) {
  const pnlDisplay = trade.pnl !== null && trade.pnl !== undefined;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-amber-900/10 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <Badge variant={actionBadgeVariant(trade.action)} className="text-[8px] px-1.5">
          {actionLabel[trade.action] ?? trade.action}
        </Badge>
        <span className="text-[11px] text-amber-100/80 font-semibold font-mono">{trade.symbol}</span>
      </div>
      <div className="flex items-center gap-3 text-[10px] font-mono tabular-nums flex-shrink-0">
        <span className="text-phosphor-dim">{trade.size.toFixed(4)}</span>
        <span className="text-phosphor-muted">${trade.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        {pnlDisplay && (
          <span className={`font-bold min-w-[4.5rem] text-right ${trade.pnl! >= 0 ? "text-phosphor-green phosphor-glow-green" : "text-phosphor-red phosphor-glow-red"}`}>
            {trade.pnl! >= 0 ? "+" : ""}${trade.pnl!.toFixed(2)}
          </span>
        )}
        <span className="text-phosphor-dim/50 min-w-[4rem] text-right">{formatRelative(trade.timestamp)}</span>
      </div>
    </div>
  );
}
