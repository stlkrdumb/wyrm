"use client";

import { memo, useState, useCallback } from "react";
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
    <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 bg-zinc-950/70 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-black tracking-widest text-zinc-100 uppercase font-mono">
          WYRM // <span className="text-zinc-500 font-normal">TRADING CONSOLE</span>
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={isPending || (status !== "running" && state.circuitBreakerTripped)}
          className={`inline-flex items-center justify-center rounded border px-4 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all duration-300 cursor-pointer ${
            isPending
              ? "border-zinc-700 text-zinc-500 bg-zinc-900/50 cursor-wait"
              : status === "running"
              ? "border-rose-500/30 hover:border-rose-500 text-rose-400 hover:bg-rose-500/5"
              : "border-emerald-500/30 hover:border-emerald-500 text-emerald-400 hover:bg-emerald-500/5"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isPending ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {status === "running" ? "STOPPING..." : "STARTING..."}
            </>
          ) : status === "running" ? (
            <>&#9632; STOP</>
          ) : (
            <>&#9654; START</>
          )}
        </button>
      </div>
    </header>
  );
}, (prev, next) => {
  return (
    prev.agent.state.status === next.agent.state.status &&
    prev.agent.state.circuitBreakerTripped === next.agent.state.circuitBreakerTripped
  );
});
