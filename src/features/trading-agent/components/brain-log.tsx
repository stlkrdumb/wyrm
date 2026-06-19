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

  const formatJSONLikeText = (text: string) => {
    // Basic regex-based syntax highlighter for JSON-like streams
    return text.split("\n").map((line, i) => {
      let styledLine = line
        // Escape HTML
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // Style JSON keys
      styledLine = styledLine.replace(/&quot;(.*?)&quot;\s*:/g, '<span class="text-zinc-500">"$1"</span>:');
      
      // Style string values
      styledLine = styledLine.replace(/:\s*&quot;(.*?)&quot;/g, (match, p1) => {
        let valColor = "text-emerald-200/80";
        if (p1.toLowerCase() === "buy") valColor = "text-emerald-400 font-bold tracking-wider";
        if (p1.toLowerCase() === "sell") valColor = "text-rose-400 font-bold tracking-wider";
        if (p1.toLowerCase() === "hold") valColor = "text-yellow-400 font-bold tracking-wider";
        return `: <span class="${valColor}">"${p1}"</span>`;
      });

      // Style numbers
      styledLine = styledLine.replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="text-cyan-400 tabular-nums">$1</span>');

      // Style booleans
      styledLine = styledLine.replace(/:\s*(true|false|null)/g, ': <span class="text-purple-400 font-bold">$1</span>');

      // Dim curly braces and brackets
      styledLine = styledLine.replace(/([{}\[\]])/g, '<span class="text-zinc-600">$1</span>');

      return (
        <span key={i}>
          {line.trim() === "" ? <br /> : <span dangerouslySetInnerHTML={{ __html: styledLine }} />}
          {i !== text.split("\n").length - 1 && <br />}
        </span>
      );
    });
  };

  const parseContent = (text: string) => {
    // 1. Strip markdown code block wrappers if they exist
    let cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

    // 2. Split by <think> tags to style internal reasoning differently
    const parts = cleaned.split(/(<think>[\s\S]*?(?:<\/think>|$))/gi);
    
    return parts.filter(p => p.trim() !== "").map((part, index) => {
      const isThinkBlock = part.toLowerCase().startsWith("<think>");
      
      if (isThinkBlock) {
        // Remove the tags for cleaner display, style as dim/italic reasoning
        const innerText = part.replace(/<\/?think>/gi, "").trim();
        return (
          <div key={index} className="pl-3 py-1 my-3 border-l-2 border-zinc-700/50 bg-zinc-900/20 text-zinc-500 italic text-[11px] rounded-r">
            <div className="text-[9px] font-bold tracking-widest uppercase mb-1 opacity-70 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />
              Cognitive Context Thread
            </div>
            {innerText}
          </div>
        );
      }

      // 3. Render the rest as stylized JSON/text
      return (
        <div key={index} className="my-2 p-2 bg-obsidian-lighter/50 rounded border border-obsidian-border/50">
          {formatJSONLikeText(part)}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full font-mono text-[12px] leading-relaxed select-text">
      {/* Active State Header Indicator */}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-obsidian-border/50 text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">
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
        className="flex-1 scroll-area custom-scrollbar scroll-smooth-touch whitespace-pre-wrap pr-1"
      >
        {parseContent(content)}
        {isStreaming && (
          <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
});
