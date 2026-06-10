"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/shared/ui";
import type { DecisionRecord } from "@/features/trading-agent/types/history.types";

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
    <div className={`flex items-center justify-center ${isTabMode ? "flex-grow" : "p-5 border border-amber-900/20 bg-[#0a0a0a]/40 h-[450px]"}`}>
      <div className="text-[11px] font-mono text-phosphor-dim text-center tracking-wide uppercase animate-pulse">
        FETCHING DECISION HISTORY...
      </div>
    </div>
  );

  if (error) return (
    <div className={`flex items-center justify-center ${isTabMode ? "flex-grow" : "p-5 border border-amber-900/20 bg-[#0a0a0a]/40 h-[450px]"}`}>
      <div className="text-[11px] font-mono text-phosphor-dim text-center tracking-wide uppercase">
        {error}
      </div>
    </div>
  );

  const riskBadge = (status: string) => {
    const v = status.toLowerCase();
    if (v === "approved") return <Badge variant="success" className="text-[8px]">APPROVED</Badge>;
    if (v === "blocked") return <Badge variant="danger" className="text-[8px]">BLOCKED</Badge>;
    return <Badge variant="warning" className="text-[8px]">REVIEW</Badge>;
  };

  const actionBadge = (action: string) => {
    if (action === "buy") return <Badge variant="success" className="text-[8px]">BUY</Badge>;
    if (action === "sell") return <Badge variant="danger" className="text-[8px]">SELL</Badge>;
    return <Badge variant="neutral" className="text-[8px]">HOLD</Badge>;
  };

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 mb-2">
        <input
          type="text"
          placeholder="Filter by symbol or status..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full terminal-input px-2.5 py-1.5 text-[10px] placeholder-phosphor-dim/50"
        />
      </div>

      <div className="flex-grow overflow-y-auto scrollbar-none">
        {filteredHistory.length > 0 ? (
          <div className="flex flex-col gap-2 font-mono">
            {filteredHistory.reverse().map((record) => (
              <div key={record.id} className="flex items-center justify-between py-1.5 border-b border-amber-900/10 last:border-0 gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {riskBadge(record.riskStatus)}
                  {actionBadge(record.decision?.action ?? "")}
                  <span className="text-[10px] text-amber-100/70 font-semibold">{record.symbol}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[9px] text-phosphor-dim">
                    {new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={`text-[9px] font-bold tabular-nums ${
                    (record.decision?.strength ?? 0) > 0 ? "text-phosphor-green" :
                    (record.decision?.strength ?? 0) < 0 ? "text-phosphor-red" : "text-phosphor-dim"
                  }`}>
                    {(record.decision?.strength ?? 0) > 0 ? "+" : ""}{(record.decision?.strength ?? 0 * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] font-mono text-phosphor-dim py-12 text-center tracking-wide uppercase">
            {filter ? "No matching records" : "No decision history yet"}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col gap-4 ${isTabMode ? "flex-grow" : "p-5 border border-amber-900/20 bg-[#0a0a0a]/40 backdrop-blur-md h-[450px]"}`}>
      {!isTabMode && (
        <div className="flex items-center justify-between border-b border-amber-900/20 pb-3">
          <span className="text-[10px] tracking-widest text-phosphor-muted font-bold uppercase">Decision History</span>
        </div>
      )}
      {content}
    </div>
  );
}
