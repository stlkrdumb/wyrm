"use client";

import { useState } from "react";
import { EquityChart } from "./equity-chart";
import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";

interface Props {
  onBack: () => void;
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

  return (
    <div className="flex flex-col gap-6 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
        <button 
          onClick={onBack}
          className="text-[10px] font-bold tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          ← BACK TO DASHBOARD
        </button>
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">
          Backtesting Engine
        </span>
      </div>

      {!result ? (
        <div className="flex flex-col gap-4 py-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-zinc-100 mb-2">Simulate Market History</h2>
            <p className="text-[11px] text-zinc-500 mb-6 font-mono">
              Run the agent against historical price action to validate strategies before deployment.
            </p>
          </div>
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            <label className="text-[9px] font-bold text-zinc-500 uppercase">Initial Equity ($)</label>
            <input 
              type="number" 
              value={initialEquity} 
              onChange={(e) => setInitialEquity(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-zinc-100 font-mono focus:border-zinc-600 outline-none"
            />
          </div>
          <button 
            onClick={runBacktest}
            disabled={loading}
            className="w-full py-4 rounded bg-zinc-100 text-zinc-950 font-black tracking-widest hover:bg-zinc-200 transition-all disabled:opacity-50"
          >
            {loading ? "EXECUTING SIMULATION..." : "RUN BACKTEST"}
          </button>
          {error && <div className="text-[11px] text-rose-500 font-mono">{error}</div>}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900/50 p-4 rounded border border-zinc-800">
              <span className="block text-[9px] text-zinc-500 font-bold uppercase mb-1">Total Return</span>
              <span className={`text-xl font-black font-mono ${result.totalReturn >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {result.totalReturn.toFixed(2)}%
              </span>
            </div>
            <div className="bg-zinc-900/50 p-4 rounded border border-zinc-800">
              <span className="block text-[9px] text-zinc-500 font-bold uppercase mb-1">Max Drawdown</span>
              <span className="text-xl font-black font-mono text-rose-400">
                {result.maxDrawdown.toFixed(2)}%
              </span>
            </div>
            <div className="bg-zinc-900/50 p-4 rounded border border-zinc-800">
              <span className="block text-[9px] text-zinc-500 font-bold uppercase mb-1">Win Rate</span>
              <span className="text-xl font-black font-mono text-zinc-100">
                {result.winRate.toFixed(1)}%
              </span>
            </div>
            <div className="bg-zinc-900/50 p-4 rounded border border-zinc-800">
              <span className="block text-[9px] text-zinc-500 font-bold uppercase mb-1">Total Trades</span>
              <span className="text-xl font-black font-mono text-zinc-100">
                {result.totalTrades}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <span className="block text-[9px] text-zinc-500 font-bold uppercase mb-2">Simulated Equity Curve</span>
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
          
          <div className="mt-4">
            <span className="block text-[9px] text-zinc-500 font-bold uppercase mb-2">Trade Log</span>
            <div className="w-full overflow-x-auto border border-zinc-800 rounded">
              <table className="w-full text-[10px] font-mono text-left">
                <thead className="bg-zinc-900 text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="p-2">Time</th>
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Side</th>
                    <th className="p-2">Price</th>
                    <th className="p-2">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {result.trades.map((trade, i) => (
                    <tr key={i} className="hover:bg-zinc-900/30">
                      <td className="p-2">{new Date(trade.timestamp).toLocaleTimeString()}</td>
                      <td className="p-2">{trade.symbol}</td>
                      <td className="p-2">{trade.side}</td>
                      <td className="p-2">${trade.price.toFixed(2)}</td>
                      <td className={`p-2 ${trade.pnl > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {trade.pnl > 0 ? "+" : ""}{trade.pnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
