"use client";

import { useState } from "react";
import { Play, RotateCcw, DollarSign, Activity, Award } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/shared/ui";
import { EquityChart } from "./equity-chart";
import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";

export function BacktestPanel({ onBack }: { onBack?: () => void }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
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
    } catch {
      setError("Failed to run backtest. Ensure backend API is ready.");
    } finally {
      setLoading(false);
    }
  };

  const isProfit = result ? result.totalReturn >= 0 : false;

  return (
    <Card>
      <div onClick={() => setIsCollapsed(!isCollapsed)} className="cursor-pointer select-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-phosphor-dim" />
            <CardTitle>Simulation Sandbox</CardTitle>
          </div>
          <Badge variant="neutral" className="text-[8px]">{result ? "RESULTS" : "SETUP"}</Badge>
        </CardHeader>
      </div>

      {!isCollapsed && (
        <CardContent>
          {!result ? (
            <div className="flex flex-col gap-5">
              <div className="space-y-1.5 font-mono text-[11px] text-phosphor-muted">
                <div className="text-[10px] font-bold text-phosphor-dim uppercase tracking-wider">HISTORICAL SIMULATOR</div>
                <p className="leading-relaxed">
                  Backtest the trading agent against a 30-step historical market price series. Uses live-sourced historical spot tickers.
                </p>
              </div>

              <div className="p-4 bg-[#0a0a0a]/30 border border-amber-900/20 space-y-4 font-mono text-[11px]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold text-phosphor-dim uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-phosphor-dim" />
                    Initial Equity (USDT)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-phosphor-dim font-bold">$</span>
                    <input
                      type="number" value={initialEquity}
                      onChange={(e) => setInitialEquity(Number(e.target.value))}
                      className="w-full bg-[#0a0a0a] border border-amber-900/20 pl-7 pr-3 py-2 text-amber-100/70 focus:outline-none focus:border-amber-500/30 transition-all terminal-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-amber-900/20 pt-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-bold text-phosphor-dim uppercase">Simulated Fee</span>
                    <span className="text-amber-100/70">0.10% (Taker)</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-bold text-phosphor-dim uppercase">Leverage</span>
                    <span className="text-amber-100/70">1.0x (Spot Only)</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-bold text-phosphor-dim uppercase">Risk Limits</span>
                    <span className="text-amber-100/70">5% SL / 10% TP</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-bold text-phosphor-dim uppercase">Pairs Scope</span>
                    <span className="text-amber-100/70">Dynamic Screening</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="primary" onClick={runBacktest} disabled={loading} className="w-full">
                  {loading ? (
                    <>
                      <span className="animate-spin inline-block w-3 h-3 border border-t-transparent border-amber-100/70 mr-2" />
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
                  <div className="bg-phosphor-red/5 border border-phosphor-red/30 p-3 text-[10px] text-phosphor-red font-mono text-center">
                    {error}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex justify-between items-center bg-[#0a0a0a]/30 p-3 border border-amber-900/20 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-phosphor-dim" />
                  <span className="text-[10px] font-mono text-phosphor-muted font-bold uppercase">Simulation Results</span>
                </div>
                <button onClick={() => setResult(null)} className="text-[9px] font-mono font-bold text-phosphor-dim hover:text-phosphor-muted transition-colors uppercase flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                <div className={`p-3 bg-[#0a0a0a]/30 border border-amber-900/20 flex flex-col gap-1 ${isProfit ? "border-t-2 border-t-phosphor-green" : "border-t-2 border-t-phosphor-red"}`}>
                  <span className="text-phosphor-dim text-[8px] font-bold uppercase">Total Return</span>
                  <span className={`text-[16px] font-black tracking-tight ${isProfit ? "text-phosphor-green phosphor-glow-green" : "text-phosphor-red phosphor-glow-red"}`}>
                    {isProfit ? "+" : ""}{result.totalReturn.toFixed(2)}%
                  </span>
                </div>
                <div className="p-3 bg-[#0a0a0a]/30 border border-amber-900/20 flex flex-col gap-1 border-t-2 border-t-phosphor-red">
                  <span className="text-phosphor-dim text-[8px] font-bold uppercase">Max Drawdown</span>
                  <span className="text-[16px] font-black text-phosphor-red tracking-tight">-{result.maxDrawdown.toFixed(2)}%</span>
                </div>
                <div className="p-3 bg-[#0a0a0a]/30 border border-amber-900/20 flex flex-col gap-1">
                  <span className="text-phosphor-dim text-[8px] font-bold uppercase">Win Rate</span>
                  <span className="text-[16px] font-black text-amber-100/70 tracking-tight">{result.winRate.toFixed(1)}%</span>
                </div>
                <div className="p-3 bg-[#0a0a0a]/30 border border-amber-900/20 flex flex-col gap-1">
                  <span className="text-phosphor-dim text-[8px] font-bold uppercase">Trades Executed</span>
                  <span className="text-[16px] font-black text-amber-100/70 tracking-tight">{result.totalTrades}</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-[9px] font-mono text-phosphor-dim font-bold uppercase tracking-wider">Equity Curve</span>
                <div className="p-1.5 bg-[#0a0a0a]/30 border border-amber-900/20">
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

              <div className="space-y-2 flex-grow">
                <span className="block text-[9px] font-mono text-phosphor-dim font-bold uppercase tracking-wider">Trade Ledger</span>
                <div className="w-full max-h-[180px] overflow-y-auto border border-amber-900/20 bg-[#0a0a0a]/30 scrollbar-none">
                  <table className="w-full text-[10px] font-mono text-left terminal-table">
                    <thead className="bg-[#0a0a0a]/50 text-phosphor-dim border-b border-amber-900/20 sticky top-0 backdrop-blur-md">
                      <tr>
                        <th className="p-2 font-bold uppercase tracking-wider text-[8px]">Time</th>
                        <th className="p-2 font-bold uppercase tracking-wider text-[8px]">Symbol</th>
                        <th className="p-2 font-bold uppercase tracking-wider text-[8px]">Action</th>
                        <th className="p-2 font-bold uppercase tracking-wider text-[8px]">Price</th>
                        <th className="p-2 font-bold uppercase tracking-wider text-[8px] text-right">PnL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-900/10">
                      {result.trades.length > 0 ? (
                        result.trades.map((trade, i) => (
                          <tr key={i} className="hover:bg-amber-500/[0.03] transition-all duration-100">
                            <td className="p-2 text-phosphor-dim">{new Date(trade.timestamp).toLocaleTimeString()}</td>
                            <td className="p-2 font-bold text-amber-100/70">{trade.symbol}</td>
                            <td className="p-2">
                              <Badge variant={trade.side === "buy" ? "success" : "danger"} className="text-[8px]">
                                {trade.side.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="p-2 text-phosphor-muted">${trade.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className={`p-2 text-right font-bold ${
                              trade.pnl > 0 ? "text-phosphor-green" : trade.pnl < 0 ? "text-phosphor-red" : "text-phosphor-dim"
                            }`}>
                              {trade.pnl !== 0 ? (trade.pnl > 0 ? "+" : "") : ""}{trade.pnl !== 0 ? trade.pnl.toFixed(2) : "0.00"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-phosphor-dim uppercase tracking-widest text-[9px]">
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
      )}
    </Card>
  );
}
