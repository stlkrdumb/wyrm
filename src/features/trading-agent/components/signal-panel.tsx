"use client";

import { Card, CardHeader, CardTitle, Badge } from "@/shared/ui";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SignalData, DecisionData } from "../hooks/use-agent";

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
                <span className="text-zinc-300">{signal.name}</span>
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

      {decision && (
        <div className="mt-3 pt-2 border-t border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Decision Strength</span>
            <span className={`font-medium ${decision.strength > 0 ? "text-emerald-400" : decision.strength < 0 ? "text-red-400" : "text-zinc-400"}`}>
              {decision.strength > 0 ? "+" : ""}{(decision.strength * 100).toFixed(0)}% (conf: {(decision.confidence * 100).toFixed(0)}%)
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">{decision.reason}</p>
        </div>
      )}
    </Card>
  );
}
