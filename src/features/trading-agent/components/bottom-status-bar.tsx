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
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ACTIVE
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            PAUSED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-zinc-500/15 text-zinc-400 border border-zinc-500/25">
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
          <span title={state.wsConnection?.proxy || "Proxy Route"} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            PROXY
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-zinc-500/15 text-zinc-300 border border-zinc-500/25">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
          WS
        </span>
      );
    }
    if (state.wsStatus === "reconnecting") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          RECON
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-rose-500/15 text-rose-400 border border-rose-500/25">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        REST
      </span>
    );
  };

  const uptime = lastCycleAt ? new Date(lastCycleAt).toLocaleTimeString() : "--:--:--";
  const llmStatus = state.llmProgress?.text || "";
  const showLlmProgress = status === "running" && llmStatus.length > 0;

  return (
    <footer className="sticky bottom-0 z-50 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-lg px-4 py-2 flex items-center justify-between text-[9px] font-mono">
      <div className="flex items-center gap-2">
        {renderBadge()}
        {renderWSBadge()}
        {state.circuitBreakerTripped && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-rose-500/15 text-rose-400 border border-rose-500/25 animate-pulse">
            BREAKER
          </span>
        )}
        {state.modelName && (
          <Badge variant="neutral" className="text-[9px] uppercase">{state.modelName}</Badge>
        )}
        {lastCycleAt && (
          <span className="text-zinc-500 tracking-wider uppercase flex items-center gap-1">
            <span className="text-zinc-600">CYCLE</span>
            {uptime}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {showLlmProgress && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-medium tracking-wider uppercase bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            LLM
            <span className="text-zinc-600 font-normal">({state.llmProgress?.tokensReceived || 0}t)</span>
          </span>
        )}
        <span className="text-zinc-600 tracking-widest uppercase">WYRM // V0.1.0</span>
      </div>
    </footer>
  );
});
