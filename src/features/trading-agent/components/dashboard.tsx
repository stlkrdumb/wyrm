"use client";

import { useState } from "react";
import { useAgent } from "@/features/trading-agent/hooks/use-agent";
import { StatusHeader } from "./status-header";
import { BottomStatusBar } from "./bottom-status-bar";
import { SignalPanel } from "./signal-panel";
import { SentimentPanel } from "./sentiment-panel";
import { EquityChart } from "./equity-chart";
import { PositionsPanel } from "./positions-panel";
import { TradeLog } from "./trade-log";
import { Watchlist } from "./watchlist";
import { DecisionHistory } from "./decision-history";
import { BacktestPanel } from "./backtest-panel";
import { StrategyPanel } from "./strategy-panel";
import { CircuitBreakerPanel } from "./circuit-breaker-panel";
import { NewsPanel } from "./news-panel";
import { Tabs } from "@/shared/ui";
import { Brain, Newspaper, ChevronLeft } from "lucide-react";

export function Dashboard() {
  const agent = useAgent();
  const [activeLogTab, setActiveLogTab] = useState<"execution" | "decision">("execution");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"intel" | "config">("intel");

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950/20 text-zinc-100">
      <StatusHeader agent={agent} />

      {/* Watchlist */}
      <div className="px-6 pt-6 max-w-[1800px] mx-auto w-full flex-shrink-0">
        <Watchlist tickers={agent.state.tickers} watchlist={agent.state.watchlist} />
      </div>

      <main className="flex-1 px-6 pb-6 pt-4 flex flex-col lg:flex-row gap-6 max-w-[1800px] mx-auto w-full">
        {/* Main Workspace */}
        <div className="flex-grow grid grid-cols-1 xl:grid-cols-2 gap-6 min-w-0">
          
          {/* Column 1: Equity + Positions */}
          <div className="flex flex-col gap-6">
            <EquityChart portfolio={agent.state.portfolio} ticker={agent.state.ticker} equityHistory={agent.state.equityHistory} />
            <PositionsPanel positions={agent.state.positions} tickers={agent.state.tickers} />
          </div>

          {/* Column 2: Signals + Logs */}
          <div className="flex flex-col gap-6">
            <SignalPanel signals={agent.state.signals} decision={agent.state.decision} />
            {agent.state.decision && (agent.state.decision as any).riskStatus === "blocked" && (
              <div className="bg-rose-500/10 border border-rose-500/50 p-3 rounded text-[11px] text-rose-400 font-mono animate-pulse">
                <span className="font-bold mr-2">RISK ALERT:</span> {agent.state.decision.reason}
              </div>
            )}

            {/* Unified Logs Console */}
            <div className="flex flex-col gap-4 p-5 rounded border border-zinc-800/80 bg-zinc-950/60 shadow-lg shadow-black/40 relative overflow-hidden h-[450px]">
              <Tabs
                tabs={[
                  { key: "execution", label: "Execution Log" },
                  { key: "decision", label: "Decision Log" },
                ]}
                active={activeLogTab}
                onChange={(key) => setActiveLogTab(key as "execution" | "decision")}
              />
              <div className="flex-grow overflow-hidden flex flex-col">
                {activeLogTab === "execution" ? (
                  <TradeLog trades={agent.state.trades} portfolio={agent.state.portfolio} isTabMode={true} />
                ) : (
                  <DecisionHistory isTabMode={true} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Right Sidebar */}
        <div className={`flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col gap-4 ${
          isSidebarOpen ? "w-full lg:w-[380px]" : "w-full lg:w-[48px]"
        }`}>
          {isSidebarOpen ? (
            <>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="w-full py-2 bg-zinc-950/40 hover:bg-zinc-900 border border-zinc-800/80 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-300 font-mono text-[9px] uppercase tracking-widest gap-2 cursor-pointer transition-colors"
              >
                <span>COLLAPSE SIDEBAR</span>
              </button>

              {/* Sidebar Tab Switcher */}
              <div className="flex gap-1 border border-zinc-800/80 rounded p-0.5 bg-zinc-950/60">
                <button
                  onClick={() => setActiveSidebarTab("intel")}
                  className={`flex-1 py-1.5 text-[9px] font-bold tracking-widest uppercase rounded transition-all cursor-pointer ${
                    activeSidebarTab === "intel"
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                      : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                  }`}
                >
                  <Brain className="w-3 h-3 inline mr-1 -mt-0.5" />
                  Intel
                </button>
                <button
                  onClick={() => setActiveSidebarTab("config")}
                  className={`flex-1 py-1.5 text-[9px] font-bold tracking-widest uppercase rounded transition-all cursor-pointer ${
                    activeSidebarTab === "config"
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                      : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                  }`}
                >
                  Config
                </button>
              </div>

              {activeSidebarTab === "intel" ? (
                <>
                  <SentimentPanel />
                  <NewsPanel />
                </>
              ) : (
                <>
                  <BacktestPanel />
                  <CircuitBreakerPanel
                    circuitBreakerTripped={agent.state.circuitBreakerTripped}
                    circuitBreakerThresholdPct={agent.state.circuitBreakerThresholdPct}
                    peakEquity={agent.state.peakEquity}
                    currentEquity={agent.state.portfolio?.equity ?? 0}
                    resetBreaker={agent.resetBreaker}
                  />
                  <StrategyPanel />
                </>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-6 pt-2 h-full border border-zinc-800/80 bg-zinc-950/20 rounded py-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 bg-zinc-950/40 hover:bg-zinc-900 border border-zinc-800/80 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
                title="Expand Sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex flex-col gap-5 items-center text-zinc-600 mt-2">
                <div className="hover:text-zinc-400 cursor-pointer transition-colors" onClick={() => setIsSidebarOpen(true)} title="Market Intelligence">
                  <Brain className="w-4 h-4" />
                </div>
              </div>
              <div
                className="text-[9px] font-mono tracking-widest text-zinc-600 font-bold uppercase select-none pointer-events-none mt-6 whitespace-nowrap"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                SIDEBAR // TOOLS
              </div>
            </div>
          )}
        </div>
      </main>

      <BottomStatusBar agent={agent} />
    </div>
  );
}
