"use client";

import { useAgent } from "../hooks/use-agent";
import { StatusHeader } from "./status-header";
import { SignalPanel } from "./signal-panel";
import { EquityChart } from "./equity-chart";
import { PositionsPanel } from "./positions-panel";
import { TradeLog } from "./trade-log";
import { MarketWatch } from "./market-watch";

export function Dashboard() {
  const agent = useAgent();

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950/20 text-zinc-100">
      <StatusHeader agent={agent} />

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1600px] mx-auto w-full">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <MarketWatch tickers={agent.state.tickers} />
          <EquityChart portfolio={agent.state.portfolio} ticker={agent.state.ticker} tickers={agent.state.tickers} />
          <PositionsPanel positions={agent.state.positions} tickers={agent.state.tickers} />
        </div>

        <div className="flex flex-col gap-6">
          <SignalPanel signals={agent.state.signals} decision={agent.state.decision} />
          <TradeLog trades={agent.state.trades} portfolio={agent.state.portfolio} />
        </div>
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950/70 px-6 py-4 text-[10px] font-mono tracking-wider text-zinc-500 flex items-center justify-between">
        <span>WYRM TRADER // V0.1.0</span>
        <span>SIMULATED TRADING CONSOLE — NO REAL CAPITAL</span>
      </footer>
    </div>
  );
}
