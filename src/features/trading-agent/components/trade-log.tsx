"use client";

import { memo } from "react";
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
  const label: Record<string, string> = {
    entry: "Buy",
    exit: "Sell",
    add: "Buy More",
    reduce: "Partial Sell",
  };
  const style: Record<string, string> = {
    entry: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
    add: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
    exit: "bg-rose-500/10 text-rose-400 border border-rose-500/30",
    reduce: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
  };

  return (
    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${style[action] || "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}>
      {label[action] ?? action}
    </span>
  );
}

export const TradeLog = memo(function TradeLog({ trades, portfolio }: Props) {
  const hasTrades = trades.length > 0;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between w-full">
          <CardTitle className="glow-green">System Logs</CardTitle>
          <span className="text-[10px] text-emerald-700 font-mono">
            COUNT: {portfolio.totalTrades}
          </span>
        </div>
      </CardHeader>

      <div className="flex-1 min-h-0">
        {hasTrades ? (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 -mr-1 font-mono text-xs">
            {[...trades].reverse().map((t) => (
              <TradeRow key={t.id} trade={t} />
            ))}
          </div>
        ) : (
          <div className="text-xs text-emerald-800 py-8 text-center cursor-blink">
            SYSTEM IDLE: Awaiting trades...
          </div>
        )}
      </div>

      {portfolio.totalTrades > 0 && (
        <Summary portfolio={portfolio} />
      )}
    </Card>
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
  const pnlPositive = trade.pnl !== null && trade.pnl >= 0;

  // Extract base currency from symbol (e.g. BTCUSDT → BTC, ETHBTC → ETH)
  const quoteCurrency = trade.symbol.replace(/[A-Z]{4}$/, "") || "USD";

  return (
    <div className="group rounded border border-emerald-950/40 bg-zinc-950 p-2.5 hover:border-emerald-500/30 transition-all duration-150">
      {/* Top row: symbol + badge */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-emerald-300 text-xs">{trade.symbol}</span>
          <ActionBadge action={trade.action} />
        </div>
        <span className="text-[9px] text-emerald-800">{formatRelative(trade.timestamp)}</span>
      </div>

      {/* Bottom row: price × size */}
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 tabular-nums text-zinc-400">
          <span>Qty: {trade.size.toFixed(4)} {quoteCurrency}</span>
          <span className="text-emerald-900">@</span>
          <span className="text-zinc-300">${trade.price.toLocaleString()}</span>
        </div>

        {pnlDisplay && (
          <span className={`font-bold tabular-nums ${pnlPositive ? "text-emerald-400 glow-green" : "text-rose-400 glow-rose"}`}>
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
    <div className="mt-3 pt-2.5 border-t border-emerald-950/60 grid grid-cols-3 gap-2 text-xs font-mono text-center">
      <div className="bg-zinc-950/40 py-1.5 rounded border border-emerald-950/40">
        <span className="text-emerald-800 text-[9px] uppercase tracking-wider block">Trades</span>
        <span className="font-bold text-zinc-100 tabular-nums">{portfolio.totalTrades}</span>
      </div>
      <div className="bg-zinc-950/40 py-1.5 rounded border border-emerald-950/40">
        <span className="text-emerald-800 text-[9px] uppercase tracking-wider block">Win Rate</span>
        <span className={`font-bold tabular-nums ${portfolio.winRate >= 50 ? "text-emerald-400 glow-green" : "text-rose-400 glow-rose"}`}>
          {portfolio.winRate.toFixed(0)}%
        </span>
      </div>
      <div className="bg-zinc-950/40 py-1.5 rounded border border-emerald-950/40">
        <span className="text-emerald-800 text-[9px] uppercase tracking-wider block">PnL</span>
        <span className={`font-bold tabular-nums ${pnlPositive ? "text-emerald-400 glow-green" : "text-rose-400 glow-rose"}`}>
          {pnlPositive ? "+" : ""}${Math.abs(pnl).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
