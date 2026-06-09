"use client";

import { memo } from "react";
import type { TradeData, PortfolioData } from "@/features/trading-agent/hooks/use-agent";

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function ActionBadge({ action }: { action: string }) {
  const label: Record<string, string> = {
    entry: "Buy",
    exit: "Sell",
    add: "Buy More",
    reduce: "Partial Sell",
  };
  const style: Record<string, string> = {
    entry: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    add: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    exit: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
    reduce: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  };

  return (
    <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-widest ${style[action] || "bg-zinc-900 text-zinc-500 border border-zinc-800"}`}>
      {label[action] ?? action}
    </span>
  );
}

export const TradeLog = memo(function TradeLog({ trades, portfolio, isTabMode }: { trades: TradeData[]; portfolio: PortfolioData; isTabMode?: boolean }) {
  const hasTrades = trades.length > 0;

  const content = (
    <>
      {/* Logs list */}
      <div className="flex-grow overflow-y-auto scrollbar-none pr-1 -mr-1 mt-2">
        {hasTrades ? (
          <div className="flex flex-col gap-2 font-mono">
            {[...trades].reverse().map((t) => (
              <TradeRow key={t.id} trade={t} />
            ))}
          </div>
        ) : (
          <div className="text-[11px] font-mono text-zinc-500 py-12 text-center tracking-wide uppercase">
            Awaiting execution logs • system idle
          </div>
        )}
      </div>

      {portfolio.totalTrades > 0 && (
        <Summary portfolio={portfolio} />
      )}
    </>
  );

  if (isTabMode) {
    return <div className="flex-grow flex flex-col justify-between overflow-hidden">{content}</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">Activity Logs</span>
        <span className="text-[10px] tracking-widest text-zinc-500 font-mono">
          COUNT: {portfolio.totalTrades}
        </span>
      </div>
      {content}
    </div>
  );
}, (prev, next) => {
  return (
    prev.trades.length === next.trades.length &&
    prev.portfolio.totalTrades === next.portfolio.totalTrades &&
    prev.portfolio.totalPnL === next.portfolio.totalPnL &&
    prev.portfolio.winRate === next.portfolio.winRate
  );
});

function TradeRow({ trade }: { trade: TradeData }) {
  const pnlDisplay = trade.pnl !== null;
  const pnl = trade.pnl ?? 0;
  const pnlPositive = pnl > 0;

  const quoteCurrency = trade.symbol.replace(/[A-Z]{4}$/, "") || "USD";

  return (
    <div className="group rounded border border-zinc-900 bg-zinc-950 p-2.5 hover:border-zinc-800 transition-all duration-150">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-100 text-[11px]">{trade.symbol}</span>
          <ActionBadge action={trade.action} />
        </div>
        <span className="text-[9px] text-zinc-550">{formatRelative(trade.timestamp)}</span>
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5 tabular-nums text-zinc-450">
          <span className="text-[9px] font-bold uppercase text-zinc-550">Qty</span>
          <span className="text-zinc-200 font-bold">{trade.size.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
          <span className="text-zinc-650">@</span>
          <span className="text-zinc-200">${trade.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        {pnlDisplay && (
          <span className={`font-bold tabular-nums ${pnlPositive ? "text-emerald-400" : pnl < 0 ? "text-rose-400" : "text-zinc-400"}`}>
            {pnl === 0 ? "$0.00" : (pnl > 0 ? "+" : "-") + "$" + Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
    </div>
  );
}

function Summary({ portfolio }: { portfolio: PortfolioData }) {
  const pnl = portfolio.totalPnL;
  const pnlPositive = pnl > 0;

  return (
    <div className="mt-2 pt-3 border-t border-zinc-900 grid grid-cols-3 gap-2 text-[10px] font-mono">
      <div className="bg-zinc-950/40 py-1.5 rounded border border-zinc-900">
        <span className="text-zinc-500 text-[8px] uppercase tracking-wider block">Trades</span>
        <span className="font-bold text-zinc-200 tabular-nums">{portfolio.totalTrades}</span>
      </div>
      <div className="bg-zinc-950/40 py-1.5 rounded border border-zinc-900">
        <span className="text-zinc-500 text-[8px] uppercase tracking-wider block">Win Rate</span>
        <span className={`font-bold tabular-nums ${portfolio.winRate >= 50 ? "text-emerald-450" : "text-rose-450"}`}>
          {portfolio.winRate.toFixed(0)}%
        </span>
      </div>
      <div className="bg-zinc-950/40 py-1.5 rounded border border-zinc-900">
        <span className="text-zinc-500 text-[8px] uppercase tracking-wider block">Realized PnL</span>
        <span className={`font-bold tabular-nums ${pnlPositive ? "text-emerald-450" : pnl < 0 ? "text-rose-450" : "text-zinc-450"}`}>
          {pnl === 0 ? "$0.00" : (pnl > 0 ? "+" : "-") + "$" + Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}
