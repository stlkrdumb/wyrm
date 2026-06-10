"use client";

import { memo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";
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
          <div className="text-[11px] font-mono text-phosphor-dim py-12 text-center tracking-wide uppercase">
            Waiting for agent cycle initialization...
          </div>
        </CardContent>
      </Card>
    );
  }

  const directionIcon = (direction: SignalData["direction"]) => {
    switch (direction) {
      case "bullish": return <TrendingUp className="w-3.5 h-3.5 text-phosphor-green" />;
      case "bearish": return <TrendingDown className="w-3.5 h-3.5 text-phosphor-red" />;
      default: return <Minus className="w-3.5 h-3.5 text-phosphor-dim" />;
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
        {signals.length > 0 ? (
          <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto scrollbar-none pr-1 -mr-1 flex-shrink-0">
            {signals.map((signal, i) => (
              <div key={i} className="flex items-start justify-between py-1.5 border-b border-amber-900/10 last:border-0 font-mono gap-3">
                <div className="flex items-start gap-2.5 min-w-[85px] flex-1">
                  <span className="mt-0.5 flex-shrink-0">{directionIcon(signal.direction)}</span>
                  <span className="text-[11px] text-amber-100/80 whitespace-nowrap">{tickerFromSignalName(signal.name)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={signalBadgeVariant(signal.direction)}>
                    {signal.direction === "bullish" ? "BULL" : signal.direction === "bearish" ? "BEAR" : "FLAT"}
                  </Badge>
                  <span className="text-[10px] text-phosphor-muted tabular-nums min-w-[2.5rem] text-right">
                    {(signal.strength * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] font-mono text-phosphor-dim py-4 text-center">No active signals</div>
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
            <div className="mt-2 pt-4 border-t border-amber-900/20 space-y-4 font-mono text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-phosphor-dim uppercase text-[10px]">Decision Strength</span>
                <div className="flex items-center gap-2">
                  {topSignal && (
                    <span className="px-1.5 py-0.2 text-[8px] font-bold bg-[#0a0a0a] text-phosphor-muted border border-amber-900/20">
                      {decisionTicker}
                    </span>
                  )}
                  <span className={`font-bold ${activeDecision.strength > 0 ? "text-phosphor-green phosphor-glow-green" : activeDecision.strength < 0 ? "text-phosphor-red phosphor-glow-red" : "text-phosphor-dim"}`}>
                    {activeDecision.strength > 0 ? "+" : ""}{(activeDecision.strength * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="w-full h-[2px] bg-amber-900/20 relative overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    activeDecision.strength > 0 ? "bg-phosphor-green" :
                    activeDecision.strength < 0 ? "bg-phosphor-red" : "bg-phosphor-dim"
                  }`}
                  style={{
                    width: `${Math.max(6, Math.abs(activeDecision.strength) * 50)}%`,
                    marginLeft: activeDecision.strength >= 0 ? "50%" : `${50 - Math.abs(activeDecision.strength) * 50}%`,
                    boxShadow: activeDecision.strength !== 0 ? `0 0 4px ${activeDecision.strength > 0 ? 'rgba(51,255,0,0.3)' : 'rgba(255,51,51,0.3)'}` : 'none'
                  }}
                />
                <div className="absolute left-1/2 top-0 w-[1px] h-full bg-amber-900/30" />
              </div>

              {rsi !== null && (
                <div className="space-y-1.5 py-2.5 px-3 bg-[#0a0a0a]/50 border border-amber-900/20">
                  <div className="flex justify-between text-[10px] text-phosphor-dim font-bold">
                    <span>COMPUTED RSI(14)</span>
                    <span className={rsi >= 70 ? "text-phosphor-red" : rsi <= 30 ? "text-phosphor-green" : "text-amber-100/70"}>
                      {rsi.toFixed(1)}
                    </span>
                  </div>
                  <div className="relative w-full h-[2px] bg-amber-900/20 overflow-hidden">
                    <div className="absolute left-0 top-0 h-full w-[30%] bg-phosphor-green/5" />
                    <div className="absolute left-[30%] top-0 h-full w-[40%] bg-amber-900/5" />
                    <div className="absolute left-[70%] top-0 h-full w-[30%] bg-phosphor-red/5" />
                    <div className={`absolute top-0 w-[2px] h-full transition-all duration-500 ${
                      rsi >= 70 ? "bg-phosphor-red" : rsi <= 30 ? "bg-phosphor-green" : "bg-phosphor-muted"
                    }`} style={{ left: `calc(${rsi}% - 1px)` }} />
                  </div>
                  <div className="flex justify-between text-[8px] text-phosphor-dim/50 font-bold">
                    <span>OVERSOLD (30)</span>
                    <span>OVERBOUGHT (70)</span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-amber-100/50 leading-relaxed italic border-l border-amber-900/20 pl-3 bg-[#0a0a0a]/20 py-2 rounded-r font-mono">
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
