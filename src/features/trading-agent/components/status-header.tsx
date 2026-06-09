"use client";

import { memo } from "react";
import { Badge } from "@/shared/ui";
import type { useAgent } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  agent: ReturnType<typeof useAgent>;
}

export const StatusHeader = memo(function StatusHeader({ agent }: Props) {
  const { state, runCycle, setAgentStatus } = agent;
  const { status, lastCycleAt } = state;

  const renderBadge = () => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            CONSOLE ACTIVE
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            CONSOLE PAUSED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-zinc-900 text-zinc-400 border border-zinc-850">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            OFFLINE
          </span>
        );
    }
  };

  const connectionType = state.wsConnection?.type || "direct";
  const proxyAddress = state.wsConnection?.proxy;

  const renderWSBadge = () => {
    if (state.wsStatus === "connected") {
      if (connectionType === "proxy") {
        return (
          <span
            title={proxyAddress || "Proxy Route"}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-help"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            PROXY WS
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-zinc-900 text-zinc-300 border border-zinc-850">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
          DIRECT CONNECTION
        </span>
      );
    }

    if (state.wsStatus === "reconnecting") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-450 animate-ping" />
          RECONNECTING
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        REST FALLBACK
      </span>
    );
  };

  const uptime = lastCycleAt ? new Date(lastCycleAt).toLocaleTimeString() : "--:--:--";

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 bg-zinc-950/70 backdrop-blur-md">
      {/* Left: Logo + WS status */}
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-black tracking-widest text-zinc-100 uppercase font-mono">
          WYRM // <span className="text-zinc-500 font-normal">TRADING CONSOLE</span>
        </h1>
        {renderBadge()}
        {state.circuitBreakerTripped && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-rose-500/20 text-rose-450 border border-rose-500/30 animate-pulse">
            💥 BREAKER TRIPPED
          </span>
        )}
        {renderWSBadge()}
        {lastCycleAt && (
          <span className="text-[10px] tracking-wider uppercase text-zinc-500 font-mono">CYCLE: {uptime}</span>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {status !== "running" ? (
          <button
            onClick={() => setAgentStatus("running")}
            disabled={state.circuitBreakerTripped}
            className="inline-flex items-center justify-center rounded border border-emerald-500/30 hover:border-emerald-500 text-emerald-400 hover:bg-emerald-500/5 px-4 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            &#9654; START
          </button>
        ) : (
          <button
            onClick={() => setAgentStatus("paused")}
            className="inline-flex items-center justify-center rounded border border-amber-500/30 hover:border-amber-500 text-amber-400 hover:bg-amber-500/5 px-4 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all duration-300 cursor-pointer"
          >
            &#9646;&#9646; PAUSE
          </button>
        )}
        <button
          onClick={() => setAgentStatus("stopped")}
          className="inline-flex items-center justify-center rounded border border-rose-500/30 hover:border-rose-500 text-rose-400 hover:bg-rose-500/5 px-4 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all duration-300 cursor-pointer"
        >
          &#9632; STOP
        </button>
      </div>
    </header>
  );
}, (prev, next) => {
  return (
    prev.agent.state.status === next.agent.state.status &&
    prev.agent.state.lastCycleAt === next.agent.state.lastCycleAt &&
    prev.agent.state.wsStatus === next.agent.state.wsStatus &&
    prev.agent.state.circuitBreakerTripped === next.agent.state.circuitBreakerTripped &&
    JSON.stringify(prev.agent.state.wsConnection) === JSON.stringify(next.agent.state.wsConnection)
  );
});
