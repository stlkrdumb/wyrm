"use client";

import { memo, useEffect, useState } from "react";
import type { useAgent } from "@/features/trading-agent/hooks/use-agent";
import { Play, Pause, Power, RefreshCw, LogOut } from "lucide-react";

interface Props {
  agent: ReturnType<typeof useAgent>;
}

interface TerminalButtonProps {
  onClick: () => void | Promise<void>;
  label: string;
  icon: React.ReactNode;
  variant: "success" | "warning" | "danger" | "info" | "neutral";
}

const TerminalButton = memo(function TerminalButton({ onClick, label, icon, variant }: TerminalButtonProps) {
  const colors = {
    success: "text-emerald-400 border-emerald-500/20 hover:border-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.05)] hover:shadow-[0_0_16px_rgba(16,185,129,0.12)]",
    warning: "text-amber-400 border-amber-500/20 hover:border-amber-400 bg-amber-500/5 hover:bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.05)] hover:shadow-[0_0_16px_rgba(245,158,11,0.12)]",
    danger: "text-rose-400 border-rose-500/20 hover:border-rose-400 bg-rose-500/5 hover:bg-rose-500/10 shadow-[0_0_12px_rgba(244,63,94,0.05)] hover:shadow-[0_0_16px_rgba(244,63,94,0.12)]",
    info: "text-zinc-300 border-zinc-800/80 hover:border-zinc-600 bg-zinc-900/40 hover:bg-zinc-800/20 shadow-none",
    neutral: "text-zinc-400 border-zinc-900 hover:border-zinc-800 hover:text-zinc-200 bg-transparent shadow-none"
  };

  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border font-mono text-[10px] font-bold tracking-widest uppercase transition-all duration-200 cursor-pointer active:scale-95 ${colors[variant]}`}
    >
      <span className="transition-transform duration-200 group-hover:scale-110">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
});

export const StatusHeader = memo(function StatusHeader({ agent }: Props) {
  const { state, setAgentStatus, runCycle } = agent;
  const { status } = state;
  const [staleSec, setStaleSec] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then(res => res.json())
      .then(data => setIsAdmin(!!data.authenticated))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!state.lastFetchAt) return;
    const tick = () => setStaleSec(Math.round((Date.now() - state.lastFetchAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.lastFetchAt]);

  return (
    <header className="sticky top-0 z-40 flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-obsidian-border bg-obsidian-light/80 backdrop-blur-xl gap-3 sm:gap-0">
      <div className="flex items-center gap-3 sm:gap-4">
        <img src="/logo.svg" alt="Wyrm" className="h-8 sm:h-10 w-auto opacity-90" />
        <div className="flex flex-col">
          <h1 className="text-sm font-bold tracking-[0.2em] text-zinc-100 uppercase font-mono">
            WYRM
          </h1>
          <span className="text-[10px] sm:text-[12px] font-mono tracking-widest text-zinc-500 uppercase">
            Autonomous Trading Terminal
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 self-end sm:self-auto flex-wrap justify-end">
        {isAdmin && (
          <div className="flex items-center gap-2 mr-2 border-r border-obsidian-border/50 pr-4">
            {status !== "running" && (
              <TerminalButton
                variant="success"
                label="Start"
                icon={<Play className="w-3 h-3" />}
                onClick={() => setAgentStatus("running")}
              />
            )}
            {status === "running" && (
              <TerminalButton
                variant="warning"
                label="Pause"
                icon={<Pause className="w-3 h-3" />}
                onClick={() => setAgentStatus("paused")}
              />
            )}
            <TerminalButton
              variant="danger"
              label="Stop (Liq)"
              icon={<Power className="w-3 h-3" />}
              onClick={() => setAgentStatus("stopped")}
            />
            <TerminalButton
              variant="info"
              label="Run Cycle"
              icon={<RefreshCw className="w-3 h-3" />}
              onClick={runCycle}
            />
            <TerminalButton
              variant="neutral"
              label="Logout"
              icon={<LogOut className="w-3 h-3" />}
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.reload();
              }}
            />
          </div>
        )}

        {/* Staleness */}
        {state.lastFetchAt > 0 ? (
          staleSec > 30 ? (
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-rose-400 animate-pulse">
              STALE ({staleSec}s)
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-600">
              SYNCED
            </span>
          )
        ) : (
          <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-600">
            IDLE
          </span>
        )}
        
        {/* Model/Status Indicator */}
        <div className="flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded bg-obsidian-lighter border border-obsidian-border">
          <div className={`w-2 h-2 rounded-full ${
            status === "running" 
              ? "bg-emerald-400 animate-pulse" 
              : status === "paused" 
              ? "bg-yellow-400" 
              : "bg-zinc-500"
          }`} />
          <span className="text-[10px] sm:text-[12px] font-mono font-bold tracking-widest uppercase text-zinc-400">
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
