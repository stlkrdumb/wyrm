"use client";

import { memo, useEffect, useState } from "react";
import type { useAgent } from "@/features/trading-agent/hooks/use-agent";
import { Play, Pause, Square, Zap, Loader2 } from "lucide-react";

interface Props {
  agent: ReturnType<typeof useAgent>;
}

export const StatusHeader = memo(function StatusHeader({ agent }: Props) {
  const { state, setAgentStatus, runCycle } = agent;
  const { status } = state;
  const [staleSec, setStaleSec] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [cycleTriggering, setCycleTriggering] = useState(false);

  useEffect(() => {
    if (!state.lastFetchAt) return;
    const tick = () => setStaleSec(Math.round((Date.now() - state.lastFetchAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.lastFetchAt]);

  const handleSetStatus = async (newStatus: "running" | "stopped" | "paused") => {
    setActionLoading(true);
    try {
      await setAgentStatus(newStatus);
    } catch (err) {
      console.error("[StatusHeader] Error setting agent status:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerCycle = async () => {
    setCycleTriggering(true);
    try {
      await runCycle();
    } catch (err) {
      console.error("[StatusHeader] Error triggering cycle:", err);
    } finally {
      setCycleTriggering(false);
    }
  };

  return (
    <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-obsidian-border bg-obsidian-light/80 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <img src="/logo.svg" alt="Wyrm" className="h-10 w-auto opacity-90" />
        <div className="flex flex-col">
          <h1 className="text-sm font-bold tracking-[0.2em] text-zinc-100 uppercase font-mono">
            WYRM
          </h1>
          <span className="text-[12px] font-mono tracking-widest text-zinc-500 uppercase">
            Autonomous Trading Terminal
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Lifecycle Controls */}
        <div className="flex items-center gap-1 bg-zinc-950/60 border border-obsidian-border rounded p-0.5">
          <button
            onClick={() => handleSetStatus("running")}
            disabled={status === "running" || actionLoading}
            className={`px-3 py-1.5 rounded text-[11px] font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              status === "running"
                ? "bg-emerald-500/25 text-emerald-400 border border-emerald-500/35"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent"
            }`}
            title="Start Autonomous Trading"
          >
            <Play className="w-3 h-3 fill-current" />
            Start
          </button>
          <button
            onClick={() => handleSetStatus("paused")}
            disabled={status === "paused" || actionLoading}
            className={`px-3 py-1.5 rounded text-[11px] font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              status === "paused"
                ? "bg-yellow-500/25 text-yellow-400 border border-yellow-500/35"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent"
            }`}
            title="Pause Bot (Preserve Positions)"
          >
            <Pause className="w-3 h-3 fill-current" />
            Pause
          </button>
          <button
            onClick={() => handleSetStatus("stopped")}
            disabled={status === "stopped" || actionLoading}
            className={`px-3 py-1.5 rounded text-[11px] font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              status === "stopped"
                ? "bg-rose-500/25 text-rose-400 border border-rose-500/35"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent"
            }`}
            title="Stop Bot & Flatten Positions"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            Stop
          </button>
        </div>

        {/* Manual Trigger Button */}
        <button
          onClick={handleTriggerCycle}
          disabled={cycleTriggering || status !== "running"}
          className={`px-3.5 py-1.5 rounded text-[11px] font-mono font-bold tracking-widest uppercase flex items-center gap-1.5 transition-all border ${
            status === "running"
              ? "bg-cyan-500/15 border-cyan-500/30 hover:border-cyan-500/50 text-cyan-400 cursor-pointer"
              : "bg-zinc-900/40 border-zinc-800/80 text-zinc-600 cursor-not-allowed"
          }`}
          title="Manually Execute Trading Cycle Now"
        >
          {cycleTriggering ? (
            <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
          ) : (
            <Zap className="w-3 h-3 text-cyan-400" />
          )}
          {cycleTriggering ? "RUNNING..." : "TRIGGER"}
        </button>

        {/* Staleness */}
        <span className={`text-[10px] font-mono font-bold tracking-widest uppercase ${
          staleSec > 30 ? "text-rose-400" :
          staleSec > 15 ? "text-yellow-400" : "text-zinc-600"
        }`}>
          {state.lastFetchAt > 0 ? `${staleSec}s ago` : "IDLE"}
        </span>
        {/* Model Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-obsidian-lighter border border-obsidian-border">
          <div className={`w-2 h-2 rounded-full ${
            status === "running" 
              ? "bg-emerald-400 animate-pulse" 
              : status === "paused" 
              ? "bg-yellow-400" 
              : "bg-zinc-500"
          }`} />
          <span className="text-[12px] font-mono font-bold tracking-widest uppercase text-zinc-400">
            {state.modelName || "IDLE"}
          </span>
        </div>
      </div>
    </header>
  );
}, (prev, next) => {
  return (
    prev.agent.state.status === next.agent.state.status &&
    prev.agent.state.modelName === next.agent.state.modelName &&
    prev.agent.state.lastFetchAt === next.agent.state.lastFetchAt
  );
});
