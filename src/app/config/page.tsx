"use client";

import { useAgent } from "@/features/trading-agent/hooks/use-agent";
import { StatusHeader } from "@/features/trading-agent/components/status-header";
import { BottomStatusBar } from "@/features/trading-agent/components/bottom-status-bar";
import { StrategyPanel } from "@/features/trading-agent/components/strategy-panel";
import { CircuitBreakerPanel } from "@/features/trading-agent/components/circuit-breaker-panel";
import { BacktestPanel } from "@/features/trading-agent/components/backtest-panel";

export default function ConfigPage() {
  const agent = useAgent();

  return (
    <div className="h-screen flex flex-col bg-obsidian text-zinc-100 relative overflow-hidden">
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-30" />

      <StatusHeader agent={agent} />

      <main className="relative z-10 flex-1 px-6 py-6 grid grid-cols-3 gap-4 min-h-0">
        <div className="col-span-2 flex flex-col gap-4 min-h-0 overflow-y-auto scrollbar-none">
          <StrategyPanel />
        </div>
        <div className="col-span-1 flex flex-col gap-4 min-h-0 overflow-y-auto scrollbar-none">
          <BacktestPanel />
          <CircuitBreakerPanel
            circuitBreakerTripped={agent.state.circuitBreakerTripped}
            circuitBreakerThresholdPct={agent.state.circuitBreakerThresholdPct}
            peakEquity={agent.state.peakEquity}
            currentEquity={agent.state.portfolio?.equity ?? 0}
            resetBreaker={agent.resetBreaker}
          />
        </div>
      </main>

      <BottomStatusBar agent={agent} />
    </div>
  );
}
