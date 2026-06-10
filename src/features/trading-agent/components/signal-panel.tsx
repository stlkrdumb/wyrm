"use client";

import { memo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";
import { DecisionPipeline } from "./decision-pipeline";
import type { SignalData, DecisionData } from "@/features/trading-agent/hooks/use-agent";

function tickerFromSignalName(name: string): string {
  const raw = name.replace(/^(LLM|Heuristic)\s*/, "").trim();
  if (/^[A-Z0-9]{2,10}USDT$/.test(raw)) return `${raw.slice(0, -4)}/USDT`;
  return raw;
}

interface Props {
  signals: SignalData[];
  decision: DecisionData | null;
}

const signalBadgeVariant = (d: SignalData["direction"]): "success" | "danger" | "neutral" => {
  switch (d) {
    case "bullish": return "success";
    case "bearish": return "danger";
    default: return "neutral";
  }
};

export const SignalPanel = memo(function SignalPanel({ signals, decision }: Props) {
  if (signals.length === 0 && !decision) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Decision Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative flex items-center justify-center py-12 overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }} />
            <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent animate-scan-line" />
            <div className="relative z-10 flex flex-col items-center gap-2 text-[11px] font-mono text-zinc-500 tracking-wide uppercase">
              <div className="w-2 h-2 rounded-full bg-amber-500/30 animate-empty-pulse" />
              <span>Waiting for agent cycle initialization...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const directionIcon = (direction: SignalData["direction"]) => {
    switch (direction) {
      case "bullish": return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
      case "bearish": return <TrendingDown className="w-3.5 h-3.5 text-rose-400" />;
      default: return <Minus className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const actionBadge = () => {
    const act = decision?.action ?? "hold";
    if (act === "buy") return <Badge variant="success">BUY</Badge>;
    if (act === "sell") return <Badge variant="danger">SELL</Badge>;
    return <Badge variant="neutral">HOLD</Badge>;
  };

  return (
    <Card className="min-h-[480px]">
      <CardHeader>
        <CardTitle>Decision Signals</CardTitle>
        <div className="flex items-center gap-2 font-mono">{actionBadge()}</div>
      </CardHeader>
      <CardContent>
        <DecisionPipeline
          decision={decision}
          signalCount={signals.length}
          riskStatus={decision ? (decision as any).riskStatus : undefined}
        />
        {signals.length > 0 ? (
          <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto scrollbar-none pr-1 -mr-1 flex-shrink-0">
            {signals.map((signal, i) => (
              <div key={i} className="flex items-start justify-between py-1.5 border-b border-zinc-800/20 last:border-0 font-mono gap-3">
                <div className="flex items-start gap-2.5 min-w-[85px] flex-1">
                  <span className="mt-0.5 flex-shrink-0">{directionIcon(signal.direction)}</span>
                  <span className="text-[11px] text-zinc-300 whitespace-nowrap">{tickerFromSignalName(signal.name)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={signalBadgeVariant(signal.direction)}>
                    {signal.direction === "bullish" ? "BULL" : signal.direction === "bearish" ? "BEAR" : "FLAT"}
                  </Badge>
                  <span className="text-[10px] text-zinc-400 tabular-nums min-w-[2.5rem] text-right">
                    {(signal.strength * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] font-mono text-zinc-500 py-4 text-center">No active signals</div>
        )}

        {(() => {
          const activeDecision = decision ?? {
            action: "hold" as const, strength: 0, confidence: 0,
            reason: "System active. Standard monitoring mode.",
          };
          const topSignal = signals.reduce((best, s) =>
            Math.abs(s.strength) > Math.abs(best.strength) ? s : best, signals[0] ?? null
          );
          const decisionTicker = topSignal ? tickerFromSignalName(topSignal.name) : "ALL";
          const rsiMatch = activeDecision.reason.match(/RSI\s*\(?(\d+(?:\.\d+)?)\)?/i);
          const rsi = rsiMatch ? parseFloat(rsiMatch[1]) : null;

          return (
            <div className="mt-2 pt-4 border-t border-zinc-800 space-y-4 font-mono text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 uppercase text-[10px]">Decision Strength</span>
                <div className="flex items-center gap-2">
                  {topSignal && (
                    <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-zinc-900 text-zinc-400 border border-zinc-800">
                      {decisionTicker}
                    </span>
                  )}
                  <span className={`font-bold ${activeDecision.strength > 0 ? "text-emerald-400" : activeDecision.strength < 0 ? "text-rose-400" : "text-zinc-500"}`}>
                    {activeDecision.strength > 0 ? "+" : ""}{(activeDecision.strength * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="w-full bg-zinc-800 rounded-full h-1 relative overflow-hidden">
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
                <div className="absolute left-1/2 top-0 w-0.5 h-full bg-zinc-700" />
              </div>

              {rsi !== null && (
                <div className="space-y-1.5 py-2.5 px-3 bg-zinc-950/30 rounded border border-zinc-800/60">
                  <div className="flex justify-between text-[10px] text-zinc-500 font-bold">
                    <span>COMPUTED RSI(14)</span>
                    <span className={rsi >= 70 ? "text-rose-400" : rsi <= 30 ? "text-emerald-400" : "text-zinc-300"}>
                      {rsi.toFixed(1)}
                    </span>
                  </div>
                  <div className="relative w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="absolute left-0 top-0 h-full w-[30%] bg-emerald-500/5" />
                    <div className="absolute left-[30%] top-0 h-full w-[40%] bg-zinc-800/10" />
                    <div className="absolute left-[70%] top-0 h-full w-[30%] bg-rose-500/5" />
                    <div className={`absolute top-0 w-1.5 h-full rounded-full transition-all duration-500 ${
                      rsi >= 70 ? "bg-rose-400" : rsi <= 30 ? "bg-emerald-400" : "bg-zinc-400"
                    }`} style={{ left: `calc(${rsi}% - 3px)` }} />
                  </div>
                  <div className="flex justify-between text-[8px] text-zinc-600 font-bold">
                    <span>OVERSOLD (30)</span>
                    <span>OVERBOUGHT (70)</span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-zinc-400 leading-relaxed italic border-l border-zinc-700 pl-3 bg-zinc-950/20 py-2 rounded-r font-sans">
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
    prev.signals.every((s, i) => s.strength === next.signals[i]?.strength && s.direction === next.signals[i]?.direction)
  );
});
