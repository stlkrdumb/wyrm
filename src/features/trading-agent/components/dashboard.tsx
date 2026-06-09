"use client";

import { useState } from "react";
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
  const [activeLogTab, setActiveLogTab] = useState<"execution" | "decision">("execution");

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950/20 text-zinc-100">
      <StatusHeader agent={agent} />

      {/* Full-width scrolling ticker tape */}
      <div className="px-6 pt-6 max-w-[1800px] mx-auto w-full flex-shrink-0">
        <MarketWatch tickers={agent.state.tickers} />
      </div>

      <main className="flex-1 px-6 pb-6 pt-4 grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-[1800px] mx-auto w-full">
        {/* Column 1: Live Market & Assets */}
        <div className="flex flex-col gap-6">
          <EquityChart portfolio={agent.state.portfolio} ticker={agent.state.ticker} tickers={agent.state.tickers} />
          <PositionsPanel positions={agent.state.positions} tickers={agent.state.tickers} />
        </div>

        {/* Column 2: Intelligence & Logs Console */}
        <div className="flex flex-col gap-6">
          <SignalPanel signals={agent.state.signals} decision={agent.state.decision} />
          {agent.state.decision && (agent.state.decision as any).riskStatus === "blocked" && (
            <div className="bg-rose-500/10 border border-rose-500/50 p-3 rounded text-[11px] text-rose-400 font-mono animate-pulse">
              <span className="font-bold mr-2">⚠️ RISK ALERT:</span> {agent.state.decision.reason}
            </div>
          )}
          <SentimentPanel />
          
          {/* Unified Logs Console Widget */}
          <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden h-[450px]">
            {/* Tab Header */}
            <div className="flex items-center justify-between border-b border-zinc-900/50 pb-2.5 flex-shrink-0">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveLogTab("execution")}
                  className={`text-[10px] font-bold tracking-widest uppercase transition-all duration-150 cursor-pointer ${
                    activeLogTab === "execution" 
                      ? "text-zinc-100 border-b border-zinc-400 pb-2" 
                      : "text-zinc-500 hover:text-zinc-350 pb-2"
                  }`}
                >
                  Execution Log
                </button>
                <button
                  onClick={() => setActiveLogTab("decision")}
                  className={`text-[10px] font-bold tracking-widest uppercase transition-all duration-150 cursor-pointer ${
                    activeLogTab === "decision" 
                      ? "text-zinc-100 border-b border-zinc-400 pb-2" 
                      : "text-zinc-500 hover:text-zinc-350 pb-2"
                  }`}
                >
                  Decision Log
                </button>
              </div>
              <span className="text-[10px] tracking-widest text-zinc-550 font-mono">
                {activeLogTab === "execution" ? "LEDGER" : "LLM STATE"}
              </span>
            </div>

            {/* Content Pane */}
            <div className="flex-grow overflow-hidden flex flex-col">
              {activeLogTab === "execution" ? (
                <TradeLog trades={agent.state.trades} portfolio={agent.state.portfolio} isTabMode={true} />
              ) : (
                <DecisionHistory isTabMode={true} />
              )}
            </div>
          </div>
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
