"use client";

import { useAgent } from "@/features/trading-agent/hooks/use-agent";
import { StatusHeader } from "./status-header";
import { SignalPanel } from "./signal-panel";
import { SentimentPanel } from "./sentiment-panel";
import { EquityChart } from "./equity-chart";
import { PositionsPanel } from "./positions-panel";
import { TradeLog } from "./trade-log";
import { MarketWatch } from "./market-watch";
import { DecisionHistory } from "./decision-history";
import { BacktestPanel } from "./backtest-panel";

export function Dashboard() {
  const agent = useAgent();

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950/20 text-zinc-100">
      <StatusHeader agent={agent} />

      <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-[1800px] mx-auto w-full">
        {/* Column 1: Live Market & Execution Log */}
        <div className="flex flex-col gap-6">
          <MarketWatch tickers={agent.state.tickers} />
          <EquityChart portfolio={agent.state.portfolio} ticker={agent.state.ticker} tickers={agent.state.tickers} />
          <PositionsPanel positions={agent.state.positions} tickers={agent.state.tickers} />
          <TradeLog trades={agent.state.trades} portfolio={agent.state.portfolio} />
        </div>

        {/* Column 2: Intelligence & Decision Log */}
        <div className="flex flex-col gap-6">
          <SignalPanel signals={agent.state.signals} decision={agent.state.decision} />
          {agent.state.decision && (agent.state.decision as any).riskStatus === "blocked" && (
            <div className="bg-rose-500/10 border border-rose-500/50 p-3 rounded text-[11px] text-rose-400 font-mono animate-pulse">
              <span className="font-bold mr-2">⚠️ RISK ALERT:</span> {agent.state.decision.reason}
            </div>
          )}
          <SentimentPanel />
          <DecisionHistory />
        </div>

        {/* Column 3: Strategy Simulation Sandbox */}
        <div className="flex flex-col gap-6">
          <BacktestPanel />
        </div>
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950/70 px-6 py-4 text-[10px] font-mono tracking-wider text-zinc-550 flex items-center justify-between">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">WYRM TRADER // V0.1.0</span>
        <span className="text-[10px] tracking-widest text-zinc-500 font-mono">SIMULATED TRADING CONSOLE — NO REAL CAPITAL</span>
      </footer>
    </div>
  );
}
