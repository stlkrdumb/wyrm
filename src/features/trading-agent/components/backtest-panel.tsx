"use client";

import { memo, useState } from "react";
import { Play, RotateCcw, DollarSign, Activity, Award } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/shared/ui";
import { EquityChart } from "./equity-chart";
import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";
import { apiFetch } from "@/shared/utils/api-fetch";

export const BacktestPanel = memo(function BacktestPanel({ onBack }: { onBack?: () => void }) {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialEquity, setInitialEquity] = useState(1000);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch("/api/agent/backtest", {
        method: "POST",
        body: JSON.stringify({ initialEquity }),
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) throw new Error("Failed to run backtest");
      const data = await res.json();
      setResult(data);
    } catch {
      setError("Failed to run backtest. Ensure backend API is ready.");
    } finally {
      setLoading(false);
    }
  };

  const isProfit = result ? result.totalReturn >= 0 : false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-zinc-500" />
          <CardTitle>Simulation Sandbox</CardTitle>
        </div>
        <Badge variant="neutral" className="text-[10px]">{result ? "RESULTS" : "SETUP"}</Badge>
      </CardHeader>

      <CardContent>
          {!result ? (
            <div className="flex flex-col gap-5">
              <div className="space-y-1.5 font-mono text-[11px] text-zinc-400">
                <div className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">HISTORICAL SIMULATOR</div>
                <p className="leading-relaxed">
                  Backtest the trading agent against a 30-step historical market price series. Uses live-sourced historical spot tickers.
                </p>
              </div>

              <div className="p-3 bg-zinc-900/10 rounded border border-zinc-800 space-y-4 font-mono text-[11px]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-zinc-500" />
                    Initial Equity (USDT)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500 font-bold">$</span>
                    <input
                      type="number" value={initialEquity}
                      onChange={(e) => setInitialEquity(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded pl-7 pr-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-zinc-800/60 pt-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Simulated Fee</span>
                    <span className="text-zinc-300">0.10% (Taker)</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Leverage</span>
                    <span className="text-zinc-300">1.0x (Spot Only)</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Risk Limits</span>
                    <span className="text-zinc-300">5% SL / 10% TP</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Pairs Scope</span>
                    <span className="text-zinc-300">Dynamic Screening</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="primary" onClick={runBacktest} disabled={loading} className="w-full">
                  {loading ? (
                    <>
                      <span className="animate-spin inline-block w-3 h-3 border border-t-transparent border-zinc-200 rounded-full mr-2" />
                      SIMULATING CYCLE STEP...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current mr-1.5" />
                      START BACKTEST SIMULATION
                    </>
                  )}
                </Button>
                {error && (
                  <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded text-[12px] text-rose-400 font-mono text-center">
                    {error}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex justify-between items-center bg-zinc-900/10 p-3 rounded border border-zinc-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-zinc-500" />
                  <span className="text-[12px] font-mono text-zinc-400 font-bold uppercase">Simulation Results</span>
                </div>
                <button onClick={() => setResult(null)} className="text-[11px] font-mono font-bold text-zinc-500 hover:text-zinc-300 transition-colors uppercase flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className={`p-2 bg-zinc-900/20 rounded border border-zinc-800/60 flex flex-col gap-0.5 ${isProfit ? "border-l-2 border-l-emerald-500" : "border-l-2 border-l-rose-500"}`}>
                  <span className="text-zinc-500 text-[10px] font-bold uppercase">Total Return</span>
                  <span className={`text-[14px] font-black tracking-tight ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                    {isProfit ? "+" : ""}{result.totalReturn.toFixed(2)}%
                  </span>
                </div>
                <div className="p-2 bg-zinc-900/20 rounded border border-zinc-800/60 flex flex-col gap-0.5 border-l-2 border-l-rose-500">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase">Max Drawdown</span>
                  <span className="text-[14px] font-black text-rose-400 tracking-tight">-{result.maxDrawdown.toFixed(2)}%</span>
                </div>
                <div className="p-2 bg-zinc-900/20 rounded border border-zinc-800/60 flex flex-col gap-0.5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase">Sharpe Ratio</span>
                  <span className={`text-[14px] font-black tracking-tight ${result.sharpeRatio > 1 ? "text-emerald-400" : result.sharpeRatio > 0 ? "text-white" : "text-rose-400"}`}>
                    {result.sharpeRatio.toFixed(2)}
                  </span>
                </div>
                <div className="p-2 bg-zinc-900/20 rounded border border-zinc-800/60 flex flex-col gap-0.5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase">Win Rate</span>
                  <span className="text-[14px] font-black text-zinc-300 tracking-tight">{result.winRate.toFixed(1)}%</span>
                </div>
                <div className="p-2 bg-zinc-900/20 rounded border border-zinc-800/60 flex flex-col gap-0.5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase">Win / Loss</span>
                  <span className="text-[14px] font-black text-zinc-300 tracking-tight">
                    <span className="text-emerald-400">{result.wins}</span>
                    <span className="text-zinc-600 mx-1">/</span>
                    <span className="text-rose-400">{result.losses}</span>
                  </span>
                </div>
                <div className="p-2 bg-zinc-900/20 rounded border border-zinc-800/60 flex flex-col gap-0.5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase">Avg Win / Avg Loss</span>
                  <span className="text-[11px] font-black tracking-tight">
                    <span className="text-emerald-400">${result.avgWin.toFixed(2)}</span>
                    <span className="text-zinc-600 mx-1">/</span>
                    <span className="text-rose-400">${result.avgLoss.toFixed(2)}</span>
                  </span>
                </div>
                <div className="p-2 bg-zinc-900/20 rounded border border-zinc-800/60 flex flex-col gap-0.5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase">Max Consec. Losses</span>
                  <span className={`text-[14px] font-black tracking-tight ${result.maxConsecutiveLosses > 3 ? "text-rose-400" : "text-zinc-300"}`}>
                    {result.maxConsecutiveLosses}
                  </span>
                </div>
                <div className="p-2 bg-zinc-900/20 rounded border border-zinc-800/60 flex flex-col gap-0.5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase">Trades Executed</span>
                  <span className="text-[14px] font-black text-zinc-300 tracking-tight">{result.totalTrades}</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-[11px] font-mono text-zinc-500 font-bold uppercase tracking-wider">Equity Curve</span>
                <div className="p-1.5 bg-zinc-950/45 border border-zinc-800 rounded">
                  <EquityChart
                    portfolio={{
                      initialCash: initialEquity,
                      equity: result.equityCurve[result.equityCurve.length - 1]?.equity || initialEquity,
                      cash: result.equityCurve[result.equityCurve.length - 1]?.equity || initialEquity,
                      totalTrades: result.totalTrades,
                      totalPnL: result.totalReturn,
                      winRate: result.winRate
                    }}
                    equityCurve={result.equityCurve}
                  />
                </div>
              </div>

              <div className="space-y-2 flex-grow">
                <span className="block text-[11px] font-mono text-zinc-500 font-bold uppercase tracking-wider">Trade Ledger</span>
                <div className="w-full max-h-[120px] overflow-y-auto border border-zinc-800 bg-zinc-950/20 rounded scrollbar-none">
                  <table className="w-full text-[12px] font-mono text-left">
                    <thead className="bg-zinc-900/50 text-zinc-500 border-b border-zinc-800 sticky top-0 backdrop-blur-md">
                      <tr>
                        <th className="p-2 font-bold uppercase tracking-wider text-[10px]">Time</th>
                        <th className="p-2 font-bold uppercase tracking-wider text-[10px]">Symbol</th>
                        <th className="p-2 font-bold uppercase tracking-wider text-[10px]">Action</th>
                        <th className="p-2 font-bold uppercase tracking-wider text-[10px]">Price</th>
                        <th className="p-2 font-bold uppercase tracking-wider text-[10px] text-right">PnL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {result.trades.length > 0 ? (
                        result.trades.map((trade, i) => (
                          <tr key={i} className="hover:bg-zinc-900/20 transition-all duration-100">
                            <td className="p-2 text-zinc-500">{new Date(trade.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</td>
                            <td className="p-2 font-bold text-zinc-300">{trade.symbol}</td>
                            <td className="p-2">
                              <Badge variant={trade.side === "buy" ? "success" : "danger"} className="text-[10px]">
                                {trade.side.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="p-2 text-zinc-400">${trade.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className={`p-2 text-right font-bold ${
                              trade.pnl > 0 ? "text-emerald-400" : trade.pnl < 0 ? "text-rose-400" : "text-zinc-500"
                            }`}>
                              {trade.pnl !== 0 ? (trade.pnl > 0 ? "+" : "") : ""}{trade.pnl !== 0 ? trade.pnl.toFixed(2) : "0.00"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-zinc-500 uppercase tracking-widest text-[11px]">
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
        </CardContent>
    </Card>
  );
});
