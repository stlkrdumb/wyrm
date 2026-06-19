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
    success: "text-emerald-400 border-emerald-500/20 hover:border-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 hover:shadow-[0_0_8px_oklch(50%_0.2_155_/_0.3)]",
    warning: "text-amber-400 border-amber-500/20 hover:border-amber-400 bg-amber-500/5 hover:bg-amber-500/10 hover:shadow-[0_0_8px_oklch(65%_0.15_80_/_0.3)]",
    danger: "text-rose-400 border-rose-500/20 hover:border-rose-400 bg-rose-500/5 hover:bg-rose-500/10 hover:shadow-[0_0_8px_oklch(50%_0.2_27_/_0.3)]",
    info: "text-zinc-300 border-zinc-800/80 hover:border-zinc-600 bg-zinc-900/40 hover:bg-zinc-800/20",
    neutral: "text-zinc-500 border-zinc-900 hover:border-zinc-800 hover:text-zinc-300 bg-transparent"
  };

  return (
    <button
      onClick={onClick}
      className={`touch-target-sm flex items-center gap-1 px-2 py-1 rounded-md border font-mono text-[9px] font-bold tracking-widest uppercase transition-all duration-150 cursor-pointer active:scale-95 ${colors[variant]}`}
      aria-label={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
});

export const BottomStatusBar = memo(function BottomStatusBar({ agent }: Props) {
  const { state, setAgentStatus, runCycle } = agent;
  const { status, lastCycleAt } = state;
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then(res => res.json())
      .then(data => setIsAdmin(!!data.authenticated))
      .catch(() => setIsAdmin(false));
  }, []);

  const renderBadge = () => {
    switch (status) {
      case "running":
        return (
          <span className="status-badge status-badge-live">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ACTIVE
          </span>
        );
      case "paused":
        return (
          <span className="status-badge status-badge-paused">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            PAUSED
          </span>
        );
      default:
        return (
          <span className="status-badge status-badge-offline">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            OFFLINE
          </span>
        );
    }
  };

  const renderWSBadge = () => {
    if (state.wsStatus === "connected") {
      if (state.wsConnection?.type === "proxy") {
        return (
          <span title={state.wsConnection?.proxy || "Proxy Route"} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-white/10 text-white border border-white/20 cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            PROXY
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-zinc-500/10 text-zinc-300 border border-zinc-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
          WS
        </span>
      );
    }
    if (state.wsStatus === "reconnecting") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" />
          RECON
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        REST
      </span>
    );
  };

  const renderSSEBadge = () => {
    if (state.sseConnected) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          SSE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
        SSE
      </span>
    );
  };

  const uptime = lastCycleAt ? new Date(lastCycleAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--";

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-obsidian-border bg-obsidian-light/95 backdrop-blur-xl px-4 py-2 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono gap-2 sm:gap-0 safe-area-pb">
      <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
        {renderBadge()}
        {renderWSBadge()}
        {renderSSEBadge()}
        {state.circuitBreakerTripped && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wider uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
            BREAKER
          </span>
        )}
        {lastCycleAt && (
          <span className="text-zinc-500 tracking-wider uppercase flex items-center gap-1">
            <span className="text-zinc-600">CYCLE</span>
            {uptime}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isAdmin ? (
          <div className="flex items-center gap-1.5">
            {status !== "running" && (
              <TerminalButton
                variant="success"
                label="Start"
                icon={<Play className="w-2.5 h-2.5" />}
                onClick={() => setAgentStatus("running")}
              />
            )}
            {status === "running" && (
              <TerminalButton
                variant="warning"
                label="Pause"
                icon={<Pause className="w-2.5 h-2.5" />}
                onClick={() => setAgentStatus("paused")}
              />
            )}
            {status !== "stopped" && (
              <TerminalButton
                variant="danger"
                label="Stop"
                icon={<Power className="w-2.5 h-2.5" />}
                onClick={() => setAgentStatus("stopped")}
              />
            )}
            <TerminalButton
              variant="info"
              label="Cycle"
              icon={<RefreshCw className="w-2.5 h-2.5" />}
              onClick={runCycle}
            />
            <TerminalButton
              variant="neutral"
              label="Logout"
              icon={<LogOut className="w-2.5 h-2.5" />}
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.reload();
              }}
            />
          </div>
        ) : (
          <span className="text-zinc-600 tracking-widest uppercase hidden sm:inline">WYRM // V0.1.0</span>
        )}
      </div>
    </footer>
  );
});
