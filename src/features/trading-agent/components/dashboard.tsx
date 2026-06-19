"use client";

import { memo, useState } from "react";
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
import { NewsPanel } from "./news-panel";
import { TerminalLog } from "./terminal-log";
import { TradeToast } from "./trade-toast";
import { BrainLog } from "./brain-log";
import { Tabs } from "@/shared/ui";

export const Dashboard = memo(function Dashboard() {
  const agent = useAgent();
  const [activeLogTab, setActiveLogTab] = useState<"execution" | "decision" | "brain" | "console">("execution");

  return (
    <div className="min-h-screen flex flex-col bg-obsidian text-zinc-100 relative pb-16">
      {/* Subtle radial gradient overlay */}
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-30" />

      <TradeToast trades={agent.state.trades} />
      
      {/* Header */}
      <StatusHeader agent={agent} />

      {/* Watchlist */}
      <div className="relative z-10 px-4 pt-3">
        <Watchlist tickers={agent.state.tickers} watchlist={agent.state.watchlist} />
      </div>

      {/* Public Agent Status Banner */}
      {agent.state.status !== "running" && (
        <div className="relative z-10 px-4 pt-3">
          <div className={`p-3 rounded border flex items-center gap-3 ${
            agent.state.status === "stopped" 
              ? "border-zinc-800 bg-zinc-900/10" 
              : "border-yellow-900/20 bg-yellow-950/20"
          }`}>
             <div className={`w-2 h-2 rounded-full ${agent.state.status === "stopped" ? "bg-zinc-500" : "bg-yellow-500 animate-pulse"}`} />
             <span className={`text-[11px] font-mono font-bold tracking-widest uppercase ${
               agent.state.status === "stopped" ? "text-zinc-400" : "text-yellow-500"
             }`}>
               AGENT {agent.state.status}
             </span>
             <span className={`text-[11px] font-mono border-l pl-3 ${
               agent.state.status === "stopped" ? "text-zinc-500 border-zinc-800" : "text-yellow-600/80 border-yellow-900/50"
             }`}>
               {agent.state.status === "stopped" 
                 ? "System is offline. No active trades will execute."
                 : "Execution engine is paused. Holdings are preserved."}
             </span>
          </div>
        </div>
      )}

      {/* Main Terminal Grid */}
      <main className="relative z-10 px-4 pb-12 pt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 @container/dashboard">
        {/* Left Column: Chart + Positions (span 5) */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-5 flex flex-col gap-3">
          <div className="h-[350px] sm:h-[400px] lg:h-[450px]">
            <EquityChart
              portfolio={agent.state.portfolio}
              equityHistory={agent.state.equityHistory}
              everConnected={agent.state.everConnected}
            />
          </div>
          <div className="h-[350px] sm:h-[400px] lg:h-[450px]">
            <PositionsPanel
              positions={agent.state.positions}
              tickers={agent.state.tickers}
              everConnected={agent.state.everConnected}
              onClosePosition={agent.refresh}
            />
          </div>
        </div>

        {/* Center Column: Signals + Logs (span 4) */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-4 flex flex-col gap-3">
          <SignalPanel 
            signals={agent.state.signals} 
            decision={agent.state.decision}
            decisionSource={agent.state.decisionSource}
          />
          
          {agent.state.decision && (agent.state.decision as any).riskStatus === "blocked" && (
            <div className="glass-panel border-rose-500/30 bg-rose-950/20 p-3 text-[11px] text-rose-400 font-mono animate-pulse shrink-0">
              <span className="font-bold mr-2">RISK ALERT:</span> {agent.state.decision.reason}
            </div>
          )}

          {/* Logs Console */}
          <div className="glass-panel flex flex-col gap-3 p-4 h-[400px] sm:h-[450px] lg:h-[500px]">
            <Tabs
              tabs={[
                { key: "execution", label: "Execution" },
                { key: "decision", label: "Decisions" },
                { key: "brain", label: "Agent Brain" },
                { key: "console", label: "Console" },
              ]}
              active={activeLogTab}
              onChange={(key) => setActiveLogTab(key as "execution" | "decision" | "brain" | "console")}
            />
            <div className="flex-1 min-h-0 flex flex-col">
              {activeLogTab === "execution" ? (
                <TradeLog trades={agent.state.trades} portfolio={agent.state.portfolio} isTabMode={true} />
              ) : activeLogTab === "decision" ? (
                <DecisionHistory isTabMode={true} />
              ) : activeLogTab === "brain" ? (
                <BrainLog llmProgress={agent.state.llmProgress} lastDecision={agent.state.decision} isTabMode={true} />
              ) : (
                <TerminalLog logs={agent.state.logs} isTabMode={true} />
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Intel (span 3) */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-3 flex flex-col gap-3">
          <SentimentPanel />
          <div className="h-[350px] sm:h-[400px] lg:h-[450px]">
            <NewsPanel />
          </div>
        </div>
      </main>

      <BottomStatusBar agent={agent} />
    </div>
  );
});
