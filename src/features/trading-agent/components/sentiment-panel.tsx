"use client";

import { useEffect, useState, memo, useCallback } from "react";
import { Brain, Layers, Percent, Activity, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";
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
          if (item.sentiment) newMap[item.symbol] = item.sentiment;
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
    const id = setInterval(fetchSentiment, 15000);
    return () => clearInterval(id);
  }, [fetchSentiment]);

  const activeData = sentimentMap[activeSymbol];
  const symbolTabs = Object.keys(sentimentMap).length > 0 ? Object.keys(sentimentMap) : DEFAULT_SYMBOLS;

  const getFngColorClass = (val: number) => {
    if (val <= 25) return "text-phosphor-red";
    if (val <= 45) return "text-orange-400";
    if (val <= 55) return "text-yellow-400";
    if (val <= 75) return "text-phosphor-green";
    return "text-green-500";
  };

  const getFngBgClass = (val: number) => {
    if (val <= 25) return "bg-phosphor-red";
    if (val <= 45) return "bg-orange-500";
    if (val <= 55) return "bg-yellow-500";
    if (val <= 75) return "bg-phosphor-green";
    return "bg-green-500";
  };

  if (isLoading && Object.keys(sentimentMap).length === 0) {
    return (
      <Card className="h-[380px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 text-phosphor-dim animate-spin" />
          <span className="text-[10px] font-mono text-phosphor-dim tracking-widest uppercase mt-2">
            Syncing Market Intelligence...
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="min-h-[380px]">
      <CardHeader>
        <CardTitle>Market Intelligence</CardTitle>
        <div className="flex items-center gap-1.5 border border-amber-900/20 p-0.5 bg-[#0a0a0a]/80">
          {symbolTabs.slice(0, 6).map((sym) => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase transition-all cursor-pointer ${
                activeSymbol === sym
                  ? "border border-amber-500/30 text-phosphor bg-amber-500/5"
                  : "text-phosphor-dim hover:text-phosphor-muted border border-transparent"
              }`}
            >
              {sym.replace("USDT", "")}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {activeData ? (
          <div className="flex flex-col gap-5 font-mono">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-phosphor-muted" />
                <span className="text-[11px] text-amber-100/70 font-semibold">{activeSymbol}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`text-lg font-black ${getFngColorClass(activeData.fearAndGreedValue)}`}>
                  {activeData.fearAndGreedValue}
                </span>
                <Badge variant={activeData.fearAndGreedValue >= 55 ? "success" : activeData.fearAndGreedValue <= 45 ? "danger" : "warning"}>
                  {activeData.fearAndGreedClassification}
                </Badge>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[9px] text-phosphor-dim uppercase tracking-widest">
                <span>Fear & Greed Index</span>
                <span>Extreme Fear ← → Extreme Greed</span>
              </div>
              <div className="relative w-full h-[2px] bg-amber-900/20 overflow-hidden">
                {[
                  { pct: 20, color: "bg-red-600" },
                  { pct: 20, color: "bg-orange-500" },
                  { pct: 20, color: "bg-yellow-500" },
                  { pct: 20, color: "bg-emerald-500" },
                  { pct: 20, color: "bg-green-500" },
                ].map((seg, i) => (
                  <div key={i} className={`absolute top-0 h-full ${seg.color}`}
                    style={{ left: `${i * 20}%`, width: "20%", opacity: 0.3 }}
                  />
                ))}
                <div
                  className={`absolute top-0 h-full w-[2px] transition-all duration-500 ${getFngBgClass(activeData.fearAndGreedValue)}`}
                  style={{ left: `${activeData.fearAndGreedValue}%`, transform: "translateX(-1px)" }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 border border-amber-900/20 bg-[#0a0a0a]/30 space-y-1">
                <div className="flex items-center gap-1.5 text-phosphor-muted">
                  <Layers className="w-3 h-3" />
                  <span className="text-[8px] uppercase tracking-widest font-bold">Long/Short</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="relative w-full h-[2px] bg-amber-900/20 overflow-hidden">
                    <div className="absolute top-0 left-0 h-full bg-phosphor-green"
                      style={{ width: `${(activeData.longRatio * 100).toFixed(0)}%`, opacity: 0.6 }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-phosphor-muted">
                    <span>L {activeData.longShortRatio.toFixed(2)}</span>
                    <span>S {(1 - activeData.longShortRatio).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 border border-amber-900/20 bg-[#0a0a0a]/30 space-y-1.5">
                <div className="flex items-center gap-1.5 text-phosphor-muted">
                  <Percent className="w-3 h-3" />
                  <span className="text-[8px] uppercase tracking-widest font-bold">Funding</span>
                </div>
                <div className="flex flex-col">
                  <span className={`text-sm font-bold ${activeData.fundingRate > 0 ? "text-phosphor-green" : "text-phosphor-red"}`}>
                    {(activeData.fundingRate * 100).toFixed(4)}%
                  </span>
                  <span className="text-[8px] text-phosphor-dim mt-0.5">
                    {activeData.fundingRate > 0 ? "LONG BIAS" : activeData.fundingRate < 0 ? "SHORT BIAS" : "NEUTRAL"}
                  </span>
                </div>
              </div>

              <div className="p-2.5 border border-amber-900/20 bg-[#0a0a0a]/30 space-y-1">
                <div className="flex items-center gap-1.5 text-phosphor-muted">
                  <Activity className="w-3 h-3" />
                  <span className="text-[8px] uppercase tracking-widest font-bold">Open Int.</span>
                </div>
                <span className="text-sm font-bold text-amber-100/70">
                  {activeData.openInterest.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[280px] text-[11px] font-mono text-phosphor-dim tracking-wide uppercase">
            No data available
          </div>
        )}
      </CardContent>
    </Card>
  );
});
