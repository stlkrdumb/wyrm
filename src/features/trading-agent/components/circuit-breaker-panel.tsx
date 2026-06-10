"use client";

import { useState } from "react";
import { Shield, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Progress } from "@/shared/ui";

interface Props {
  circuitBreakerTripped: boolean;
  circuitBreakerThresholdPct: number;
  peakEquity: number;
  currentEquity: number;
  resetBreaker: () => Promise<void>;
}

export function CircuitBreakerPanel({
  circuitBreakerTripped, circuitBreakerThresholdPct, peakEquity, currentEquity, resetBreaker,
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  const currentDrawdown = peakEquity > 0
    ? Math.max(0, ((peakEquity - currentEquity) / peakEquity) * 100) : 0;
  const drawdownProgress = circuitBreakerThresholdPct > 0
    ? Math.min(100, (currentDrawdown / circuitBreakerThresholdPct) * 100) : 0;

  const handleReset = async () => {
    setIsResetting(true);
    try { await resetBreaker(); } finally { setIsResetting(false); }
  };

  return (
    <Card
      className={`transition-all duration-300 ${
        circuitBreakerTripped
          ? "border-rose-600/70 bg-rose-950/10 shadow-[0_0_15px_rgba(220,38,38,0.07)]"
          : ""
      }`}
    >
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="cursor-pointer select-none"
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className={`w-3.5 h-3.5 ${circuitBreakerTripped ? "text-rose-400 animate-pulse" : "text-zinc-500"}`} />
            <CardTitle>Autonomous Risk Breaker</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {circuitBreakerTripped ? (
              <Badge variant="danger" className="text-[8px] animate-pulse">TRIPPED</Badge>
            ) : (
              <Badge variant="success" className="text-[8px]">ACTIVE</Badge>
            )}
            <span className="text-[8px] font-mono text-zinc-600 uppercase font-bold tracking-widest">
              {isCollapsed ? "[EXPAND]" : "[COLLAPSE]"}
            </span>
          </div>
        </CardHeader>
      </div>

      {!isCollapsed && (
        <CardContent>
          <div className="flex flex-col gap-4 pt-2 border-t border-zinc-800/60">
            {circuitBreakerTripped && (
              <div className="p-3 rounded bg-rose-500/10 border border-rose-500/20 flex gap-2.5 items-start">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5 animate-bounce" />
                <div className="flex-1 text-[10px] text-rose-400 leading-normal font-sans">
                  <span className="font-bold uppercase tracking-wider block mb-0.5">HALT STATE ACTIVE</span>
                  Portfolio drawdown limit exceeded. All positions flattened. Trading halted.
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center text-zinc-400">
              <div className="p-2.5 rounded bg-zinc-900/20 border border-zinc-800/40">
                <div className="text-[8px] text-zinc-500 uppercase tracking-widest mb-1">Peak Equity</div>
                <div className="text-[12px] font-bold tracking-tight text-zinc-300">
                  ${peakEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-2.5 rounded bg-zinc-900/20 border border-zinc-800/40">
                <div className="text-[8px] text-zinc-500 uppercase tracking-widest mb-1">Current Equity</div>
                <div className="text-[12px] font-bold tracking-tight text-zinc-300">
                  ${currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-2.5 rounded bg-zinc-900/20 border border-zinc-800/40">
                <div className="text-[8px] text-zinc-500 uppercase tracking-widest mb-1">Drawdown</div>
                <div className={`text-[12px] font-bold tracking-tight ${currentDrawdown > 0 ? "text-rose-400" : "text-zinc-500"}`}>
                  {currentDrawdown.toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[9px] text-zinc-500">
                <span>DRAWDOWN INTENSITY</span>
                <span className={circuitBreakerTripped ? "text-rose-400 font-bold" : "text-zinc-400 font-bold"}>
                  {currentDrawdown.toFixed(2)}% / {circuitBreakerThresholdPct.toFixed(1)}% Limit
                </span>
              </div>
              <Progress
                value={drawdownProgress}
                max={100}
                variant={circuitBreakerTripped ? "rose" : drawdownProgress > 70 ? "cyan" : "emerald"}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                Emergency Drawdown Limit
              </label>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[13px] font-bold tracking-tight text-zinc-300">
                  {circuitBreakerThresholdPct}%
                </span>
                <span className="text-[9px] text-zinc-600 tracking-wider">
                  (configured in Agent Customizer)
                </span>
              </div>
            </div>

            {circuitBreakerTripped && (
              <Button
                variant="danger"
                onClick={handleReset}
                disabled={isResetting}
                className="w-full"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isResetting ? "animate-spin" : ""}`} />
                RESET & RE-ARM RISK CORE
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
