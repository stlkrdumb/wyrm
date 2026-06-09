"use client";

import { useAgent } from "@/features/trading-agent/hooks/use-agent";
import { StatusHeader } from "./status-header";
import { SignalPanel } from "./signal-panel";
import { SentimentPanel } from "./sentiment-panel";
import { EquityChart } from "./equity-chart";
import { PositionsPanel } from "./positions-panel";
import { TradeLog } from "./trade-log";
import { MarketWatch } from "./market-watch";
import { DecisionHistory } from "./decision-history";
import { BacktestPanel } from "./backtest-panel";

export function Dashboard() {
  const agent = useAgent();

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950/20 text-zinc-100">
      <StatusHeader agent={agent} />

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1600px] mx-auto w-full">
        {agent.state.showHistory ? (
          <DecisionHistory onBack={() => agent.setShowHistory(false)} />
        ) : (
          <>
            <div className="lg:col-span-2 flex flex-col gap-6">
              <MarketWatch tickers={agent.state.tickers} />
              <EquityChart portfolio={agent.state.portfolio} ticker={agent.state.ticker} tickers={agent.state.tickers} />
              <PositionsPanel positions={agent.state.positions} tickers={agent.state.tickers} />
            </div>

            <div className="flex flex-col gap-6">
              <SignalPanel signals={agent.state.signals} decision={agent.state.decision} />
              <SentimentPanel />
              {agent.state.decision && (agent.state.decision as any).riskStatus === "blocked" && (
                <div className="bg-rose-500/10 border border-rose-500/50 p-3 rounded text-[11px] text-rose-400 font-mono animate-pulse">
                  <span className="font-bold mr-2">⚠️ RISK ALERT:</span> {agent.state.decision.reason}
                </div>
              )}
              <TradeLog trades={agent.state.trades} portfolio={agent.state.portfolio} />
              
              <div className="flex flex-col gap-2 pt-4">
                <button 
                  onClick={() => agent.setShowHistory(true)}
                  className="w-full py-3 rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-[10px] font-bold tracking-widest uppercase"
                >
                  View Decision History
                </button>
                <button 
                  onClick={() => agent.setShowBacktest(true)}
                  className="w-full py-3 rounded border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-[10px] font-bold tracking-widest uppercase"
                >
                  Run Backtest
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {agent.state.showBacktest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-zinc-950 border border-zinc-900 w-full max-w-5xl max-h-[90vh] rounded-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-900">
              <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase">Backtesting Simulation</span>
              <button 
                onClick={() => agent.setShowBacktest(false)}
                className="text-[10px] font-bold tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                CLOSE [ESC]
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <BacktestPanel onBack={() => agent.setShowBacktest(false)} />
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-zinc-900 bg-zinc-950/70 px-6 py-4 text-[10px] font-mono tracking-wider text-zinc-500 flex items-center justify-between">
        <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">WYRM TRADER // V0.1.0</span>
        <span className="text-[10px] tracking-widest text-zinc-500 font-mono">SIMULATED TRADING CONSOLE — NO REAL CAPITAL</span>
      </footer>
    </div>
  );
}
