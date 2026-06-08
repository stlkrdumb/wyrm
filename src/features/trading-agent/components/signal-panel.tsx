"use client";

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

export function SignalPanel({ signals, decision }: Props) {
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

        return (
          <div className="mt-3 pt-2 border-t border-zinc-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Decision Strength</span>
              <div className="flex items-center gap-2">
                {topSignal && <Badge variant="info">{decisionTicker}</Badge>}
                <span className={`font-medium ${decision.strength > 0 ? "text-emerald-400" : decision.strength < 0 ? "text-red-400" : "text-zinc-400"}`}>
                  {decision.strength > 0 ? "+" : ""}{(decision.strength * 100).toFixed(0)}% (conf: {(decision.confidence * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{decision.reason}</p>
          </div>
        );
      })()}
    </Card>
  );
}
