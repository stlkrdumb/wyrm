"use client";

import { useEffect, useState, memo, useCallback } from "react";
import { Brain, Layers, Percent, Activity, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";
import { DEFAULT_SYMBOLS } from "@/features/trading-agent/constants/symbols.constants";
import type { SentimentSnapshot } from "@/features/trading-agent/index";
import { apiFetch } from "@/shared/utils/api-fetch";

export const SentimentPanel = memo(function SentimentPanel() {
  const [sentimentMap, setSentimentMap] = useState<Record<string, SentimentSnapshot>>({});
  const [activeSymbol, setActiveSymbol] = useState<string>(DEFAULT_SYMBOLS[0]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchSentiment = useCallback(async () => {
    try {
      const res = await apiFetch("/api/agent/sentiment");
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
    if (val <= 25) return "text-rose-500";
    if (val <= 45) return "text-orange-400";
    if (val <= 55) return "text-yellow-400";
    if (val <= 75) return "text-emerald-400";
    return "text-emerald-300";
  };

  if (isLoading && Object.keys(sentimentMap).length === 0) {
    return (
      <Card className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase mt-2">
            Syncing Market Intelligence...
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Intelligence</CardTitle>
        <div className="flex items-center gap-1.5 border border-zinc-800 rounded p-0.5 bg-zinc-950/80">
          {symbolTabs.slice(0, 6).map((sym) => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase rounded transition-all cursor-pointer ${
                activeSymbol === sym
                  ? "bg-white/15 text-white border border-white/25"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              {sym.replace("USDT", "")}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {activeData ? (
          <div className="flex flex-col gap-3 font-mono">
            {/* F&G Header + Spectrum Bar — merged */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-[10px] text-zinc-300 font-semibold">{activeSymbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-black ${getFngColorClass(activeData.fearAndGreedValue)}`}>
                    {activeData.fearAndGreedValue}
                  </span>
                  <Badge variant={activeData.fearAndGreedValue >= 55 ? "success" : activeData.fearAndGreedValue <= 45 ? "danger" : "warning"}>
                    {activeData.fearAndGreedClassification}
                  </Badge>
                </div>
              </div>
              <div className="relative h-2.5 rounded-full overflow-hidden bg-zinc-800">
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to right, #ef4444, #f97316, #eab308, #22c55e, #10b981)" }}
                />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-500"
                  style={{ left: `${activeData.fearAndGreedValue}%` }}
                />
              </div>
              <div className="flex justify-between text-[7px] font-bold tracking-wider uppercase text-zinc-600">
                <span>Extreme Fear</span>
                <span>Fear</span>
                <span>Neutral</span>
                <span>Greed</span>
                <span>Extreme Greed</span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="p-2 rounded bg-zinc-900/20 border border-zinc-800/40 space-y-0.5">
                <div className="flex items-center gap-1 text-zinc-500">
                  <Layers className="w-2.5 h-2.5" />
                  <span className="text-[7px] uppercase tracking-widest font-bold">Long/Short</span>
                </div>
                <div className="relative w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full bg-emerald-500/60 rounded-full"
                    style={{ width: `${(activeData.longRatio * 100).toFixed(0)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] text-zinc-400">
                  <span>L {activeData.longShortRatio.toFixed(2)}</span>
                  <span>S {(1 - activeData.longShortRatio).toFixed(2)}</span>
                </div>
              </div>

              <div className="p-2 rounded bg-zinc-900/20 border border-zinc-800/40 space-y-0.5">
                <div className="flex items-center gap-1 text-zinc-500">
                  <Percent className="w-2.5 h-2.5" />
                  <span className="text-[7px] uppercase tracking-widest font-bold">Funding</span>
                </div>
                <div className="flex items-center gap-1">
                  {activeData.fundingRate > 0 ? (
                    <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
                  ) : activeData.fundingRate < 0 ? (
                    <TrendingDown className="w-2.5 h-2.5 text-rose-400" />
                  ) : null}
                  <span className={`text-xs font-bold ${activeData.fundingRate > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {(activeData.fundingRate * 100).toFixed(4)}%
                  </span>
                </div>
              </div>

              <div className="p-2 rounded bg-zinc-900/20 border border-zinc-800/40 space-y-0.5">
                <div className="flex items-center gap-1 text-zinc-500">
                  <Activity className="w-2.5 h-2.5" />
                  <span className="text-[7px] uppercase tracking-widest font-bold">Open Int.</span>
                </div>
                <span className="text-xs font-bold text-zinc-300">
                  {activeData.openInterest.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-10 text-[10px] font-mono text-zinc-500 tracking-wide uppercase">
            No data available
          </div>
        )}
      </CardContent>
    </Card>
  );
});
