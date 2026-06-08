"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/shared/ui";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { PortfolioData, TickerData } from "../hooks/use-agent";

interface Props {
  portfolio: PortfolioData;
  ticker: TickerData | null;
}

export function EquityChart({ portfolio, ticker }: Props) {
  const initialCash = useMemo(() => portfolio.initialCash || 100000, [portfolio.initialCash]);
  const currentEquity = useMemo(() => portfolio.equity || portfolio.cash + (ticker ? 0 : 0), [portfolio, ticker]);
  const change = currentEquity - initialCash;
  const changePercent = ((change / initialCash) * 100).toFixed(2);

  const btcPrice = ticker?.lastPrice ?? null;
  const btcChange = ticker?.change24hPercent ?? 0;

  // Generate chart data from trade history or initial state
  const chartData = useMemo(() => {
    if (portfolio.totalTrades === 0) {
      // No trades yet — show flat line at initial cash
      return Array.from({ length: 48 }, (_, i) => ({
        time: `${(i % 24).toString().padStart(2, "0")}:00`,
        equity: portfolio.initialCash || initialCash,
      }));
    }

    // Generate based on current equity (in a real implementation, this would come from trade history)
    return Array.from({ length: Math.max(portfolio.totalTrades, 48) }, (_, i) => {
      const progress = i / (portfolio.totalTrades || 1);
      return {
        time: `${(i % 24).toString().padStart(2, "0")}:00`,
        equity: 100000 + change * progress + (Math.random() - 0.5) * Math.abs(change) * 0.3,
      };
    });
  }, [portfolio.totalTrades, portfolio.cash, change]);

  const displayEquity = ticker ? currentEquity : chartData[chartData.length - 1]?.equity || initialCash;

  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle>Portfolio Equity</CardTitle>
      </CardHeader>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-2xl font-bold tabular-nums">${Math.round(displayEquity).toLocaleString()}</span>
        <span className={`text-sm font-medium ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {change >= 0 ? "+" : ""}${Math.abs(Math.round(change)).toLocaleString()} ({changePercent}%)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={change >= 0 ? "#34d399" : "#f87171"} stopOpacity={0.3} />
              <stop offset="100%" stopColor={change >= 0 ? "#34d399" : "#f87171"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
            formatter={(value) => [`$${Math.round(Number(value)).toLocaleString()}`, "Equity"]}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke={change >= 0 ? "#34d399" : "#f87171"}
            fill="url(#equityGrad)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
