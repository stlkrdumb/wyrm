"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type AreaData,
} from "lightweight-charts";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui";
import type { PortfolioData } from "@/features/trading-agent/hooks/use-agent";

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
  equityCurve?: { timestamp: Date | string; equity: number }[];
  equityHistory?: { timestamp: string; equity: number }[];
}

interface ChartPoint {
  time: Time;
  value: number;
}

function filterByTimeframe(equityHistory: { timestamp: string; equity: number }[], tf: TimeframeKey): ChartPoint[] {
  const cutoff = Date.now() - (TIMEFRAMES.find(t => t.key === tf)?.ms ?? 3_600_000);
  const filtered = equityHistory
    .map(e => ({ ts: new Date(e.timestamp).getTime(), equity: e.equity }))
    .filter(e => e.ts >= cutoff);

  // Convert to Lightweight Charts time format (UTC seconds)
  let points: ChartPoint[] = filtered.map(e => ({
    time: Math.floor(e.ts / 1000) as Time,
    value: e.equity,
  }));

  if (points.length < 2) {
    // Fall back to last 10 points
    points = equityHistory
      .slice(-10)
      .map(e => ({ time: Math.floor(new Date(e.timestamp).getTime() / 1000) as Time, value: e.equity }));
  }

  // Lightweight Charts requires strictly increasing time — dedupe ties
  const seen = new Set<number>();
  return points
    .filter(p => {
      if (seen.has(p.time as number)) return false;
      seen.add(p.time as number);
      return true;
    })
    .sort((a, b) => (a.time as number) - (b.time as number));
}

export function EquityChart({ portfolio, equityCurve, equityHistory }: Props) {
  const [mounted, setMounted] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("1h");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const initialCash = useMemo(() => portfolio.initialCash ?? DEFAULT_INITIAL_CASH, [portfolio.initialCash]);

  // Build chart data — backtest mode takes precedence over live history
  const chartData = useMemo<ChartPoint[]>(() => {
    if (equityCurve && equityCurve.length > 0) {
      return equityCurve
        .map(e => ({ time: Math.floor(new Date(e.timestamp).getTime() / 1000) as Time, value: e.equity }))
        .sort((a, b) => (a.time as number) - (b.time as number));
    }
    if (equityHistory && equityHistory.length > 0) {
      return filterByTimeframe(equityHistory, timeframe);
    }
    return [
      { time: Math.floor(Date.now() / 1000) as Time, value: initialCash },
      { time: Math.floor(Date.now() / 1000) + 1 as Time, value: initialCash },
    ];
  }, [equityCurve, equityHistory, timeframe, initialCash]);

  // Equity color: green when profitable, red when in loss
  const isProfit = portfolio.totalPnL >= 0;
  const chartColor = isProfit ? "#10b981" : "#f43f5e";

  // Displayed values come straight from the 1s poll — no overlay, no animation
  const displayEquity = portfolio.equity ?? portfolio.cash;
  const displayTotalPnL = portfolio.totalPnL;
  const displayCash = portfolio.cash;

  // Init the chart once
  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#71717a",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(63, 63, 70, 0.15)" },
        horzLines: { color: "rgba(63, 63, 70, 0.15)" },
      },
      rightPriceScale: { borderColor: "rgba(63, 63, 70, 0.3)" },
      timeScale: {
        borderColor: "rgba(63, 63, 70, 0.3)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(255, 255, 255, 0.2)", width: 1, style: 3 },
        horzLine: { color: "rgba(255, 255, 255, 0.2)", width: 1, style: 3 },
      },
      autoSize: true,
    });

    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: chartColor,
      topColor: `${chartColor}33`,
      bottomColor: `${chartColor}00`,
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    seriesRef.current = series;

    return () => {
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Update series color when profit/loss flips
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.applyOptions({
      lineColor: chartColor,
      topColor: `${chartColor}33`,
      bottomColor: `${chartColor}00`,
    });
  }, [chartColor]);

  // Update series data when chart data changes
  useEffect(() => {
    if (!seriesRef.current) return;
    const areaData: AreaData[] = chartData.map(p => ({ time: p.time, value: p.value }));
    seriesRef.current.setData(areaData);
    chartRef.current?.timeScale().fitContent();
  }, [chartData]);

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
            <span className={`text-[13px] font-black font-mono tabular-nums ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
              {isProfit ? "+" : "-"}${Math.abs(displayTotalPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              ${displayCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
            <div ref={containerRef} className="w-full h-full" />
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
