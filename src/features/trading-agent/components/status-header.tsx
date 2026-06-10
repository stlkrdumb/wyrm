"use client";

import { memo, useState, useCallback } from "react";
import { Button } from "@/shared/ui";
import { Play, Square, Loader2 } from "lucide-react";
import type { useAgent } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  agent: ReturnType<typeof useAgent>;
}

export const StatusHeader = memo(function StatusHeader({ agent }: Props) {
  const { state, setAgentStatus } = agent;
  const { status } = state;
  const [isPending, setIsPending] = useState(false);

  const handleToggle = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      await setAgentStatus(status === "running" ? "stopped" : "running");
    } finally {
      setIsPending(false);
    }
  }, [isPending, status, setAgentStatus]);

  return (
    <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-obsidian-border bg-obsidian-light/80 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <img src="/logo.svg" alt="Wyrm" className="h-10 w-auto opacity-90" />
        <div className="flex flex-col">
          <h1 className="text-sm font-bold tracking-[0.2em] text-zinc-100 uppercase font-mono">
            WYRM
          </h1>
          <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">
            Autonomous Trading Terminal
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-obsidian-lighter border border-obsidian-border">
          <div className={`w-2 h-2 rounded-full ${
            status === "running" 
              ? "bg-emerald-400 animate-pulse" 
              : status === "paused" 
              ? "bg-yellow-400" 
              : "bg-zinc-500"
          }`} />
          <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-400">
            {status === "running" ? "LIVE" : status === "paused" ? "PAUSED" : "OFFLINE"}
          </span>
        </div>

        <Button
          onClick={handleToggle}
          disabled={isPending || (status !== "running" && state.circuitBreakerTripped)}
          variant={status === "running" ? "danger" : "emerald"}
          size="sm"
          className="font-mono text-[10px] tracking-widest uppercase"
        >
          {isPending ? (
            <>
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              {status === "running" ? "STOPPING" : "STARTING"}
            </>
          ) : status === "running" ? (
            <>
              <Square className="w-3 h-3 mr-1.5 fill-current" />
              STOP
            </>
          ) : (
            <>
              <Play className="w-3 h-3 mr-1.5 fill-current" />
              START
            </>
          )}
        </Button>
      </div>
    </header>
  );
}, (prev, next) => {
  return (
    prev.agent.state.status === next.agent.state.status &&
    prev.agent.state.circuitBreakerTripped === next.agent.state.circuitBreakerTripped
  );
});
