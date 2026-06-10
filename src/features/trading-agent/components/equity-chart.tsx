"use client";

import { useMemo, useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui";
import type { PortfolioData, TickerData } from "@/features/trading-agent/hooks/use-agent";

const DEFAULT_INITIAL_CASH = 1000;

const TIMEFRAMES = [
  { key: "1m", label: "1m", ms: 60_000 },
  { key: "5m", label: "5m", ms: 300_000 },
  { key: "1h", label: "1h", ms: 3_600_000 },
  { key: "4h", label: "4h", ms: 14_400_000 },
  { key: "24h", label: "24h", ms: 86_400_000 },
  { key: "1w", label: "1w", ms: 604_800_000 },
  { key: "1M", label: "1M", ms: 2_592_000_000 },
] as const;

type TimeframeKey = (typeof TIMEFRAMES)[number]["key"];

interface Props {
  portfolio: PortfolioData;
  ticker: TickerData | null;
  equityCurve?: { timestamp: Date | string; equity: number }[];
  equityHistory?: { timestamp: string; equity: number }[];
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

export function EquityChart({ portfolio, ticker, equityCurve, equityHistory }: Props) {
  const [mounted, setMounted] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("1h");
  useEffect(() => { setMounted(true); }, []);

  const initialCash = useMemo(() => portfolio.initialCash ?? DEFAULT_INITIAL_CASH, [portfolio.initialCash]);
  const currentEquity = useMemo(() => portfolio.equity ?? portfolio.cash, [portfolio, ticker]);
  const change = currentEquity - initialCash;
  const changePercent = change !== 0 ? ((change / Math.max(initialCash, 1)) * 100).toFixed(2) : "0.00";

  const chartData = useMemo(() => {
    // Backtest mode: use equityCurve prop
    if (equityCurve && equityCurve.length > 0) {
      return equityCurve.map((e) => {
        const date = new Date(e.timestamp);
        return { time: formatAxisTime(date, timeframe), equity: e.equity };
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
        return recent.map(e => ({ time: formatAxisTime(e.ts, timeframe), equity: e.equity }));
      }

      return filtered.map(e => ({ time: formatAxisTime(e.ts, timeframe), equity: e.equity }));
    }

    // No data: flat line at initialCash
    return Array.from({ length: 48 }, (_, i) => ({
      time: `${(i % 24).toString().padStart(2, "0")}:00`,
      equity: initialCash,
    }));
  }, [portfolio, timeframe, equityCurve, equityHistory, initialCash]);

  const displayEquity = ticker ? currentEquity : chartData[chartData.length - 1]?.equity ?? initialCash;
  const isProfit = change >= 0;

  const gradientId = "equityGrad";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio</CardTitle>
        <span className="text-[10px] tracking-widest text-zinc-500 font-mono">
          START: ${initialCash.toLocaleString()}
        </span>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-black font-mono tracking-tight text-zinc-100 tabular-nums">
            ${displayEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded border tracking-wide uppercase ${
            isProfit
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          }`}>
            {isProfit ? "+" : ""}{changePercent}%
          </span>
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1 mt-3 border border-zinc-800/60 rounded p-0.5 bg-zinc-950/60 w-fit">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase rounded transition-all cursor-pointer ${
                timeframe === tf.key
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="w-full h-[200px] mt-3">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isProfit ? "#34d399" : "#f43f5e"} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={isProfit ? "#34d399" : "#f43f5e"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#52525b", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#52525b", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const val = payload[0].value as number;
                      return (
                        <div className="bg-zinc-950/90 border border-zinc-800 rounded px-2.5 py-1.5 backdrop-blur-md text-[10px] font-mono shadow-xl">
                          <span className="text-zinc-500 block">{label}</span>
                          <span className="text-zinc-100 font-bold">${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke={isProfit ? "#34d399" : "#f43f5e"}
                  fill={`url(#${gradientId})`}
                  strokeWidth={1.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-[10px] font-mono text-zinc-600 uppercase tracking-widest animate-pulse">
              Plotting market curve...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
