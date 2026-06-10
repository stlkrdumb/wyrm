"use client";

import { useMemo, useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui";
import type { PortfolioData, TickerData, TradeData } from "@/features/trading-agent/hooks/use-agent";

const DEFAULT_INITIAL_CASH = 1000;

const TIMEFRAMES = [
  { key: "1m", label: "1m", ms: 60_000 },
  { key: "5m", label: "5m", ms: 300_000 },
  { key: "1h", label: "1h", ms: 3_600_000 },
  { key: "4h", label: "4h", ms: 14_400_000 },
  { key: "24h", label: "24h", ms: 86_400_000 },
  { key: "1w", label: "1w", ms: 604_800_000 },
] as const;

type TimeframeKey = (typeof TIMEFRAMES)[number]["key"];

interface Props {
  portfolio: PortfolioData;
  ticker: TickerData | null;
  equityCurve?: { timestamp: Date | string; equity: number }[];
  equityHistory?: { timestamp: string; equity: number }[];
  trades?: TradeData[];
}

function formatAxisTime(ts: Date, tf: TimeframeKey): string {
  if (tf === "1m" || tf === "5m") {
    return `${ts.getHours().toString().padStart(2, "0")}:${ts.getMinutes().toString().padStart(2, "0")}:${ts.getSeconds().toString().padStart(2, "0")}`;
  }
  if (tf === "1h" || tf === "4h") {
    return `${ts.getHours().toString().padStart(2, "0")}:${ts.getMinutes().toString().padStart(2, "0")}`;
  }
  if (tf === "24h") {
    return ts.getHours().toString().padStart(2, "0") + ":00";
  }
  return `${ts.getMonth() + 1}/${ts.getDate()}`;
}

export function EquityChart({ portfolio, ticker, equityCurve, equityHistory, trades }: Props) {
  const [mounted, setMounted] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("1h");
  useEffect(() => { setMounted(true); }, []);

  const initialCash = useMemo(() => portfolio.initialCash ?? DEFAULT_INITIAL_CASH, [portfolio.initialCash]);
  const currentEquity = useMemo(() => portfolio.equity ?? portfolio.cash, [portfolio, ticker]);

  const chartData = useMemo(() => {
    // Backtest mode: use equityCurve prop
    if (equityCurve && equityCurve.length > 0) {
      return equityCurve.map((e) => {
        const date = new Date(e.timestamp);
        return { time: formatAxisTime(date, timeframe), equity: e.equity, isTrade: false };
      });
    }

    // Live mode: use equityHistory from agent state
    if (equityHistory && equityHistory.length > 0) {
      const cutoff = Date.now() - (TIMEFRAMES.find(t => t.key === timeframe)?.ms ?? 3_600_000);
      const filtered = equityHistory
        .map(e => ({ ts: new Date(e.timestamp), equity: e.equity }))
        .filter(e => e.ts.getTime() >= cutoff);

      if (filtered.length < 2) {
        // Fall back to showing last handful if too few points
        const recent = equityHistory.slice(-10).map(e => ({
          ts: new Date(e.timestamp), equity: e.equity,
        }));
        return recent.map(e => ({ time: formatAxisTime(e.ts, timeframe), equity: e.equity, isTrade: false }));
      }

      return filtered.map(e => ({ time: formatAxisTime(e.ts, timeframe), equity: e.equity, isTrade: false }));
    }

    // No data: simple flat line
    return [
      { time: "", equity: initialCash, isTrade: false },
      { time: "", equity: initialCash, isTrade: false },
    ];
  }, [portfolio, timeframe, equityCurve, equityHistory, initialCash]);

  // Trade markers for chart
  const tradeMarkers = useMemo(() => {
    if (!trades || trades.length === 0 || chartData.length === 0) return [];
    const markers: { time: string; equity: number; action: string; size: number }[] = [];
    for (const trade of trades) {
      const tradeTime = new Date(trade.timestamp);
      const tradeTimeStr = formatAxisTime(tradeTime, timeframe);
      // Find closest chart point or use the equity at that time
      const closest = chartData.find(d => d.time === tradeTimeStr) || chartData[chartData.length - 1];
      if (closest) {
        markers.push({
          time: tradeTimeStr,
          equity: closest.equity,
          action: trade.action,
          size: trade.size,
        });
      }
    }
    return markers.slice(-10); // Show last 10 trades
  }, [trades, chartData, timeframe]);

  const displayEquity = ticker ? currentEquity : chartData[chartData.length - 1]?.equity ?? initialCash;
  const isProfitTotal = portfolio.totalPnL >= 0;

  const gradientId = "equityGrad";
  const chartColor = isProfitTotal ? "#10b981" : "#f43f5e";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio</CardTitle>
        <span className="text-[12px] tracking-widest text-zinc-500 font-mono">
          START: ${initialCash.toLocaleString()}
        </span>
      </CardHeader>
      <CardContent>
        {/* Main Equity Display */}
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-black font-mono tracking-tight text-zinc-100 tabular-nums">
            ${displayEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Inline Stats Row */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Total PnL</span>
            <span className={`text-[13px] font-black font-mono tabular-nums ${isProfitTotal ? "text-emerald-400" : "text-rose-400"}`}>
              {isProfitTotal ? "+" : ""}${portfolio.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Win Rate</span>
            <span className={`text-[13px] font-black font-mono tabular-nums ${portfolio.winRate >= 50 ? "text-emerald-400" : "text-zinc-300"}`}>
              {portfolio.winRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Trades</span>
            <span className="text-[13px] font-black font-mono tabular-nums text-zinc-300">
              {portfolio.totalTrades}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Cash</span>
            <span className="text-[13px] font-black font-mono tabular-nums text-zinc-300">
              ${portfolio.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1 mt-3 border border-obsidian-border rounded p-0.5 bg-obsidian-light/60 w-fit">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`px-2 py-0.5 text-[11px] font-bold tracking-widest uppercase rounded transition-all cursor-pointer ${
                timeframe === tf.key
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="w-full h-[240px] mt-3">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#71717a", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 6))}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#71717a", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const val = payload[0].value as number;
                      return (
                        <div className="bg-obsidian-light/90 border border-obsidian-border rounded px-3 py-2 backdrop-blur-md text-[12px] font-mono shadow-2xl">
                          <span className="text-zinc-500 block mb-1">{label}</span>
                          <span className="text-zinc-100 font-bold text-sm">${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke={chartColor}
                  fill={`url(#${gradientId})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: chartColor, stroke: "#fff", strokeWidth: 2 }}
                />
                {tradeMarkers.map((marker, i) => (
                  <ReferenceLine
                    key={i}
                    x={marker.time}
                    stroke={marker.action === "entry" || marker.action === "add" ? "#10b981" : "#f43f5e"}
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    opacity={0.6}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-[12px] font-mono text-zinc-600 uppercase tracking-widest animate-pulse">
              Plotting market curve...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
