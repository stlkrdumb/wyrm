"use client";

import { X, Settings } from "lucide-react";
import { BacktestPanel } from "./backtest-panel";
import { CircuitBreakerPanel } from "./circuit-breaker-panel";
import { StrategyPanel } from "./strategy-panel";
import type { useAgent } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  agent: ReturnType<typeof useAgent>;
}

export function ConfigModal({ isOpen, onClose, agent }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm animate-fade-in">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative z-10 w-full max-w-2xl bg-obsidian border border-obsidian-border rounded shadow-2xl flex flex-col max-h-[85vh] overflow-hidden m-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-obsidian-border bg-obsidian-light/40">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-zinc-400" />
            <div className="flex flex-col">
              <h2 className="text-sm font-bold tracking-widest text-zinc-100 uppercase font-mono">
                System Configuration
              </h2>
              <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase">
                Hot-reload strategy settings, risk parameters, and backtesting
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 border border-transparent hover:border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-none">
          <BacktestPanel />
          <CircuitBreakerPanel
            circuitBreakerTripped={agent.state.circuitBreakerTripped}
            circuitBreakerThresholdPct={agent.state.circuitBreakerThresholdPct}
            peakEquity={agent.state.peakEquity}
            currentEquity={agent.state.portfolio?.equity ?? 0}
            resetBreaker={agent.resetBreaker}
          />
          <StrategyPanel />
        </div>
      </div>
    </div>
  );
}
