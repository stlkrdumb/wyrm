import { memo } from "react";
import { Badge } from "@/shared/ui";
import type { useAgent } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  agent: ReturnType<typeof useAgent>;
}

export const BottomStatusBar = memo(function BottomStatusBar({ agent }: Props) {
  const { state } = agent;
  const { status, lastCycleAt } = state;

  const renderBadge = () => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-phosphor-green/30 text-phosphor-green phosphor-glow-green">
            <span className="w-1.5 h-1.5 bg-phosphor-green animate-pulse" />
            ACTIVE
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-amber-500/30 text-amber-400">
            <span className="w-1.5 h-1.5 bg-amber-400" />
            PAUSED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-phosphor-dim/30 text-phosphor-dim">
            <span className="w-1.5 h-1.5 bg-phosphor-dim" />
            OFFLINE
          </span>
        );
    }
  };

  const renderWSBadge = () => {
    if (state.wsStatus === "connected") {
      if (state.wsConnection?.type === "proxy") {
        return (
          <span title={state.wsConnection?.proxy || "Proxy Route"} className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-amber-500/30 text-amber-400 cursor-help">
            <span className="w-1.5 h-1.5 bg-amber-400 animate-pulse" />
            PROXY
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-phosphor-dim/30 text-phosphor-muted">
          <span className="w-1.5 h-1.5 bg-phosphor-muted" />
          WS
        </span>
      );
    }
    if (state.wsStatus === "reconnecting") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-amber-500/30 text-amber-400 animate-pulse">
          <span className="w-1.5 h-1.5 bg-amber-400 animate-ping" />
          RECON
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-phosphor-red/30 text-phosphor-red">
        <span className="w-1.5 h-1.5 bg-phosphor-red" />
        REST
      </span>
    );
  };

  const uptime = lastCycleAt ? new Date(lastCycleAt).toLocaleTimeString() : "--:--:--";
  const llmStatus = state.llmProgress?.text || "";
  const showLlmProgress = status === "running" && llmStatus.length > 0;

  return (
    <footer className="terminal-status-bar px-4 py-2 flex items-center justify-between text-[9px] font-mono relative z-50">
      <div className="flex items-center gap-2">
        {renderBadge()}
        {renderWSBadge()}
        {state.circuitBreakerTripped && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border border-phosphor-red/30 text-phosphor-red animate-pulse">
            BREAKER
          </span>
        )}
        {state.modelName && (
          <Badge variant="neutral" className="text-[9px] uppercase">{state.modelName}</Badge>
        )}
        {lastCycleAt && (
          <span className="text-phosphor-dim tracking-wider uppercase flex items-center gap-1">
            <span className="text-phosphor-dim/50">CYCLE</span>
            {uptime}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {showLlmProgress && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-medium tracking-wider uppercase border border-amber-500/30 text-amber-400">
            <span className="w-1.5 h-1.5 bg-amber-400 animate-pulse" />
            LLM
            <span className="text-phosphor-dim font-normal">({state.llmProgress?.tokensReceived || 0}t)</span>
          </span>
        )}
        <span className="text-phosphor-dim/50 tracking-widest uppercase">WYRM_TRADER // v0.1.0</span>
      </div>
    </footer>
  );
});
