"use client";

import { useEffect, useState, useRef } from "react";
import { Badge } from "@/shared/ui";
import type { TradeData } from "@/features/trading-agent/hooks/use-agent";

interface ToastTrade {
  id: string;
  symbol: string;
  action: string;
  side: string;
  price: number;
  size: number;
  timestamp: number;
}

interface Props {
  trades: TradeData[];
}

const actionLabel: Record<string, string> = {
  entry: "BOUGHT", exit: "SOLD", add: "ADDED", reduce: "REDUCED",
};

export function TradeToast({ trades }: Props) {
  const [toasts, setToasts] = useState<ToastTrade[]>([]);
  const lastTradeCountRef = useRef(trades.length);

  useEffect(() => {
    if (trades.length > lastTradeCountRef.current) {
      // New trades appeared
      const newTrades = trades.slice(lastTradeCountRef.current);
      for (const t of newTrades) {
        const toast: ToastTrade = {
          id: t.id + "-" + Date.now(),
          symbol: t.symbol,
          action: t.action,
          side: t.side,
          price: t.price,
          size: t.size,
          timestamp: Date.now(),
        };
        setToasts(prev => [...prev, toast]);

        // Auto-remove after 4 seconds
        setTimeout(() => {
          setToasts(prev => prev.filter(to => to.id !== toast.id));
        }, 4000);
      }
    }
    lastTradeCountRef.current = trades.length;
  }, [trades]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-slide-in-right bg-zinc-950/95 border border-zinc-700/60 rounded px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur-md min-w-[280px] pointer-events-auto"
        >
          <div className="flex items-center gap-3">
            <Badge
              variant={toast.side === "buy" ? "success" : "danger"}
              className="text-[9px] px-2"
            >
              {actionLabel[toast.action] ?? toast.action}
            </Badge>
            <span className="text-[13px] font-mono font-bold text-zinc-100">{toast.symbol}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-zinc-400">
            <span>{toast.size.toFixed(4)} @ ${toast.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
