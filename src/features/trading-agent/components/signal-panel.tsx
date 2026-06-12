"use client";

import { memo } from "react";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";
import { DecisionPipeline } from "./decision-pipeline";
import { RadialGauge } from "./radial-gauge";
import type { SignalData, DecisionData } from "@/features/trading-agent/hooks/use-agent";

function tickerFromSignalName(name: string): string {
  const raw = name.replace(/^(LLM|Heuristic)\s*/, "").trim();
  if (/^[A-Z0-9]{2,10}USDT$/.test(raw)) return `${raw.slice(0, -4)}/USDT`;
  return raw;
}

interface Props {
  signals: SignalData[];
  decision: DecisionData | null;
  decisionSource?: "llm" | "heuristic" | null;
}

export const SignalPanel = memo(function SignalPanel({ signals, decision, decisionSource }: Props) {
  if (signals.length === 0 && !decision) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Decision Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-[12px] font-mono text-zinc-500 tracking-wide uppercase">
            <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-empty-pulse mr-2" />
            Waiting for agent cycle initialization...
          </div>
        </CardContent>
      </Card>
    );
  }

  const actionBadge = () => {
    const act = decision?.action ?? "hold";
    if (act === "buy") return <Badge variant="success">BUY</Badge>;
    if (act === "sell") return <Badge variant="danger">SELL</Badge>;
    return <Badge variant="neutral">HOLD</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision Signals</CardTitle>
        <div className="flex items-center gap-2 font-mono">
          {decisionSource === "heuristic" && (
            <span className="text-[9px] font-bold tracking-widest uppercase text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded border border-yellow-400/30">
              FALLBACK
            </span>
          )}
          {actionBadge()}
        </div>
      </CardHeader>
      <CardContent>
        <DecisionPipeline
          decision={decision}
          signalCount={signals.length}
          riskStatus={decision ? (decision as any).riskStatus : undefined}
        />

        {(() => {
          const activeDecision = decision ?? {
            action: "hold" as const, strength: 0, confidence: 0,
            reason: "System active. Standard monitoring mode.",
          };
          const rsiMatch = activeDecision.reason.match(/RSI\s*(?:is|at|of)?\s*(\d+(?:\.\d+)?)/i);
          const rsi = rsiMatch ? parseFloat(rsiMatch[1]) : null;
          const topSignal = signals.reduce((best, s) =>
            Math.abs(s.strength) > Math.abs(best.strength) ? s : best, signals[0] ?? null
          );
          const decisionTicker = topSignal ? tickerFromSignalName(topSignal.name) : null;

          return (
            <div className="mt-3 pt-3 border-t border-obsidian-border space-y-3 font-mono text-[12px]">
              <div className="grid grid-cols-2 gap-3">
                {/* Left: Confidence Radial Gauge */}
                <div className="flex flex-col items-center justify-center p-2.5 bg-obsidian-light/25 border border-obsidian-border/50 rounded">
                  <RadialGauge value={activeDecision.confidence * 100} size={90} label="CONFIDENCE" />
                  <span className="text-[12px] font-black text-zinc-100 mt-1">
                    {(activeDecision.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Right: Conviction strength bar */}
                <div className="flex flex-col justify-center p-2.5 bg-obsidian-light/25 border border-obsidian-border/50 rounded gap-1.5">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    <span>Conviction</span>
                    {decisionTicker && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-obsidian-lighter text-zinc-400 border border-obsidian-border">
                        {decisionTicker}
                      </span>
                    )}
                  </div>
                  <span className={`text-[14px] font-black leading-none ${activeDecision.strength > 0 ? "text-emerald-400" : activeDecision.strength < 0 ? "text-rose-400" : "text-zinc-500"}`}>
                    {activeDecision.strength > 0 ? "+" : ""}{(activeDecision.strength * 100).toFixed(0)}%
                  </span>
                  
                  <div className="w-full bg-obsidian-lighter rounded-full h-1 relative overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        activeDecision.strength > 0 ? "bg-emerald-500" :
                        activeDecision.strength < 0 ? "bg-rose-500" : "bg-zinc-600"
                      }`}
                      style={{
                        width: `${Math.max(6, Math.abs(activeDecision.strength) * 50)}%`,
                        marginLeft: activeDecision.strength >= 0 ? "50%" : `${50 - Math.abs(activeDecision.strength) * 50}%`
                      }}
                    />
                    <div className="absolute left-1/2 top-0 w-0.5 h-full bg-obsidian-border" />
                  </div>
                </div>
              </div>

              {rsi !== null && (
                <div className="space-y-1 py-2 px-2.5 bg-obsidian-light/30 rounded border border-obsidian-border/60">
                  <div className="flex justify-between text-[11px] text-zinc-500 font-bold">
                    <span>RSI(14)</span>
                    <span className={rsi >= 70 ? "text-rose-400" : rsi <= 30 ? "text-emerald-400" : "text-zinc-300"}>
                      {rsi.toFixed(1)}
                    </span>
                  </div>
                  <div className="relative w-full h-1 bg-obsidian-lighter rounded-full overflow-hidden">
                    <div className={`absolute top-0 w-1.5 h-full rounded-full transition-all duration-500 ${
                      rsi >= 70 ? "bg-rose-400" : rsi <= 30 ? "bg-emerald-400" : "bg-zinc-400"
                    }`} style={{ left: `calc(${rsi}% - 3px)` }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-zinc-600 font-bold">
                    <span>30</span>
                    <span>70</span>
                  </div>
                </div>
              )}

              <p className="text-[12px] text-zinc-400 leading-relaxed italic font-sans border-t border-obsidian-border/30 pt-2">
                {activeDecision.reason}
              </p>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}, (prev, next) => {
  return (
    prev.signals.length === next.signals.length &&
    JSON.stringify(prev.decision) === JSON.stringify(next.decision) &&
    prev.signals.every((s, i) => s.strength === next.signals[i]?.strength && s.direction === next.signals[i]?.direction) &&
    prev.decisionSource === next.decisionSource
  );
});
