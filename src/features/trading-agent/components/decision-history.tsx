"use client";

import { useState, useEffect } from "react";
import type { DecisionRecord } from "@/features/trading-agent/types/history.types";

interface Props {
  onBack?: () => void;
}

export function DecisionHistory({ onBack }: Props) {
  const [history, setHistory] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch("/api/agent/history");
        if (!res.ok) throw new Error("Failed to fetch history");
        const data = await res.json();
        setHistory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const filteredHistory = history.filter(h => 
    h.symbol.toLowerCase().includes(filter.toLowerCase()) ||
    h.riskStatus.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md h-[450px] justify-center items-center">
      <div className="text-[11px] font-mono text-zinc-500 py-12 text-center tracking-wide uppercase animate-pulse">
        FETCHING DECISION HISTORY...
      </div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md h-[450px] justify-center items-center">
      <div className="text-[11px] font-mono text-rose-500 py-12 text-center tracking-wide uppercase">
        ERROR: {error}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden h-[450px]">
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3 flex-shrink-0">
        {onBack ? (
          <button 
            onClick={onBack}
            className="text-[10px] font-bold tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            ← BACK TO DASHBOARD
          </button>
        ) : (
          <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">
            Agent Decision Log
          </span>
        )}
        <span className="text-[10px] tracking-widest text-zinc-650 font-mono">
          LOGS: {filteredHistory.length}
        </span>
      </div>

      <div className="flex flex-col gap-3 flex-shrink-0">
        <input 
          type="text"
          placeholder="Filter by symbol or status..."
          className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="flex-grow overflow-y-auto scrollbar-none pr-1 -mr-1">
        <table className="w-full text-[11px] font-mono">
          <thead className="text-zinc-500 text-left border-b border-zinc-900/80 pb-2">
            <tr className="border-b border-zinc-900/80 pb-2">
              <th className="py-2 font-bold uppercase tracking-wider">Time</th>
              <th className="py-2 font-bold uppercase tracking-wider">Symbol</th>
              <th className="py-2 font-bold uppercase tracking-wider">Status</th>
              <th className="py-2 font-bold uppercase tracking-wider">Action</th>
              <th className="py-2 font-bold uppercase tracking-wider">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/40">
            {filteredHistory.map((h, idx) => {
              const timestamp = h.timestamp instanceof Date ? h.timestamp : new Date(h.timestamp);
              return (
                <tr key={h.id || idx} className="hover:bg-zinc-900/20 transition-all duration-150">
                  <td className="py-2.5 text-zinc-500 whitespace-nowrap">{timestamp.toLocaleTimeString()}</td>
                  <td className="py-2.5 font-bold text-zinc-100">{h.symbol}</td>
                  <td className="py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                      h.riskStatus === "approved" ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" :
                      h.riskStatus === "blocked" ? "bg-rose-500/10 border-rose-500/50 text-rose-400" :
                      "bg-amber-500/10 border-amber-500/50 text-amber-400"
                    }`}>
                      {h.riskStatus.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5 text-zinc-300 whitespace-nowrap">{h.decision.action} ({h.decision.strength > 0 ? '+' : ''}{h.decision.strength.toFixed(2)})</td>
                  <td 
                    className="py-2.5 text-zinc-550 max-w-[150px] truncate cursor-help"
                    title={`Agent Reason: ${h.decision.reason || "N/A"}${h.riskReason ? `\nRisk Reason: ${h.riskReason}` : ""}`}
                  >
                    {h.riskStatus === "blocked" ? (h.riskReason || h.decision.reason) : (h.decision.reason || h.riskReason || "N/A")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
