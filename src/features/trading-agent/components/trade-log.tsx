"use client";

import { Card, CardHeader, CardTitle } from "@/shared/ui";
import type { TradeData, PortfolioData } from "../hooks/use-agent";

interface Props {
  trades: TradeData[];
  portfolio: PortfolioData;
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function ActionBadge({ action }: { action: string }) {
  const style = {
    entry: "bg-amber-500/20 text-amber-400",
    exit: "bg-red-500/20 text-red-400",
    add: "bg-emerald-500/20 text-emerald-400",
    reduce: "bg-orange-500/20 text-orange-400",
  }[action] || "bg-zinc-700 text-zinc-400";

  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${style}`}>{action}</span>;
}

export function TradeLog({ trades, portfolio }: Props) {
  const hasTrades = trades.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Trade Log</CardTitle>
          <span className="text-xs text-zinc-500">{portfolio.totalTrades} trades</span>
        </div>
      </CardHeader>

      {hasTrades ? (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 -mr-1">
          {[...trades].reverse().map((t) => (
            <TradeRow key={t.id} trade={t} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-zinc-500 py-8 text-center">No trades yet — start the agent to begin</div>
      )}

      {portfolio.totalTrades > 0 && (
        <Summary portfolio={portfolio} />
      )}
    </Card>
  );
}

function TradeRow({ trade }: { trade: TradeData }) {
  const isBuy = trade.side === "buy";
  const pnlDisplay = trade.pnl !== null;
  const pnlPositive = trade.pnl !== null && trade.pnl >= 0;

  return (
    <div className="group rounded-lg bg-zinc-800/40 hover:bg-zinc-800/70 border border-transparent hover:border-zinc-700/50 p-3 transition-all">
      {/* Top row: symbol + badge */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-100 text-sm">{trade.symbol}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isBuy ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
            {trade.side.toUpperCase()}
          </span>
          <ActionBadge action={trade.action} />
        </div>
        <span className="text-[10px] text-zinc-600">{formatRelative(trade.timestamp)}</span>
      </div>

      {/* Bottom row: price × size */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs tabular-nums text-zinc-400">
          <span>${trade.price.toLocaleString()}</span>
          <span className="text-zinc-600">×</span>
          <span>{trade.size.toFixed(4)}</span>
        </div>

        {pnlDisplay && (
          <span className={`text-xs font-semibold tabular-nums ${pnlPositive ? "text-emerald-400" : "text-red-400"}`}>
            {pnlPositive ? "+" : ""}${trade.pnl!.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

function Summary({ portfolio }: { portfolio: PortfolioData }) {
  const pnl = Math.round(portfolio.totalPnL);
  const pnlPositive = pnl >= 0;

  return (
    <div className="mt-3 pt-2 border-t border-zinc-800 grid grid-cols-3 gap-2 text-xs">
      <div>
        <span className="text-zinc-500 block">Total Trades</span>
        <span className="font-semibold text-zinc-100 tabular-nums">{portfolio.totalTrades}</span>
      </div>
      <div>
        <span className="text-zinc-500 block">Win Rate</span>
        <span className={`font-semibold tabular-nums ${portfolio.winRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
          {portfolio.winRate.toFixed(0)}%
        </span>
      </div>
      <div>
        <span className="text-zinc-500 block">Total PnL</span>
        <span className={`font-semibold tabular-nums ${pnlPositive ? "text-emerald-400" : "text-red-400"}`}>
          {pnlPositive ? "+" : ""}${Math.abs(pnl).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
