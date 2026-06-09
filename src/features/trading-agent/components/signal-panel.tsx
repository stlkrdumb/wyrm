"use client";

import { memo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SignalData, DecisionData } from "../hooks/use-agent";

function tickerFromSignalName(name: string): string {
  const raw = name.replace(/^(LLM|Heuristic)\s*/, "").trim();
  if (/^[A-Z]{3,6}USDT$/.test(raw)) {
    return `${raw.slice(0, -4)}/USDT`;
  }
  return raw;
}

interface Props {
  signals: SignalData[];
  decision: DecisionData | null;
}

export const SignalPanel = memo(function SignalPanel({ signals, decision }: Props) {
  if (signals.length === 0 && !decision) {
    return (
      <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
          <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">Market Signals</span>
        </div>
        <div className="text-[11px] font-mono text-zinc-500 py-12 text-center tracking-wide uppercase">
          Waiting for agent cycle initialization...
        </div>
      </div>
    );
  }

  const directionIcon = (direction: SignalData["direction"]) => {
    switch (direction) {
      case "bullish": return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
      case "bearish": return <TrendingDown className="w-3.5 h-3.5 text-rose-400" />;
      default: return <Minus className="w-3.5 h-3.5 text-zinc-550" />;
    }
  };

  const directionBadge = (direction: SignalData["direction"]) => {
    switch (direction) {
      case "bullish":
        return (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            BULL
          </span>
        );
      case "bearish":
        return (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
            BEAR
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider uppercase bg-zinc-900 text-zinc-400 border border-zinc-850">
            FLAT
          </span>
        );
    }
  };

  const actionBadge = () => {
    const act = decision?.action ?? "hold";
    switch (act) {
      case "buy":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            BUY
          </span>
        );
      case "sell":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
            SELL
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-zinc-900 text-zinc-400 border border-zinc-850">
            HOLD
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden min-h-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">Decision Signals</span>
        <div className="flex items-center gap-2 font-mono">
          {actionBadge()}
        </div>
      </div>

      {/* Signals List */}
      {signals.length > 0 ? (
        <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto scrollbar-none pr-1 -mr-1">
          {signals.map((signal, i) => (
            <div key={i} className="flex items-start justify-between py-1.5 border-b border-zinc-900/20 last:border-0 font-mono gap-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <span className="mt-0.5 flex-shrink-0">{directionIcon(signal.direction)}</span>
                <span className="text-[11px] text-zinc-300 break-words">{tickerFromSignalName(signal.name)}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {directionBadge(signal.direction)}
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

      {/* Decision Metric & Details */}
      {(() => {
        const activeDecision = decision ?? {
          action: "hold" as const,
          strength: 0,
          confidence: 0,
          reason: "System active. Standard monitoring mode.",
        };

        const topSignal = signals.reduce((best, s) =>
          Math.abs(s.strength) > Math.abs(best.strength) ? s : best, signals[0] ?? null
        );
        const decisionTicker = topSignal ? tickerFromSignalName(topSignal.name) : "ALL";

        const rsiMatch = activeDecision.reason.match(/RSI\s*\(?(\d+(?:\.\d+)?)\)?/i);
        const rsi = rsiMatch ? parseFloat(rsiMatch[1]) : null;

        return (
          <div className="mt-2 pt-4 border-t border-zinc-900 space-y-4 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 uppercase text-[10px]">Decision Strength</span>
              <div className="flex items-center gap-2">
                {topSignal && (
                  <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-zinc-900 text-zinc-400 border border-zinc-850">
                    {decisionTicker}
                  </span>
                )}
                <span className={`font-bold ${activeDecision.strength > 0 ? "text-emerald-450" : activeDecision.strength < 0 ? "text-rose-450" : "text-zinc-500"}`}>
                  {activeDecision.strength > 0 ? "+" : ""}{(activeDecision.strength * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Visual Strength Slider */}
            <div className="w-full bg-zinc-900 rounded-full h-1 relative overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  activeDecision.strength > 0 ? "bg-emerald-500" :
                  activeDecision.strength < 0 ? "bg-rose-500" :
                  "bg-zinc-750"
                }`}
                style={{
                  width: `${Math.max(6, Math.abs(activeDecision.strength) * 50)}%`,
                  marginLeft: activeDecision.strength >= 0 ? "50%" : `${50 - Math.abs(activeDecision.strength) * 50}%`
                }}
              />
              <div className="absolute left-1/2 top-0 w-0.5 h-full bg-zinc-700" />
            </div>

            {/* RSI Sub-Card */}
            {rsi !== null && (
              <div className="space-y-1.5 py-2.5 px-3 bg-zinc-950/30 rounded border border-zinc-900/60">
                <div className="flex justify-between text-[10px] text-zinc-500 font-bold">
                  <span>COMPUTED RSI(14)</span>
                  <span className={rsi >= 70 ? "text-rose-400" : rsi <= 30 ? "text-emerald-400" : "text-zinc-350"}>
                    {rsi.toFixed(1)}
                  </span>
                </div>
                <div className="relative w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full w-[30%] bg-emerald-500/5" />
                  <div className="absolute left-[30%] top-0 h-full w-[40%] bg-zinc-800/10" />
                  <div className="absolute left-[70%] top-0 h-full w-[30%] bg-rose-500/5" />
                  <div
                    className={`absolute top-0 w-1.5 h-full rounded-full transition-all duration-500 ${
                      rsi >= 70 ? "bg-rose-450" :
                      rsi <= 30 ? "bg-emerald-450" :
                      "bg-zinc-400"
                    }`}
                    style={{ left: `calc(${rsi}% - 3px)` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] text-zinc-650 font-bold">
                  <span>OVERSOLD (30)</span>
                  <span>OVERBOUGHT (70)</span>
                </div>
              </div>
            )}

            {/* Execution Reason */}
            <p className="text-[11px] text-zinc-400 leading-relaxed italic border-l border-zinc-800 pl-3 bg-zinc-950/20 py-2 rounded-r font-sans">
              {activeDecision.reason}
            </p>
          </div>
        );
      })()}
    </div>
  );
}, (prev, next) => {
  return (
    prev.signals.length === next.signals.length &&
    JSON.stringify(prev.decision) === JSON.stringify(next.decision) &&
    prev.signals.every((s, i) => s.strength === next.signals[i]?.strength && s.direction === next.signals[i]?.direction)
  );
});
