"use client";

import { memo, useEffect, useState } from "react";
import type { useAgent } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  agent: ReturnType<typeof useAgent>;
}

export const StatusHeader = memo(function StatusHeader({ agent }: Props) {
  const { state } = agent;
  const { status } = state;
  const [staleSec, setStaleSec] = useState(0);

  useEffect(() => {
    if (!state.lastFetchAt) return;
    const tick = () => setStaleSec(Math.round((Date.now() - state.lastFetchAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.lastFetchAt]);

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

      <div className="flex items-center gap-3">
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
