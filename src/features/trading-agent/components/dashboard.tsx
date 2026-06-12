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
import { NewsPanel } from "./news-panel";
import { TerminalLog } from "./terminal-log";
import { TradeToast } from "./trade-toast";
import { BrainLog } from "./brain-log";
import { Tabs } from "@/shared/ui";
import { ConfigModal } from "./config-modal";

export function Dashboard() {
  const agent = useAgent();
  const [activeLogTab, setActiveLogTab] = useState<"execution" | "decision" | "brain" | "console">("execution");
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-obsidian text-zinc-100 relative overflow-hidden">
      {/* Subtle radial gradient overlay */}
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-30" />

      {/* Agent Stopped Overlay */}
      {agent.state.status !== "running" && (
        <div className="fixed inset-0 z-50 bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-2 h-2 rounded-full bg-zinc-500" />
            <span className="text-[13px] font-mono font-bold tracking-widest uppercase text-zinc-500">
              AGENT {agent.state.status === "stopped" ? "STOPPED" : "PAUSED"} — NO ACTIVE TRADING
            </span>
            <span className="text-[11px] font-mono text-zinc-600">
              {agent.state.status === "stopped"
                ? "All positions flattened. Press Start to resume."
                : "Positions preserved. Press Start to resume."}
            </span>
          </div>
        </div>
      )}

      <TradeToast trades={agent.state.trades} />
      
      {/* Header */}
      <StatusHeader agent={agent} />

      {/* Watchlist */}
      <div className="relative z-10 px-4 pt-3">
        <Watchlist tickers={agent.state.tickers} watchlist={agent.state.watchlist} />
      </div>

      {/* Main Terminal Grid */}
      <main className="relative z-10 px-4 pb-12 pt-3 grid grid-cols-12 gap-3 flex-1 min-h-0">
        {/* Left Column: Chart + Positions (span 5) */}
        <div className="col-span-5 flex flex-col gap-3 min-h-0">
          <EquityChart
            portfolio={agent.state.portfolio}
            equityHistory={agent.state.equityHistory}
            everConnected={agent.state.everConnected}
          />
          <div className="flex-1 min-h-0">
            <PositionsPanel
              positions={agent.state.positions}
              tickers={agent.state.tickers}
              everConnected={agent.state.everConnected}
            />
          </div>
        </div>

        {/* Center Column: Signals + Logs (span 4) */}
        <div className="col-span-4 flex flex-col gap-3 min-h-0">
          <SignalPanel 
            signals={agent.state.signals} 
            decision={agent.state.decision}
            decisionSource={agent.state.decisionSource}
          />
          
          {agent.state.decision && (agent.state.decision as any).riskStatus === "blocked" && (
            <div className="glass-panel border-rose-500/30 bg-rose-950/20 p-3 text-[11px] text-rose-400 font-mono animate-pulse">
              <span className="font-bold mr-2">RISK ALERT:</span> {agent.state.decision.reason}
            </div>
          )}

          {/* Logs Console */}
          <div className="glass-panel flex flex-col gap-3 p-4 flex-1 min-h-0">
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
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
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
        <div className="col-span-3 flex flex-col gap-3 min-h-0">
          <SentimentPanel />
          <NewsPanel />
        </div>
      </main>

      <BottomStatusBar agent={agent} onOpenConfig={() => setIsConfigOpen(true)} />
      <ConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} agent={agent} />
    </div>
  );
}
