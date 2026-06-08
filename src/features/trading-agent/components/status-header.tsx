"use client";

import { Badge } from "@/shared/ui";
import type { useAgent } from "../hooks/use-agent";

interface Props {
  agent: ReturnType<typeof useAgent>;
}

export function StatusHeader({ agent }: Props) {
  const { state, runCycle, setAgentStatus } = agent;
  const { status, lastCycleAt } = state;

  const renderBadge = () => {
    switch (status) {
      case "running": return <Badge variant="success">Running</Badge>;
      case "paused": return <Badge variant="warning">Paused</Badge>;
      default: return <Badge variant="danger">Stopped</Badge>;
    }
  };

  const uptime = lastCycleAt ? new Date(lastCycleAt).toLocaleTimeString() : "--:--:--";

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
      {/* Left: Logo + WS status */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight text-zinc-50">WYRM Trader</h1>
        {renderBadge()}
        {/* WS Connection Status */}
        <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide
          ${state.wsStatus === "connected" ? "bg-emerald-500/20 text-emerald-400" :
            state.wsStatus === "reconnecting" ? "bg-orange-500/20 text-orange-400 animate-pulse" :
            "bg-zinc-700/50 text-zinc-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            state.wsStatus === "connected" ? "bg-emerald-400" :
            state.wsStatus === "reconnecting" ? "bg-orange-400 animate-ping" :
            "bg-zinc-500"
          }`} />
          WS
        </span>
        {lastCycleAt && (
          <span className="text-xs text-zinc-500">Last cycle: {uptime}</span>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {status !== "running" ? (
          <button
            onClick={() => setAgentStatus("running")}
            className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-sm focus:outline-none"
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
}
