"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/shared/ui";
import type { DecisionRecord } from "@/features/trading-agent/types/history.types";
import { apiFetch } from "@/shared/utils/api-fetch";

interface Props {
  onBack?: () => void;
  isTabMode?: boolean;
}

export function DecisionHistory({ onBack, isTabMode }: Props) {
  const [history, setHistory] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiFetch("/api/agent/history");
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
    <div className={`flex items-center justify-center ${isTabMode ? "flex-grow" : "p-5 rounded border border-zinc-900 bg-zinc-950/40 h-[450px]"}`}>
      <div className="text-[11px] font-mono text-zinc-500 text-center tracking-wide uppercase animate-pulse">
        FETCHING DECISION HISTORY...
      </div>
    </div>
  );

  if (error) return (
    <div className={`flex items-center justify-center ${isTabMode ? "flex-grow" : "p-5 rounded border border-zinc-900 bg-zinc-950/40 h-[450px]"}`}>
      <div className="text-[11px] font-mono text-zinc-500 text-center tracking-wide uppercase">
        {error}
      </div>
    </div>
  );

  const riskBadge = (status: string) => {
    const v = status.toLowerCase();
    if (v === "approved") return <Badge variant="success" className="text-[10px]">APPROVED</Badge>;
    if (v === "blocked") return <Badge variant="danger" className="text-[10px]">BLOCKED</Badge>;
    return <Badge variant="warning" className="text-[10px]">REVIEW</Badge>;
  };

  const actionBadge = (action: string) => {
    if (action === "buy") return <Badge variant="success" className="text-[10px]">BUY</Badge>;
    if (action === "sell") return <Badge variant="danger" className="text-[10px]">SELL</Badge>;
    return <Badge variant="neutral" className="text-[10px]">HOLD</Badge>;
  };

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 mb-2">
        <input
          type="text"
          placeholder="Filter by symbol or status..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2.5 py-1.5 text-[12px] font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-white/40 transition-colors"
        />
      </div>

      <div className="flex-grow overflow-y-auto scrollbar-none max-h-[280px]">
        {filteredHistory.length > 0 ? (
          <div className="flex flex-col gap-2 font-mono">
            {filteredHistory.reverse().map((record) => (
              <div key={record.id} className="flex items-center justify-between py-1.5 border-b border-zinc-800/30 last:border-0 gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {riskBadge(record.riskStatus)}
                  {actionBadge(record.decision?.action ?? "")}
                  <span className="text-[12px] text-zinc-300 font-semibold">{record.symbol}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-zinc-500">
                    {new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={`text-[11px] font-bold tabular-nums ${
                    (record.decision?.strength ?? 0) > 0 ? "text-emerald-400" :
                    (record.decision?.strength ?? 0) < 0 ? "text-rose-400" : "text-zinc-500"
                  }`}>
                    {(record.decision?.strength ?? 0) > 0 ? "+" : ""}{(record.decision?.strength ?? 0 * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] font-mono text-zinc-500 py-6 text-center tracking-wide uppercase">
            {filter ? "No matching records" : "No decision history yet"}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col gap-4 ${isTabMode ? "flex-grow" : "p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md h-[450px]"}`}>
      {!isTabMode && (
        <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3">
          <span className="text-[12px] tracking-widest text-zinc-500 font-bold uppercase">Decision History</span>
        </div>
      )}
      {content}
    </div>
  );
}
