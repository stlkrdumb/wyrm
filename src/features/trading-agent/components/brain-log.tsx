"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { DecisionData } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  llmProgress?: { text: string; tokensReceived: number } | null;
  lastDecision: DecisionData | null;
  isTabMode?: boolean;
}

export const BrainLog = memo(function BrainLog({ llmProgress, lastDecision, isTabMode }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lastCompleteThought, setLastCompleteThought] = useState<string>("");

  // Keep track of the last complete streaming thought so it persists when idle
  useEffect(() => {
    if (llmProgress?.text) {
      setLastCompleteThought(llmProgress.text);
    }
  }, [llmProgress?.text]);

  // Auto-scroll to bottom of the stream as new tokens arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [llmProgress?.text, lastCompleteThought]);

  const isStreaming = !!llmProgress?.text && llmProgress.tokensReceived > 0;

  const content = isStreaming
    ? llmProgress.text
    : lastCompleteThought || lastDecision?.reason || "Cognitive core idle. Awaiting next screening cycle...";

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full font-mono text-[12px] leading-relaxed select-text">
      {/* Active State Header Indicator */}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-obsidian-border/50 text-[10px] uppercase tracking-wider text-zinc-500">
        {isStreaming ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-emerald-400 font-bold">STREAMING COGNITIVE FLOW...</span>
            <span className="ml-auto text-zinc-600 tabular-nums">TOKENS: {llmProgress?.tokensReceived}</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            <span>CORE COLD / COGNITIVE STATE PERSISTED</span>
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-none text-zinc-300 whitespace-pre-wrap pr-1"
      >
        {content}
        {isStreaming && (
          <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-0.5 animate-pulse vertical-middle" />
        )}
      </div>
    </div>
  );
});
