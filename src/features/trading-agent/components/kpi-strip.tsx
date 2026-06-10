"use client";

import { memo } from "react";
import { TrendingUp, TrendingDown, Wallet, Target, Activity, Zap } from "lucide-react";
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
      icon: <Wallet className="w-4 h-4" />,
      label: "EQUITY",
      value: portfolio.equity,
      prefix: "$",
      decimals: 2,
      color: "text-zinc-100",
      glowColor: "rgba(0, 212, 255, 0.1)",
    },
    {
      icon: isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />,
      label: "TOTAL PnL",
      value: portfolio.totalPnL,
      prefix: "",
      suffix: "",
      decimals: 2,
      color: isProfit ? "text-emerald-400" : "text-rose-400",
      glowColor: isProfit ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)",
    },
    {
      icon: <Target className="w-4 h-4" />,
      label: "POSITIONS",
      value: positions.length,
      prefix: "",
      suffix: "",
      decimals: 0,
      color: positions.length > 0 ? "text-white" : "text-zinc-500",
      glowColor: "rgba(0, 212, 255, 0.1)",
    },
    {
      icon: <Zap className="w-4 h-4" />,
      label: "WIN RATE",
      value: portfolio.winRate,
      prefix: "",
      suffix: "%",
      decimals: 1,
      color: portfolio.winRate >= 50 ? "text-emerald-400" : "text-zinc-400",
      glowColor: "rgba(16, 185, 129, 0.1)",
    },
    {
      icon: <Activity className="w-4 h-4" />,
      label: "DRAWDOWN",
      value: drawdown,
      prefix: "",
      suffix: "%",
      decimals: 2,
      color: drawdown > 5 ? "text-rose-400" : drawdown > 0 ? "text-yellow-400" : "text-zinc-500",
      glowColor: drawdown > 5 ? "rgba(244, 63, 94, 0.1)" : "rgba(0, 212, 255, 0.1)",
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {kpiItems.map((kpi, i) => (
        <div
          key={i}
          className="relative overflow-hidden rounded-lg glass-panel p-3 transition-all duration-300 hover:scale-[1.02] group"
          style={{
            boxShadow: isRunning ? `0 0 20px ${kpi.glowColor}` : "none",
          }}
        >
          <div className="relative flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold font-mono tracking-widest uppercase text-zinc-500">
                <span className="opacity-60">{kpi.icon}</span>
                {kpi.label}
              </div>
              <div className={`text-[18px] font-black font-mono tracking-tight ${kpi.color}`}>
                <CountUp value={kpi.value} prefix={kpi.prefix} suffix={kpi.suffix} decimals={kpi.decimals} />
              </div>
            </div>
            {isRunning && (
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse mt-1" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
});
