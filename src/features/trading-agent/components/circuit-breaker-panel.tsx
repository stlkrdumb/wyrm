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
          ? "border-phosphor-red/50 bg-phosphor-red/[0.02]"
          : ""
      }`}
    >
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="cursor-pointer select-none"
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className={`w-3.5 h-3.5 ${circuitBreakerTripped ? "text-phosphor-red animate-pulse" : "text-phosphor-dim"}`} />
            <CardTitle>Autonomous Risk Breaker</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {circuitBreakerTripped ? (
              <Badge variant="danger" className="text-[8px] animate-pulse">TRIPPED</Badge>
            ) : (
              <Badge variant="success" className="text-[8px]">ACTIVE</Badge>
            )}
            <span className="text-[8px] font-mono text-phosphor-dim uppercase font-bold tracking-widest">
              {isCollapsed ? "[EXPAND]" : "[COLLAPSE]"}
            </span>
          </div>
        </CardHeader>
      </div>

      {!isCollapsed && (
        <CardContent>
          <div className="flex flex-col gap-4 pt-2 border-t border-amber-900/20">
            {circuitBreakerTripped && (
              <div className="p-3 bg-phosphor-red/5 border border-phosphor-red/20 flex gap-2.5 items-start">
                <AlertTriangle className="w-4 h-4 text-phosphor-red flex-shrink-0 mt-0.5 animate-bounce" />
                <div className="flex-1 text-[10px] text-phosphor-red leading-normal font-mono">
                  <span className="font-bold uppercase tracking-wider block mb-0.5">HALT STATE ACTIVE</span>
                  Portfolio drawdown limit exceeded. All positions flattened. Trading halted.
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center text-phosphor-muted">
              <div className="p-2.5 border border-amber-900/20 bg-[#0a0a0a]/30">
                <div className="text-[8px] text-phosphor-dim uppercase tracking-widest mb-1">Peak Equity</div>
                <div className="text-[12px] font-bold tracking-tight text-amber-100/70">
                  ${peakEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-2.5 border border-amber-900/20 bg-[#0a0a0a]/30">
                <div className="text-[8px] text-phosphor-dim uppercase tracking-widest mb-1">Current Equity</div>
                <div className="text-[12px] font-bold tracking-tight text-amber-100/70">
                  ${currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-2.5 border border-amber-900/20 bg-[#0a0a0a]/30">
                <div className="text-[8px] text-phosphor-dim uppercase tracking-widest mb-1">Drawdown</div>
                <div className={`text-[12px] font-bold tracking-tight ${currentDrawdown > 0 ? "text-phosphor-red" : "text-phosphor-dim"}`}>
                  {currentDrawdown.toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[9px] text-phosphor-dim">
                <span>DRAWDOWN INTENSITY</span>
                <span className={circuitBreakerTripped ? "text-phosphor-red font-bold" : "text-amber-100/70 font-bold"}>
                  {currentDrawdown.toFixed(2)}% / {circuitBreakerThresholdPct.toFixed(1)}% Limit
                </span>
              </div>
              <Progress
                value={drawdownProgress}
                max={100}
                variant={circuitBreakerTripped ? "rose" : drawdownProgress > 70 ? "amber" : "emerald"}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold text-phosphor-dim uppercase tracking-widest">
                Emergency Drawdown Limit
              </label>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[13px] font-bold tracking-tight text-amber-100/70">
                  {circuitBreakerThresholdPct}%
                </span>
                <span className="text-[9px] text-phosphor-dim tracking-wider">
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
