"use client";

import { memo } from "react";
import { Search, BarChart3, ShieldCheck, BrainCircuit, ArrowRightCircle } from "lucide-react";
import type { DecisionData } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  decision: DecisionData | null;
  signalCount: number;
  riskStatus?: string;
}

const stages = [
  { key: "screen", label: "SCREEN", icon: Search, description: "30 coins" },
  { key: "signals", label: "SIGNALS", icon: BarChart3, description: "TA + Sentiment" },
  { key: "risk", label: "RISK", icon: ShieldCheck, description: "Validation" },
  { key: "decision", label: "DECISION", icon: BrainCircuit, description: "LLM Reasoning" },
  { key: "action", label: "ACTION", icon: ArrowRightCircle, description: "Execute" },
];

export const DecisionPipeline = memo(function DecisionPipeline({ decision, signalCount, riskStatus }: Props) {
  const action = decision?.action ?? "hold";
  const hasDecision = decision !== null;
  const isRiskBlocked = riskStatus === "blocked";

  const getStageStatus = (stageKey: string) => {
    if (!hasDecision) {
      // Agent hasn't started yet or no cycle
      return stageKey === "screen" ? "active" : "pending";
    }

    // Map the action to pipeline stages
    const stageOrder = ["screen", "signals", "risk", "decision", "action"];
    const currentIdx = stageOrder.indexOf(stageKey);
    const actionIdx = stageOrder.indexOf("action");

    if (isRiskBlocked) {
      // Risk blocked at risk stage
      if (stageKey === "risk") return "blocked";
      if (stageKey === "screen" || stageKey === "signals") return "completed";
      return "pending";
    }

    if (action === "hold") {
      // Decision = hold, so action stage is skipped
      if (stageKey === "decision") return "completed";
      if (stageKey === "screen" || stageKey === "signals" || stageKey === "risk") return "completed";
      return "pending";
    }

    // Buy/sell - all stages complete
    return "completed";
  };

  return (
    <div className="flex items-center gap-1 py-3">
      {stages.map((stage, i) => {
        const status = getStageStatus(stage.key);
        const Icon = stage.icon;
        const isLast = i === stages.length - 1;

        return (
          <div key={stage.key} className="flex items-center gap-1">
            <div className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded border transition-all duration-500 ${
              status === "completed"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : status === "active"
                ? "bg-white/10 border-white/20 text-white animate-pulse-white"
                : status === "blocked"
                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                : "bg-zinc-900/20 border-zinc-800/40 text-zinc-600"
            }`}>
              <Icon className="w-3 h-3" />
              <span className="text-[9px] font-bold tracking-widest font-mono">{stage.label}</span>
            </div>
            {!isLast && (
              <div className={`w-3 h-px transition-all duration-500 ${
                status === "completed" ? "bg-emerald-500/30" : "bg-zinc-800/40"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
});
