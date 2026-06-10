"use client";

import { useState } from "react";
import { Shield, RefreshCw, AlertTriangle } from "lucide-react";

interface Props {
  circuitBreakerTripped: boolean;
  circuitBreakerThresholdPct: number;
  peakEquity: number;
  currentEquity: number;
  resetBreaker: () => Promise<void>;
}

export function CircuitBreakerPanel({
  circuitBreakerTripped,
  circuitBreakerThresholdPct,
  peakEquity,
  currentEquity,
  resetBreaker,
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  // Calculate current drawdown percentage
  const currentDrawdown = peakEquity > 0 
    ? Math.max(0, ((peakEquity - currentEquity) / peakEquity) * 100)
    : 0;

  const drawdownProgress = circuitBreakerThresholdPct > 0 
    ? Math.min(100, (currentDrawdown / circuitBreakerThresholdPct) * 100)
    : 0;

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetBreaker();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div
      className={`flex flex-col rounded border transition-all duration-300 ${
        circuitBreakerTripped
          ? "border-rose-600/70 bg-rose-950/10 shadow-[0_0_15px_rgba(220,38,38,0.07)]"
          : "border-zinc-900 bg-zinc-950/40"
      } backdrop-blur-md relative overflow-hidden`}
    >
      {/* Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between p-4 cursor-pointer select-none group"
      >
        <div className="flex items-center gap-2">
          <Shield
            className={`w-3.5 h-3.5 transition-colors ${
              circuitBreakerTripped
                ? "text-rose-500 animate-pulse"
                : "text-zinc-550 group-hover:text-zinc-350"
            }`}
          />
          <span
            className={`text-[10px] tracking-widest font-bold uppercase transition-colors ${
              circuitBreakerTripped
                ? "text-rose-400 font-extrabold"
                : "text-zinc-550 group-hover:text-zinc-350"
            }`}
          >
            Autonomous Risk Breaker
          </span>
          <span className="text-[8px] font-mono text-zinc-650 ml-1.5 uppercase font-bold tracking-widest bg-zinc-950/60 border border-zinc-900 px-1 py-0.2 rounded group-hover:text-zinc-400 group-hover:border-zinc-800 transition-all">
            {isCollapsed ? "[EXPAND]" : "[COLLAPSE]"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {circuitBreakerTripped ? (
            <span className="px-2 py-0.5 rounded text-[8px] font-bold tracking-wider font-mono uppercase bg-rose-500/20 text-rose-450 border border-rose-500/30 animate-pulse">
              💥 TRIPPED
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[8px] font-bold tracking-wider font-mono uppercase bg-emerald-500/10 text-emerald-450 border border-emerald-500/20">
              🛡️ ACTIVE
            </span>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-5 pt-0 border-t border-zinc-900/50 mt-1 flex flex-col gap-4 font-mono text-[11px]">
          {/* Status banner */}
          {circuitBreakerTripped && (
            <div className="p-3 rounded bg-rose-500/10 border border-rose-500/20 flex gap-2.5 items-start">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5 animate-bounce" />
              <div className="flex-1 text-[10px] text-rose-400 leading-normal font-sans">
                <span className="font-bold uppercase tracking-wider block mb-0.5">HALT STATE ACTIVE</span>
                Portfolio drawdown limit exceeded. All open positions have been automatically flattened. Trading is halted.
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 text-center text-zinc-400">
            <div className="p-2.5 rounded bg-zinc-900/20 border border-zinc-900/40">
              <div className="text-[8px] text-zinc-550 uppercase tracking-widest mb-1">Peak Equity</div>
              <div className="text-[12px] font-bold tracking-tight text-zinc-350">
                ${peakEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-2.5 rounded bg-zinc-900/20 border border-zinc-900/40">
              <div className="text-[8px] text-zinc-550 uppercase tracking-widest mb-1">Current Equity</div>
              <div className="text-[12px] font-bold tracking-tight text-zinc-350">
                ${currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-2.5 rounded bg-zinc-900/20 border border-zinc-900/40">
              <div className="text-[8px] text-zinc-550 uppercase tracking-widest mb-1">Current Drawdown</div>
              <div className={`text-[12px] font-bold tracking-tight ${currentDrawdown > 0 ? "text-rose-400" : "text-zinc-500"}`}>
                {currentDrawdown.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Gauge */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[9px] text-zinc-500">
              <span>DRAWDOWN INTENSITY</span>
              <span className={circuitBreakerTripped ? "text-rose-400 font-bold" : "text-zinc-400 font-bold"}>
                {currentDrawdown.toFixed(2)}% / {circuitBreakerThresholdPct.toFixed(1)}% Limit
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-900/50 relative">
              <div
                className={`h-full transition-all duration-500 ${
                  circuitBreakerTripped 
                    ? "bg-rose-600" 
                    : drawdownProgress > 70 
                    ? "bg-amber-500" 
                    : "bg-emerald-500/80"
                }`}
                style={{ width: `${drawdownProgress}%` }}
              />
            </div>
          </div>

          {/* Threshold — display-only, configured in Agent Customizer */}
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

          {/* Actions */}
          {circuitBreakerTripped && (
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="w-full py-2.5 rounded border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-rose-300 transition-all text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_10px_rgba(239,68,68,0.1)]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
              RESET & RE-ARM RISK CORE
            </button>
          )}
        </div>
      )}
    </div>
  );
}
