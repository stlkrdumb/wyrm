"use client";

import { ArrowLeft, Settings } from "lucide-react";
import Link from "next/link";
import { useAgent } from "@/features/trading-agent/hooks/use-agent";
import { StrategyPanel } from "@/features/trading-agent/components/strategy-panel";
import { CircuitBreakerPanel } from "@/features/trading-agent/components/circuit-breaker-panel";
import { BacktestPanel } from "@/features/trading-agent/components/backtest-panel";

export default function ConfigPage() {
  const agent = useAgent();

  return (
    <div className="min-h-screen bg-obsidian text-zinc-100">
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-30" />

      {/* Page Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-obsidian-border bg-obsidian-light/80 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded text-[11px] font-mono font-bold tracking-widest uppercase bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-zinc-400" />
            <h1 className="text-sm font-bold tracking-[0.2em] text-zinc-100 uppercase font-mono">
              System Configuration
            </h1>
          </div>
        </div>
        <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">
          Hot-reload strategy settings, risk parameters, and backtesting
        </span>
      </header>

      {/* Page Content */}
      <main className="relative z-10 max-w-3xl mx-auto px-6 py-6 space-y-4">
        <BacktestPanel />
        <CircuitBreakerPanel
          circuitBreakerTripped={agent.state.circuitBreakerTripped}
          circuitBreakerThresholdPct={agent.state.circuitBreakerThresholdPct}
          peakEquity={agent.state.peakEquity}
          currentEquity={agent.state.portfolio?.equity ?? 0}
          resetBreaker={agent.resetBreaker}
        />
        <StrategyPanel />
      </main>
    </div>
  );
}
