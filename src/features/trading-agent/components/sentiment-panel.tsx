"use client";

import { useEffect, useState, memo, useCallback } from "react";
import { Brain, Layers, Percent, Activity, Loader2 } from "lucide-react";
import { DEFAULT_SYMBOLS } from "@/features/trading-agent/constants/symbols.constants";
import type { SentimentSnapshot } from "@/features/trading-agent/index";

export const SentimentPanel = memo(function SentimentPanel() {
  const [sentimentMap, setSentimentMap] = useState<Record<string, SentimentSnapshot>>({});
  const [activeSymbol, setActiveSymbol] = useState<string>(DEFAULT_SYMBOLS[0]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchSentiment = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/sentiment");
      if (!res.ok) throw new Error("Failed to fetch sentiment");
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        const newMap: Record<string, SentimentSnapshot> = {};
        for (const item of json.data) {
          if (item.sentiment) {
            newMap[item.symbol] = item.sentiment;
          }
        }
        setSentimentMap(newMap);
      }
    } catch (err) {
      console.error("[SentimentPanel] Error fetching sentiment:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSentiment();
    // Poll every 15 seconds to refresh cached sentiment state
    const id = setInterval(fetchSentiment, 15000);
    return () => clearInterval(id);
  }, [fetchSentiment]);

  const activeData = sentimentMap[activeSymbol];

  // Colors for Fear & Greed index
  const getFngColorClass = (val: number) => {
    if (val <= 25) return "text-red-500";
    if (val <= 45) return "text-orange-400";
    if (val <= 55) return "text-yellow-400";
    if (val <= 75) return "text-emerald-400";
    return "text-green-500";
  };

  const getFngBgClass = (val: number) => {
    if (val <= 25) return "bg-red-500";
    if (val <= 45) return "bg-orange-500";
    if (val <= 55) return "bg-yellow-500";
    if (val <= 75) return "bg-emerald-500";
    return "bg-green-500";
  };

  if (isLoading && Object.keys(sentimentMap).length === 0) {
    return (
      <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden h-[380px] justify-center items-center">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase mt-2">
          Syncing Market Intelligence...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden min-h-[380px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">
          Market Intelligence
        </span>
        
        {/* Symbol Selector Tabs */}
        <div className="flex items-center gap-1.5 border border-zinc-850 rounded p-0.5 bg-zinc-950/80">
          {DEFAULT_SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              onClick={() => setActiveSymbol(symbol)}
              className={`px-2 py-1 text-[9px] font-mono font-bold rounded transition-all uppercase ${
                activeSymbol === symbol
                  ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                  : "text-zinc-500 hover:text-zinc-350 border border-transparent"
              }`}
            >
              {symbol.replace("USDT", "")}
            </button>
          ))}
        </div>
      </div>

      {activeData ? (
        <div className="flex-1 flex flex-col gap-4">
          
          {/* Fear & Greed Indicator */}
          <div className="space-y-2.5 p-3.5 bg-zinc-900/20 rounded border border-zinc-900/60">
            <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
              <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-zinc-500" />
                <span className="font-bold uppercase tracking-wider">FEAR & GREED INDEX</span>
              </div>
              <span className={`font-bold ${getFngColorClass(activeData.fearAndGreedValue)}`}>
                {activeData.fearAndGreedValue} // {activeData.fearAndGreedClassification.toUpperCase()}
              </span>
            </div>

            {/* F&G Progress Gauge */}
            <div className="relative w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-900/50">
              {/* Zones */}
              <div className="absolute left-0 top-0 h-full w-[25%] bg-red-500/10" />
              <div className="absolute left-[25%] top-0 h-full w-[20%] bg-orange-500/10" />
              <div className="absolute left-[45%] top-0 h-full w-[10%] bg-yellow-500/10" />
              <div className="absolute left-[55%] top-0 h-full w-[20%] bg-emerald-500/10" />
              <div className="absolute left-[75%] top-0 h-full w-[25%] bg-green-500/10" />
              
              {/* Needle/indicator */}
              <div
                className={`absolute top-0 w-2.5 h-full rounded-full transition-all duration-1000 ${getFngBgClass(
                  activeData.fearAndGreedValue
                )}`}
                style={{ left: `calc(${activeData.fearAndGreedValue}% - 5px)` }}
              />
            </div>
            
            <div className="flex justify-between text-[8px] font-mono text-zinc-600 font-bold uppercase tracking-wider">
              <span>EXTREME FEAR</span>
              <span>NEUTRAL</span>
              <span>EXTREME GREED</span>
            </div>
          </div>

          {/* Long/Short Ratio positioning */}
          <div className="space-y-2.5 p-3.5 bg-zinc-900/20 rounded border border-zinc-900/60 font-mono text-[11px]">
            <div className="flex justify-between items-center text-[10px] text-zinc-400">
              <span className="font-bold uppercase tracking-wider">RETAIL LONG/SHORT RATIO</span>
              <span className="font-bold text-zinc-300">
                {activeData.longShortRatio.toFixed(2)}x
              </span>
            </div>

            {/* Split Progress Bar */}
            <div className="w-full h-2 rounded bg-zinc-900 overflow-hidden flex">
              <div
                className="bg-emerald-500/80 h-full transition-all duration-1000"
                style={{ width: `${activeData.longRatio * 100}%` }}
              />
              <div
                className="bg-rose-500/80 h-full transition-all duration-1000"
                style={{ width: `${activeData.shortRatio * 100}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px]">
              <div className="flex flex-col">
                <span className="text-zinc-500 text-[8px] font-bold uppercase">LONGS</span>
                <span className="text-emerald-400 font-bold">{(activeData.longRatio * 100).toFixed(1)}%</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-zinc-500 text-[8px] font-bold uppercase">SHORTS</span>
                <span className="text-rose-400 font-bold">{(activeData.shortRatio * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Derivative Indicators Grid */}
          <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
            {/* Funding Rate Card */}
            <div className="p-3 bg-zinc-900/20 rounded border border-zinc-900/60 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[9px] font-bold uppercase tracking-wider">
                <Percent className="w-3.5 h-3.5" />
                <span>FUNDING RATE (8H)</span>
              </div>
              <span
                className={`text-[12px] font-bold tracking-tight ${
                  activeData.fundingRate > 0
                    ? "text-emerald-400"
                    : activeData.fundingRate < 0
                    ? "text-rose-400"
                    : "text-zinc-350"
                }`}
              >
                {activeData.fundingRate >= 0 ? "+" : ""}
                {(activeData.fundingRate * 100).toFixed(4)}%
              </span>
              <span className="text-[8px] text-zinc-600 font-bold uppercase">
                {activeData.fundingRate > 0.0001
                  ? "Long bias leverage"
                  : activeData.fundingRate < -0.0001
                  ? "Short bias leverage"
                  : "Balanced leverage"}
              </span>
            </div>

            {/* Open Interest Card */}
            <div className="p-3 bg-zinc-900/20 rounded border border-zinc-900/60 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[9px] font-bold uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5" />
                <span>OPEN INTEREST</span>
              </div>
              <span className="text-[12px] font-bold text-zinc-350 tracking-tight">
                {Math.round(activeData.openInterest).toLocaleString()}
              </span>
              <span className="text-[8px] text-zinc-600 font-bold uppercase">
                Contracts (Active)
              </span>
            </div>
          </div>
          
          <div className="text-[9px] font-mono text-zinc-600 text-center tracking-wide mt-1 uppercase border-t border-zinc-900/30 pt-2 flex items-center justify-center gap-1.5">
            <Activity className="w-3 h-3 text-zinc-550" />
            <span>UPDATED AS OF {activeData.timestamp ? new Date(activeData.timestamp).toLocaleTimeString() : "N/A"}</span>
          </div>

        </div>
      ) : (
        <div className="text-[11px] font-mono text-zinc-500 py-12 text-center tracking-wide uppercase">
          No sentiment snapshot found for {activeSymbol}
        </div>
      )}
    </div>
  );
});
