"use client";

import { memo, useState, useCallback } from "react";
import { Button } from "@/shared/ui";
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
    <header className="terminal-header px-6 py-4 flex items-center justify-between relative z-50">
      <div className="flex items-center gap-4">
        <img src="/logo.svg" alt="Wyrm" className="h-10 w-auto opacity-70" />
        <div className="flex flex-col">
          <h1 className="text-sm font-bold tracking-widest text-phosphor phosphor-glow uppercase font-mono">
            WYRM_TRADER
          </h1>
          <span className="text-[9px] tracking-widest text-phosphor-dim uppercase font-mono">
            Autonomous Trading Terminal v0.1.0
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-[9px] font-mono text-phosphor-dim tracking-widest">
          <span>STATUS:</span>
          <span className={status === "running" ? "text-phosphor-green phosphor-glow-green" : "text-phosphor-muted"}>
            {status === "running" ? "ONLINE" : "OFFLINE"}
          </span>
          <span className="crt-cursor" />
        </div>
        <Button
          onClick={handleToggle}
          disabled={isPending || (status !== "running" && state.circuitBreakerTripped)}
          variant={status === "running" ? "danger" : "amber"}
          size="sm"
        >
          {isPending ? (
            <>
              <span className="animate-pulse mr-2">█</span>
              {status === "running" ? "STOPPING..." : "BOOTING..."}
            </>
          ) : status === "running" ? (
            <>
              <span className="mr-1 text-phosphor-red">■</span>
              HALT
            </>
          ) : (
            <>
              <span className="mr-1 text-phosphor-green">▶</span>
              INIT
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
