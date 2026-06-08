"use client";

import { memo } from "react";
import { Card, CardHeader, CardTitle, Badge } from "@/shared/ui";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SignalData, DecisionData } from "../hooks/use-agent";

/** Parse ticker from signal name: "LLM BTCUSDT" → "BTC/USDT", "Heuristic ETHUSDT" → "ETH/USDT" */
function tickerFromSignalName(name: string): string {
  const raw = name.replace(/^(LLM|Heuristic)\s*/, "").trim();
  // Convert BTCUSDT → BTC/USDT
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
      <Card>
        <CardHeader>
          <CardTitle>Market Signals</CardTitle>
        </CardHeader>
        <div className="text-sm text-zinc-500 py-8 text-center">Waiting for agent to start...</div>
      </Card>
    );
  }

  const directionIcon = (direction: SignalData["direction"]) => {
    switch (direction) {
      case "bullish": return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
      case "bearish": return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
      default: return <Minus className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const directionBadge = (direction: SignalData["direction"]) => {
    switch (direction) {
      case "bullish": return <Badge variant="success">Bull</Badge>;
      case "bearish": return <Badge variant="danger">Bear</Badge>;
      default: return <Badge variant="neutral">Flat</Badge>;
    }
  };

  const actionBadge = () => {
    if (!decision) return null;
    switch (decision.action) {
      case "buy": return <Badge variant="success">Buy</Badge>;
      case "sell": return <Badge variant="danger">Sell</Badge>;
      default: return <Badge variant="neutral">Hold</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Market Signals
          {decision && (
            <div className="flex items-center gap-2">
              Action: {actionBadge()}
            </div>
          )}
        </CardTitle>
      </CardHeader>

      {signals.length > 0 ? (
        <div className="space-y-2">
          {signals.map((signal, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-sm">
              <div className="flex items-center gap-2">
                {directionIcon(signal.direction)}
                <span className="text-zinc-300">{tickerFromSignalName(signal.name)}</span>
              </div>
              <div className="flex items-center gap-2">
                {directionBadge(signal.direction)}
                <span className="text-zinc-400 tabular-nums min-w-[3.5rem] text-right">
                  {(signal.strength * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-zinc-500 py-4 text-center">No signals available</div>
      )}

      {decision && (() => {
        // Find the highest-conviction signal to display its ticker badge
        const topSignal = signals.reduce((best, s) =>
          Math.abs(s.strength) > Math.abs(best.strength) ? s : best, signals[0] ?? null
        );
        const decisionTicker = topSignal ? tickerFromSignalName(topSignal.name) : "ALL";

        // Parse RSI from reason
        const rsiMatch = decision.reason.match(/RSI\s*\(?(\d+(?:\.\d+)?)\)?/i);
        const rsi = rsiMatch ? parseFloat(rsiMatch[1]) : null;

        return (
          <div className="mt-3 pt-3 border-t border-zinc-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 font-medium">Decision Conviction</span>
              <div className="flex items-center gap-2">
                {topSignal && <Badge variant="info">{decisionTicker}</Badge>}
                <span className={`font-semibold ${decision.strength > 0 ? "text-emerald-400" : decision.strength < 0 ? "text-red-400" : "text-zinc-400"}`}>
                  {decision.strength > 0 ? "+" : ""}{(decision.strength * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Custom visual horizontal strength bar */}
            <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  decision.strength > 0 ? "bg-gradient-to-r from-emerald-500 to-teal-400" :
                  decision.strength < 0 ? "bg-gradient-to-r from-red-500 to-pink-500" :
                  "bg-zinc-600"
                }`}
                style={{
                  width: `${Math.max(6, Math.abs(decision.strength) * 50)}%`,
                  marginLeft: decision.strength >= 0 ? "50%" : `${50 - Math.abs(decision.strength) * 50}%`
                }}
              />
              <div className="absolute left-1/2 top-0 w-0.5 h-full bg-zinc-600" />
            </div>

            {rsi !== null && (
              <div className="space-y-1.5 py-2 px-2.5 bg-zinc-950/40 rounded-lg border border-zinc-800/40">
                <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
                  <span>Computed RSI(14)</span>
                  <span className={rsi >= 70 ? "text-rose-400 font-bold" : rsi <= 30 ? "text-emerald-400 font-bold" : "text-zinc-300"}>
                    {rsi.toFixed(1)}
                  </span>
                </div>
                <div className="relative w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full w-[30%] bg-emerald-500/10" />
                  <div className="absolute left-[30%] top-0 h-full w-[40%] bg-zinc-500/5" />
                  <div className="absolute left-[70%] top-0 h-full w-[30%] bg-rose-500/10" />
                  <div
                    className={`absolute top-0 w-1.5 h-full rounded-full transition-all duration-500 ${
                      rsi >= 70 ? "bg-rose-400 shadow-md shadow-rose-500" :
                      rsi <= 30 ? "bg-emerald-400 shadow-md shadow-emerald-500" :
                      "bg-blue-400"
                    }`}
                    style={{ left: `calc(${rsi}% - 3px)` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] text-zinc-600 font-mono">
                  <span>OVERSOLD (30)</span>
                  <span>OVERBOUGHT (70)</span>
                </div>
              </div>
            )}

            <p className="text-xs text-zinc-400 leading-relaxed italic border-l border-zinc-700 pl-2 bg-zinc-950/20 py-1 rounded-r">
              {decision.reason}
            </p>
          </div>
        );
      })()}
    </Card>
  );
}, (prev, next) => {
  return (
    prev.signals.length === next.signals.length &&
    JSON.stringify(prev.decision) === JSON.stringify(next.decision) &&
    prev.signals.every((s, i) => s.strength === next.signals[i]?.strength && s.direction === next.signals[i]?.direction)
  );
});
