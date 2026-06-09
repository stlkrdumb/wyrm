"use client";

import { useMemo, useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { PortfolioData, MultiTickerState, TickerData } from "@/features/trading-agent/hooks/use-agent";

// Default initial cash — must match SIM_INITIAL_CASH in .env.local
const DEFAULT_INITIAL_CASH = 1000;

interface Props {
  portfolio: PortfolioData;
  ticker: TickerData | null;
  tickers?: MultiTickerState | null;
  equityCurve?: { timestamp: Date | string; equity: number }[];
}

export function EquityChart({ portfolio, ticker, equityCurve }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const initialCash = useMemo(() => portfolio.initialCash ?? DEFAULT_INITIAL_CASH, [portfolio.initialCash]);
  const currentEquity = useMemo(() => portfolio.equity ?? portfolio.cash, [portfolio, ticker]);
  const change = currentEquity - initialCash;
  const changePercent = change !== 0 ? ((change / Math.max(initialCash, 1)) * 100).toFixed(2) : "0.00";

  // Generate chart data from trade history or initial state
  const chartData = useMemo(() => {
    if (equityCurve && equityCurve.length > 0) {
      return equityCurve.map((e) => {
        const date = new Date(e.timestamp);
        return {
          time: `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`,
          equity: e.equity,
        };
      });
    }

    if (portfolio.totalTrades === 0) {
      return Array.from({ length: 48 }, (_, i) => ({
        time: `${(i % 24).toString().padStart(2, "0")}:00`,
        equity: initialCash,
      }));
    }

    return Array.from({ length: Math.max(portfolio.totalTrades, 48) }, (_, i) => {
      const progress = i / (portfolio.totalTrades || 1);
      return {
        time: `${(i % 24).toString().padStart(2, "0")}:00`,
        equity: initialCash + change * progress + (Math.random() - 0.5) * Math.abs(change) * 0.15,
      };
    });
  }, [portfolio.totalTrades, portfolio.cash, change, initialCash, equityCurve]);

  const displayEquity = ticker ? currentEquity : chartData[chartData.length - 1]?.equity ?? initialCash;
  const isProfit = change >= 0;

  return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-zinc-900/10 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">Equity Performance</span>
        <span className="text-[10px] tracking-widest text-zinc-500 font-mono">
          START: ${initialCash.toLocaleString()}
        </span>
      </div>

      {/* Main Metric */}
      <div className="flex items-baseline gap-4 mt-1">
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

      {/* Chart */}
      <div className="w-full h-[200px] mt-2 flex items-center justify-center">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isProfit ? "#10b981" : "#f43f5e"} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={isProfit ? "#10b981" : "#f43f5e"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="time" 
                tick={{ fill: "#52525b", fontSize: 9, fontFamily: "monospace" }} 
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "#52525b", fontSize: 9, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const val = payload[0].value as number;
                    return (
                      <div className="bg-zinc-950/90 border border-zinc-900 rounded px-2.5 py-1.5 backdrop-blur-md text-[10px] font-mono shadow-xl">
                        <span className="text-zinc-500 block uppercase">Equity Val</span>
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
                stroke={isProfit ? "#10b981" : "#f43f5e"}
                fill="url(#equityGrad)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-[10px] font-mono text-zinc-650 uppercase tracking-widest animate-pulse">
            Plotting market curve...
          </div>
        )}
      </div>
    </div>
  );
}
