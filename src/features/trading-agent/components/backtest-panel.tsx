"use client";

import { useState } from "react";
import { Play, RotateCcw, DollarSign, Activity, Award } from "lucide-react";
import { EquityChart } from "./equity-chart";
import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";

interface Props {
  onBack?: () => void;
}

export function BacktestPanel({ onBack }: Props) {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialEquity, setInitialEquity] = useState(1000);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/agent/backtest", {
        method: "POST",
        body: JSON.stringify({ initialEquity }),
        headers: { "Content-Type": "application/json" }
      });
      
      if (!res.ok) throw new Error("Failed to run backtest");
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setError("Failed to run backtest. Ensure backend API is ready.");
    } finally {
      setLoading(false);
    }
  };

  const isProfit = result ? result.totalReturn >= 0 : false;

  return (
    <div className="flex flex-col gap-5 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden">
      {/* Background Decorative Mesh */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-zinc-900/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3 flex-shrink-0">
        {onBack ? (
          <button 
            onClick={onBack}
            className="text-[10px] font-bold tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            ← BACK TO DASHBOARD
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">
              Simulation Sandbox
            </span>
          </div>
        )}
        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded border border-zinc-850 bg-zinc-900/40 text-zinc-400 font-mono">
          {result ? "RESULTS" : "SETUP"}
        </span>
      </div>

      {!result ? (
        <div className="flex flex-col gap-5">
          {/* Setup Description */}
          <div className="space-y-1.5 font-mono text-[11px] text-zinc-400">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">HISTORICAL SIMULATOR</div>
            <p className="leading-relaxed">
              Backtest the trading agent against a 30-step historical market price series. Uses live-sourced historical spot tickers.
            </p>
          </div>

          {/* Config Parameters Panel */}
          <div className="p-4 bg-zinc-900/10 rounded border border-zinc-900 space-y-4 font-mono text-[11px]">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-zinc-605" />
                Initial Equity (USDT)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-zinc-500 font-bold">$</span>
                <input 
                  type="number" 
                  value={initialEquity} 
                  onChange={(e) => setInitialEquity(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded pl-7 pr-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 transition-all"
                />
              </div>
            </div>

            {/* Read-Only Parameters */}
            <div className="grid grid-cols-2 gap-3 border-t border-zinc-900/60 pt-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-bold text-zinc-550 uppercase">Simulated Fee</span>
                <span className="text-zinc-350">0.10% (Taker)</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-bold text-zinc-550 uppercase">Leverage</span>
                <span className="text-zinc-350">1.0x (Spot Only)</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-bold text-zinc-550 uppercase">Risk Limits</span>
                <span className="text-zinc-350">5% SL / 10% TP</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-bold text-zinc-550 uppercase">Pairs Scope</span>
                <span className="text-zinc-350">BTC, ETH</span>
              </div>
            </div>
          </div>

          {/* Execute Action */}
          <div className="flex flex-col gap-2 pt-2">
            <button 
              onClick={runBacktest}
              disabled={loading}
              className="w-full py-3 rounded border border-zinc-850 bg-zinc-900/50 hover:bg-zinc-800/80 hover:border-zinc-700 transition-all text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-2 text-zinc-200 disabled:opacity-40 pointer-events-auto"
            >
              {loading ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border border-t-transparent border-zinc-200 rounded-full" />
                  SIMULATING CYCLE STEP...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  START BACKTEST SIMULATION
                </>
              )}
            </button>
            
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded text-[10px] text-rose-400 font-mono text-center">
                {error}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Simulation Header Summary */}
          <div className="flex justify-between items-center bg-zinc-900/10 p-3 rounded border border-zinc-900 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-zinc-500" />
              <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase">Simulation Results</span>
            </div>
            <button 
              onClick={() => setResult(null)}
              className="text-[9px] font-mono font-bold text-zinc-500 hover:text-zinc-300 transition-colors uppercase flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>

          {/* 4-Column Metric Grid */}
          <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
            {/* Return Card */}
            <div className={`p-3 bg-zinc-900/20 rounded border border-zinc-900/60 flex flex-col gap-1 ${
              isProfit ? "border-l-2 border-l-emerald-500" : "border-l-2 border-l-rose-500"
            }`}>
              <span className="text-zinc-550 text-[8px] font-bold uppercase">Total Return</span>
              <span className={`text-[16px] font-black tracking-tight ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                {isProfit ? "+" : ""}{result.totalReturn.toFixed(2)}%
              </span>
            </div>

            {/* Max DD Card */}
            <div className="p-3 bg-zinc-900/20 rounded border border-zinc-900/60 flex flex-col gap-1 border-l-2 border-l-rose-500">
              <span className="text-zinc-550 text-[8px] font-bold uppercase">Max Drawdown</span>
              <span className="text-[16px] font-black text-rose-400 tracking-tight">
                -{result.maxDrawdown.toFixed(2)}%
              </span>
            </div>

            {/* Win Rate Card */}
            <div className="p-3 bg-zinc-900/20 rounded border border-zinc-900/60 flex flex-col gap-1">
              <span className="text-zinc-550 text-[8px] font-bold uppercase">Win Rate</span>
              <span className="text-[16px] font-black text-zinc-350 tracking-tight">
                {result.winRate.toFixed(1)}%
              </span>
            </div>

            {/* Total Trades Card */}
            <div className="p-3 bg-zinc-900/20 rounded border border-zinc-900/60 flex flex-col gap-1">
              <span className="text-zinc-550 text-[8px] font-bold uppercase">Trades Executed</span>
              <span className="text-[16px] font-black text-zinc-350 tracking-tight">
                {result.totalTrades}
              </span>
            </div>
          </div>

          {/* Equity Curve Container */}
          <div className="space-y-2">
            <span className="block text-[9px] font-mono text-zinc-500 font-bold uppercase tracking-wider">Equity Curve Performance</span>
            <div className="p-1.5 bg-zinc-950/45 border border-zinc-900 rounded">
              <EquityChart 
                portfolio={{
                  initialCash: initialEquity,
                  equity: result.equityCurve[result.equityCurve.length - 1]?.equity || initialEquity,
                  cash: result.equityCurve[result.equityCurve.length - 1]?.equity || initialEquity,
                  totalTrades: result.totalTrades,
                  totalPnL: result.totalReturn,
                  winRate: result.winRate
                }} 
                ticker={null}
                equityCurve={result.equityCurve}
              />
            </div>
          </div>
          
          {/* Trade ledger table */}
          <div className="space-y-2 flex-grow">
            <span className="block text-[9px] font-mono text-zinc-500 font-bold uppercase tracking-wider">Simulation Trade Ledger</span>
            <div className="w-full max-h-[180px] overflow-y-auto border border-zinc-900 bg-zinc-950/20 rounded scrollbar-none">
              <table className="w-full text-[10px] font-mono text-left">
                <thead className="bg-zinc-900/50 text-zinc-550 border-b border-zinc-900 sticky top-0 backdrop-blur-md">
                  <tr>
                    <th className="p-2 font-bold uppercase tracking-wider text-[8px]">Time</th>
                    <th className="p-2 font-bold uppercase tracking-wider text-[8px]">Symbol</th>
                    <th className="p-2 font-bold uppercase tracking-wider text-[8px]">Action</th>
                    <th className="p-2 font-bold uppercase tracking-wider text-[8px]">Price</th>
                    <th className="p-2 font-bold uppercase tracking-wider text-[8px] text-right">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/40">
                  {result.trades.length > 0 ? (
                    result.trades.map((trade, i) => (
                      <tr key={i} className="hover:bg-zinc-900/20 transition-all duration-100">
                        <td className="p-2 text-zinc-500">{new Date(trade.timestamp).toLocaleTimeString()}</td>
                        <td className="p-2 font-bold text-zinc-300">{trade.symbol}</td>
                        <td className="p-2">
                          <span className={`px-1 py-0.2 rounded text-[8px] font-bold border uppercase ${
                            trade.side === "buy" 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                          }`}>
                            {trade.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-2 text-zinc-400">${trade.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className={`p-2 text-right font-bold ${
                          trade.pnl > 0 
                            ? "text-emerald-400" 
                            : trade.pnl < 0 
                            ? "text-rose-400" 
                            : "text-zinc-500"
                        }`}>
                          {trade.pnl !== 0 ? (trade.pnl > 0 ? "+" : "") : ""}
                          {trade.pnl !== 0 ? trade.pnl.toFixed(2) : "0.00"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-zinc-550 uppercase tracking-widest text-[9px]">
                        No trades executed in simulation
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
