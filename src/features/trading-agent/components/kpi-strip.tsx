"use client";

import { memo } from "react";
import { TrendingUp, TrendingDown, Wallet, Target, Activity } from "lucide-react";
import type { PortfolioData, PositionData } from "@/features/trading-agent/hooks/use-agent";

interface Props {
  portfolio: PortfolioData;
  positions: PositionData[];
  peakEquity: number;
  status: string;
}

const CountUp = memo(function CountUp({ value, prefix = "", suffix = "", decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span className="tabular-nums transition-all duration-300">
      {prefix}{formatted}{suffix}
    </span>
  );
});

export const KpiStrip = memo(function KpiStrip({ portfolio, positions, peakEquity, status }: Props) {
  const isRunning = status === "running";
  const isProfit = portfolio.totalPnL >= 0;
  const drawdown = peakEquity > 0 ? ((peakEquity - portfolio.equity) / peakEquity) * 100 : 0;

  const kpiItems = [
    {
      icon: <Wallet className="w-3.5 h-3.5" />,
      label: "EQUITY",
      value: portfolio.equity,
      prefix: "$",
      decimals: 2,
      color: "text-zinc-100",
      bgColor: "bg-zinc-900/40",
      borderColor: "border-zinc-800/60",
      accentColor: "from-zinc-800/0 to-zinc-800/30",
    },
    {
      icon: isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />,
      label: "TOTAL PnL",
      value: portfolio.totalPnL,
      prefix: "",
      suffix: "",
      decimals: 2,
      color: isProfit ? "text-emerald-400" : "text-rose-400",
      bgColor: isProfit ? "bg-emerald-500/5" : "bg-rose-500/5",
      borderColor: isProfit ? "border-emerald-500/15" : "border-rose-500/15",
      accentColor: isProfit ? "from-emerald-500/0 to-emerald-500/10" : "from-rose-500/0 to-rose-500/10",
    },
    {
      icon: <Target className="w-3.5 h-3.5" />,
      label: "POSITIONS",
      value: positions.length,
      prefix: "",
      suffix: "",
      decimals: 0,
      color: positions.length > 0 ? "text-amber-400" : "text-zinc-500",
      bgColor: positions.length > 0 ? "bg-amber-500/5" : "bg-zinc-900/40",
      borderColor: positions.length > 0 ? "border-amber-500/15" : "border-zinc-800/60",
      accentColor: "from-amber-500/0 to-amber-500/10",
    },
    {
      icon: <Activity className="w-3.5 h-3.5" />,
      label: "WIN RATE",
      value: portfolio.winRate,
      prefix: "",
      suffix: "%",
      decimals: 1,
      color: portfolio.winRate >= 50 ? "text-emerald-400" : "text-zinc-400",
      bgColor: "bg-zinc-900/40",
      borderColor: "border-zinc-800/60",
      accentColor: "from-zinc-800/0 to-zinc-800/30",
    },
    {
      icon: <TrendingDown className="w-3.5 h-3.5" />,
      label: "DRAWDOWN",
      value: drawdown,
      prefix: "",
      suffix: "%",
      decimals: 2,
      color: drawdown > 5 ? "text-rose-400" : drawdown > 0 ? "text-amber-400" : "text-zinc-500",
      bgColor: drawdown > 5 ? "bg-rose-500/5" : "bg-zinc-900/40",
      borderColor: drawdown > 5 ? "border-rose-500/15" : "border-zinc-800/60",
      accentColor: drawdown > 5 ? "from-rose-500/0 to-rose-500/10" : "from-zinc-800/0 to-zinc-800/30",
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {kpiItems.map((kpi, i) => (
        <div
          key={i}
          className={`relative overflow-hidden rounded border ${kpi.borderColor} ${kpi.bgColor} px-3 py-2.5 transition-all duration-300 hover:scale-[1.02] group ${
            isRunning ? "animate-pulse-amber" : ""
          }`}
        >
          {/* Subtle gradient overlay */}
          <div className={`absolute inset-0 bg-gradient-to-r ${kpi.accentColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

          <div className="relative flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[8px] font-bold font-mono tracking-widest uppercase text-zinc-500">
              <span className="opacity-70">{kpi.icon}</span>
              {kpi.label}
            </div>
            <div className={`text-[15px] font-black font-mono tracking-tight ${kpi.color}`}>
              <CountUp value={kpi.value} prefix={kpi.prefix} suffix={kpi.suffix} decimals={kpi.decimals} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
