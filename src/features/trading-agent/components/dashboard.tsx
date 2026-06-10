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
import { TerminalLog } from "./terminal-log";
import { TradeToast } from "./trade-toast";
import { Tabs } from "@/shared/ui";
import { Brain, Settings } from "lucide-react";

export function Dashboard() {
  const agent = useAgent();
  const [activeLogTab, setActiveLogTab] = useState<"execution" | "decision" | "console">("execution");
  const [activeSidebarTab, setActiveSidebarTab] = useState<"intel" | "config">("intel");

  return (
    <div className="min-h-screen bg-obsidian text-zinc-100 relative">
      {/* Subtle radial gradient overlay */}
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-30" />

      <TradeToast trades={agent.state.trades} />
      
      {/* Header */}
      <StatusHeader agent={agent} />

      {/* Watchlist */}
      <div className="relative z-10 px-4 pt-3 max-w-[1920px] mx-auto">
        <Watchlist tickers={agent.state.tickers} watchlist={agent.state.watchlist} />
      </div>

      {/* Main Terminal Grid */}
      <main className="relative z-10 px-4 pb-4 pt-3 max-w-[1920px] mx-auto grid grid-cols-12 gap-3">
        {/* Left Column: Chart + Positions (span 5) */}
        <div className="col-span-5 flex flex-col gap-3">
          <EquityChart 
            portfolio={agent.state.portfolio} 
            ticker={agent.state.ticker} 
            equityHistory={agent.state.equityHistory}
            trades={agent.state.trades}
          />
          <PositionsPanel 
            positions={agent.state.positions} 
            tickers={agent.state.tickers} 
          />
        </div>

        {/* Center Column: Signals + Logs (span 4) */}
        <div className="col-span-4 flex flex-col gap-3">
          <SignalPanel 
            signals={agent.state.signals} 
            decision={agent.state.decision} 
          />
          
          {agent.state.decision && (agent.state.decision as any).riskStatus === "blocked" && (
            <div className="glass-panel border-rose-500/30 bg-rose-950/20 p-3 text-[11px] text-rose-400 font-mono animate-pulse">
              <span className="font-bold mr-2">RISK ALERT:</span> {agent.state.decision.reason}
            </div>
          )}

          {/* Logs Console */}
          <div className="glass-panel flex flex-col gap-3 p-4 flex-grow min-h-[500px]">
            <Tabs
              tabs={[
                { key: "execution", label: "Execution" },
                { key: "decision", label: "Decisions" },
                { key: "console", label: "Console" },
              ]}
              active={activeLogTab}
              onChange={(key) => setActiveLogTab(key as "execution" | "decision" | "console")}
            />
            <div className="flex-grow overflow-hidden flex flex-col">
              {activeLogTab === "execution" ? (
                <TradeLog trades={agent.state.trades} portfolio={agent.state.portfolio} isTabMode={true} />
              ) : activeLogTab === "decision" ? (
                <DecisionHistory isTabMode={true} />
              ) : (
                <TerminalLog logs={agent.state.logs} />
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Intel + Config (span 3) */}
        <div className="col-span-3 flex flex-col gap-3">
          {/* Sidebar Tabs */}
          <div className="glass-panel p-1 flex gap-1">
            <button
              onClick={() => setActiveSidebarTab("intel")}
              className={`flex-1 py-2 px-3 text-[10px] font-bold tracking-widest uppercase rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeSidebarTab === "intel"
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              <Brain className="w-3 h-3" />
              Intel
            </button>
            <button
              onClick={() => setActiveSidebarTab("config")}
              className={`flex-1 py-2 px-3 text-[10px] font-bold tracking-widest uppercase rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeSidebarTab === "config"
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              <Settings className="w-3 h-3" />
              Config
            </button>
          </div>

          <div className="flex flex-col gap-3 flex-grow overflow-hidden">
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
          </div>
        </div>
      </main>

      <BottomStatusBar agent={agent} />
    </div>
  );
}
