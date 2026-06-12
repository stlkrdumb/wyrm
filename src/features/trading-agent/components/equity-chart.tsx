"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type AreaData,
} from "lightweight-charts";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui";
import type { PortfolioData } from "@/features/trading-agent/hooks/use-agent";
import { useAnimatedNumber } from "@/features/trading-agent/hooks/use-animated-number";

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
  /** Set true once the WS has connected at least once. While false, the chart
   *  shows a "connecting" placeholder instead of stale pre-connection data. */
  everConnected?: boolean;
}

interface ChartPoint {
  time: Time;
  value: number;
}

function filterByTimeframe(equityHistory: { timestamp: string; equity: number }[], tf: TimeframeKey): ChartPoint[] {
  const cutoff = Date.now() - (TIMEFRAMES.find(t => t.key === tf)?.ms ?? 3_600_000);
  const filtered = equityHistory
    .map(e => {
      const ts = new Date(e.timestamp).getTime();
      return { ts, equity: e.equity };
    })
    .filter(e => !isNaN(e.ts) && e.ts >= cutoff);

  // Convert to Lightweight Charts time format (UTC seconds)
  let points: ChartPoint[] = filtered.map(e => ({
    time: Math.floor(e.ts / 1000) as Time,
    value: e.equity,
  }));

  if (points.length < 2) {
    // Fall back to last 10 points
    points = equityHistory
      .slice(-10)
      .map(e => {
        const ts = new Date(e.timestamp).getTime();
        return { time: Math.floor(ts / 1000) as Time, value: e.equity };
      })
      .filter(p => !isNaN(p.time as number));
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

export function EquityChart({ portfolio, equityCurve, equityHistory, everConnected = true }: Props) {
  const [mounted, setMounted] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("1h");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard hydration pattern
  useEffect(() => { setMounted(true); }, []);

  const initialCash = useMemo(() => portfolio.initialCash ?? DEFAULT_INITIAL_CASH, [portfolio.initialCash]);

  // Stable timestamp for fallback chart points — computed once at mount, not during render
  const [mountTime] = useState(() => Math.floor(Date.now() / 1000));

  // Build chart data — backtest mode takes precedence over live history
  const chartData = useMemo<ChartPoint[]>(() => {
    let points: ChartPoint[] = [];
    if (equityCurve && equityCurve.length > 0) {
      points = equityCurve
        .map(e => {
          const ts = new Date(e.timestamp).getTime();
          return { time: Math.floor(ts / 1000) as Time, value: e.equity };
        })
        .filter(p => !isNaN(p.time as number));
    } else if (equityHistory && equityHistory.length > 0) {
      points = filterByTimeframe(equityHistory, timeframe);
    }

    // Deduplicate ties just in case (lightweight-charts requires strictly increasing times)
    const seen = new Set<number>();
    const deduped = points
      .filter(p => {
        if (seen.has(p.time as number)) return false;
        seen.add(p.time as number);
        return true;
      })
      .sort((a, b) => (a.time as number) - (b.time as number));

    if (deduped.length >= 2) {
      return deduped;
    }

    // If we have exactly 1 point, pad it with a preceding point to satisfy lightweight-charts
    if (deduped.length === 1) {
      const p = deduped[0];
      const t = p.time as number;
      return [
        { time: (t - 1) as Time, value: p.value },
        p,
      ];
    }

    // Default fallback if we have 0 points
    return [
      { time: (mountTime - 1) as Time, value: initialCash },
      { time: mountTime as Time, value: initialCash },
    ];
  }, [equityCurve, equityHistory, timeframe, initialCash, mountTime]);

  // Equity color: green when profitable, red when in loss
  const isProfit = portfolio.totalPnL >= 0;
  const chartColor = isProfit ? "#10b981" : "#f43f5e";

  // Displayed values come from the poll + SSE merge, animated smoothly
  const rawEquity = portfolio.equity ?? portfolio.cash;
  const rawTotalPnL = portfolio.totalPnL;
  const rawCash = portfolio.cash;

  const displayEquity = useAnimatedNumber(rawEquity);
  const displayTotalPnL = useAnimatedNumber(rawTotalPnL);
  const displayCash = useAnimatedNumber(rawCash);

  // Pre-connection gate: while the WS has never connected, show "CONNECTING…"
  // placeholders instead of stale data computed from an empty price store.
  // After the first connection, even if WS briefly disconnects, we keep
  // showing values (a "STALE" badge in the status bar indicates freshness).
  const showConnecting = !everConnected;

  // Init the chart once
  useEffect(() => {
    if (!mounted || !containerRef.current || showConnecting) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
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

    // Load initial data if already available
    if (chartData.length > 0) {
      const areaData: AreaData[] = chartData.map(p => ({ time: p.time, value: p.value }));
      series.setData(areaData);
      
      // Use setTimeout to ensure container has been sized by browser layout engine
      const timer = setTimeout(() => {
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }, 50);
      
      return () => {
        clearTimeout(timer);
        seriesRef.current = null;
        chartRef.current = null;
        chart.remove();
      };
    }

    return () => {
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, showConnecting]);

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
    
    // Use setTimeout to ensure canvas has finished resizing
    const timer = setTimeout(() => {
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }, 50);
    return () => clearTimeout(timer);
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
            {showConnecting ? "—.—" : `$${displayEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        </div>

        {/* Inline Stats Row */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Total PnL</span>
            <span className={`text-[13px] font-black font-mono tabular-nums ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
              {showConnecting ? "—.—" : `${isProfit ? "+" : "-"}$${Math.abs(displayTotalPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Win Rate</span>
            <span className={`text-[13px] font-black font-mono tabular-nums ${portfolio.winRate >= 50 ? "text-emerald-400" : "text-zinc-300"}`}>
              {showConnecting ? "—.—" : `${portfolio.winRate.toFixed(1)}%`}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Trades</span>
            <span className="text-[13px] font-black font-mono tabular-nums text-zinc-300">
              {showConnecting ? "—" : portfolio.totalTrades}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Cash</span>
            <span className="text-[13px] font-black font-mono tabular-nums text-zinc-300">
              {showConnecting ? "—.—" : `$${displayCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
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

        <div className="w-full h-[240px] mt-3 relative">
          {showConnecting ? (
            <div className="flex items-center justify-center h-full text-[12px] font-mono text-zinc-500 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse mr-2" />
              Connecting to market…
            </div>
          ) : mounted ? (
            <div ref={containerRef} className="w-full h-full relative" />
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
