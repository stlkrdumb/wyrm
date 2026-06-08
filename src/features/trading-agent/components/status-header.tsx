"use client";

import { memo } from "react";
import { Badge } from "@/shared/ui";
import type { useAgent } from "../hooks/use-agent";

interface Props {
  agent: ReturnType<typeof useAgent>;
}

export const StatusHeader = memo(function StatusHeader({ agent }: Props) {
  const { state, runCycle, setAgentStatus } = agent;
  const { status, lastCycleAt } = state;

  const renderBadge = () => {
    switch (status) {
      case "running": return <Badge variant="success">Running</Badge>;
      case "paused": return <Badge variant="warning">Paused</Badge>;
      default: return <Badge variant="danger">Stopped</Badge>;
    }
  };

  const renderWSBadge = () => {
    if (state.wsStatus === "connected") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Direct WS
        </span>
      );
    }

    if (state.wsStatus === "reconnecting") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          WS Reconnect
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-rose-500/20 text-rose-400 border border-rose-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        REST Fallback
      </span>
    );
  };

  const uptime = lastCycleAt ? new Date(lastCycleAt).toLocaleTimeString() : "--:--:--";

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
      {/* Left: Logo + WS status */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
          WYRM Trader
        </h1>
        {renderBadge()}
        {renderWSBadge()}
        {lastCycleAt && (
          <span className="text-xs text-zinc-500">Last cycle: {uptime}</span>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {status !== "running" ? (
          <button
            onClick={() => setAgentStatus("running")}
            className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-sm focus:outline-none shadow-lg shadow-blue-500/20"
          >
            &#9654; Start
          </button>
        ) : (
          <button
            onClick={() => setAgentStatus("paused")}
            className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 text-sm focus:outline-none"
          >
            &#9646;&#9646; Pause
          </button>
        )}
        <button
          onClick={() => setAgentStatus("stopped")}
          className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 text-sm focus:outline-none"
        >
          &#9632; Stop
        </button>
      </div>
    </header>
  );
}, (prev, next) => {
  return (
    prev.agent.state.status === next.agent.state.status &&
    prev.agent.state.lastCycleAt === next.agent.state.lastCycleAt &&
    prev.agent.state.wsStatus === next.agent.state.wsStatus &&
    JSON.stringify(prev.agent.state.wsConnection) === JSON.stringify(next.agent.state.wsConnection)
  );
});
