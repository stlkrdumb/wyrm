"use client";

import { Badge } from "@/shared/ui";
import type { useAgent } from "../hooks/use-agent";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  agent: ReturnType<typeof useAgent>;
}

export function StatusHeader({ agent }: Props) {
  const { state, runCycle, setAgentStatus } = agent;
  const { status, lastCycleAt, ticker } = state;

  const renderBadge = () => {
    switch (status) {
      case "running": return <Badge variant="success">Running</Badge>;
      case "paused": return <Badge variant="warning">Paused</Badge>;
      default: return <Badge variant="danger">Stopped</Badge>;
    }
  };

  const uptime = lastCycleAt ? new Date(lastCycleAt).toLocaleTimeString() : "--:--:--";

  // Bitget price display
  const btcPrice = ticker?.lastPrice ?? null;
  const btcChange = ticker?.change24hPercent ?? 0;
  const isPositive = btcChange >= 0;

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
      {/* Left: Logo + price */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight text-zinc-50">WYRM Trader</h1>
          {renderBadge()}
        </div>

        {btcPrice ? (
          <div className="flex items-center gap-4 border-l border-zinc-800 pl-6">
            <div>
              <div className="text-xs text-zinc-500">BTC/USDT</div>
              <div className="text-xl font-bold tabular-nums text-zinc-50">
                ${btcPrice.toLocaleString()}
              </div>
            </div>
            <div className={`flex items-center gap-1 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="font-semibold tabular-nums">
                {isPositive ? "+" : ""}{btcChange.toFixed(2)}%
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 border-l border-zinc-800 pl-6">
            <div>
              <div className="text-xs text-zinc-500">BTC/USDT</div>
              <span className="text-xl font-bold tabular-ues text-zinc-700">--</span>
            </div>
          </div>
        )}

        {lastCycleAt && (
          <span className="text-xs text-zinc-500">Last cycle: {uptime}</span>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {status !== "running" ? (
          <button
            onClick={() => setAgentStatus("running")}
            className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-sm focus:outline-none"
          >
            &#9654; Start
          </button>
        ) : (
          <button
            onClick={() => setAgentStatus("paused")}
            className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 text-sm focus:outline-none"
          >
            &#9646;&#9646; Pause
          </button>
        )}
        <button
          onClick={() => setAgentStatus("stopped")}
          className="inline-flex items-center justify-center rounded-md font-medium transition-colors bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 text-sm focus:outline-none"
        >
          &#9632; Stop
        </button>
      </div>
    </header>
  );
}
