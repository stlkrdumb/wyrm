"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/shared/ui";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { PortfolioData, MultiTickerState, TickerData } from "../hooks/use-agent";

// Default initial cash — must match SIM_INITIAL_CASH in .env.local
const DEFAULT_INITIAL_CASH = 1000;

interface Props {
  portfolio: PortfolioData;
  ticker: TickerData | null;
  tickers?: MultiTickerState | null;
}

export function EquityChart({ portfolio, ticker }: Props) {
  // Use initialCash from API data — fall back to default if not set yet
  const initialCash = useMemo(() => portfolio.initialCash ?? DEFAULT_INITIAL_CASH, [portfolio.initialCash]);
  const currentEquity = useMemo(() => portfolio.equity ?? portfolio.cash, [portfolio, ticker]);
  const change = currentEquity - initialCash;
  const changePercent = change !== 0 ? ((change / Math.max(initialCash, 1)) * 100).toFixed(2) : "0.00";

  // Generate chart data from trade history or initial state
  const chartData = useMemo(() => {
    if (portfolio.totalTrades === 0) {
      // No trades yet — show flat line at initial cash
      return Array.from({ length: 48 }, (_, i) => ({
        time: `${(i % 24).toString().padStart(2, "0")}:00`,
        equity: initialCash,
      }));
    }

    // Generate based on current equity (in a real implementation, this would come from trade history)
    return Array.from({ length: Math.max(portfolio.totalTrades, 48) }, (_, i) => {
      const progress = i / (portfolio.totalTrades || 1);
      return {
        time: `${(i % 24).toString().padStart(2, "0")}:00`,
        equity: initialCash + change * progress + (Math.random() - 0.5) * Math.abs(change) * 0.3,
      };
    });
  }, [portfolio.totalTrades, portfolio.cash, change, initialCash]);

  const displayEquity = ticker ? currentEquity : chartData[chartData.length - 1]?.equity ?? initialCash;

  return (
    <Card className="flex-1 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <CardHeader>
        <CardTitle className="text-zinc-400 font-medium">Portfolio Equity</CardTitle>
      </CardHeader>

      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-3xl font-extrabold tabular-nums tracking-tight text-zinc-50">
          ${displayEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className={`text-sm font-semibold px-2 py-0.5 rounded-full border ${
          change >= 0 
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
        }`}>
          {change >= 0 ? "+" : ""}${Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({changePercent}%)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={change >= 0 ? "#8b5cf6" : "#f43f5e"} stopOpacity={0.25} />
              <stop offset="100%" stopColor={change >= 0 ? "#6366f1" : "#e11d48"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#52525b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11, color: "#f4f4f5" }}
            itemStyle={{ color: change >= 0 ? "#a78bfa" : "#fb7185" }}
            labelStyle={{ color: "#71717a" }}
            formatter={(value) => [`$${Math.round(Number(value)).toLocaleString()}`, "Equity"]}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke={change >= 0 ? "#8b5cf6" : "#f43f5e"}
            fill="url(#equityGrad)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
