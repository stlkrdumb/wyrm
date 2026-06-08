"use client";

import { useAgent } from "../hooks/use-agent";
import { StatusHeader } from "./status-header";
import { SignalPanel } from "./signal-panel";
import { EquityChart } from "./equity-chart";
import { PositionsPanel } from "./positions-panel";
import { TradeLog } from "./trade-log";

export function Dashboard() {
  const agent = useAgent();

  return (
    <div className="flex flex-col min-h-screen">
      <StatusHeader agent={agent} />

      <main className="flex-1 p-4 grid gap-4" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
        <div className="flex flex-col gap-4">
          <EquityChart portfolio={agent.state.portfolio} ticker={agent.state.ticker} />
          <PositionsPanel positions={agent.state.positions} ticker={agent.state.ticker} />
        </div>

        <div className="flex flex-col gap-4">
          <SignalPanel signals={agent.state.signals} decision={agent.state.decision} />
          <TradeLog trades={agent.state.trades} portfolio={agent.state.portfolio} />
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500 flex items-center justify-between">
        <span>WYRM Trader v0.1</span>
        <span>Sim Trading — No Real Capital</span>
      </footer>
    </div>
  );
}
