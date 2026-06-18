"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAgent } from "@/features/trading-agent/hooks/use-agent";
import { StrategyPanel } from "@/features/trading-agent/components/strategy-panel";
import { CircuitBreakerPanel } from "@/features/trading-agent/components/circuit-breaker-panel";
import { BacktestPanel } from "@/features/trading-agent/components/backtest-panel";

export default function ConfigPage() {
  const agent = useAgent();
  const { status } = agent.state;

  return (
    <div className="min-h-screen flex flex-col bg-obsidian text-zinc-100">
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-30" />

      {/* Minimal Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-obsidian-border bg-obsidian-light/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded text-[12px] font-mono font-bold tracking-widest uppercase bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-obsidian-lighter border border-obsidian-border">
          <div className={`w-2 h-2 rounded-full ${
            status === "running" 
              ? "bg-emerald-400 animate-pulse" 
              : status === "paused" 
              ? "bg-yellow-400" 
              : "bg-zinc-500"
          }`} />
          <span className="text-[12px] font-mono font-bold tracking-widest uppercase text-zinc-400">
            {agent.state.modelName || "IDLE"}
          </span>
        </div>
      </header>

      {/* Page Content */}
      <main className="relative z-10 flex-1 px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch lg:h-[calc(100vh-80px)] overflow-y-auto scrollbar-none">
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6 h-full min-h-0">
          <StrategyPanel />
        </div>
        <div className="col-span-1 flex flex-col gap-6 h-full min-h-0">
          <div className="flex-1 min-h-0">
            <BacktestPanel />
          </div>
          <div className="shrink-0">
            <CircuitBreakerPanel
              circuitBreakerTripped={agent.state.circuitBreakerTripped}
              circuitBreakerThresholdPct={agent.state.circuitBreakerThresholdPct}
              peakEquity={agent.state.peakEquity}
              currentEquity={agent.state.portfolio?.equity ?? 0}
              resetBreaker={agent.resetBreaker}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
