"use client";

import { useEffect, useState, useRef } from "react";
import { Badge } from "@/shared/ui";
import type { TradeData, PendingOrderData } from "@/features/trading-agent/hooks/use-agent";

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
  pendingOrders: PendingOrderData[];
}

const tradeActionLabel: Record<string, string> = {
  entry: "BOUGHT", exit: "SOLD", add: "ADDED", reduce: "REDUCED",
};

export function TradeToast({ trades, pendingOrders }: Props) {
  const [toasts, setToasts] = useState<ToastTrade[]>([]);
  const lastTradeCountRef = useRef(trades.length);
  const lastPendingCountRef = useRef(pendingOrders.length);

  // Toast for filled trades
  useEffect(() => {
    if (trades.length > lastTradeCountRef.current) {
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

        setTimeout(() => {
          setToasts(prev => prev.filter(to => to.id !== toast.id));
        }, 4000);
      }
    }
    lastTradeCountRef.current = trades.length;
  }, [trades]);

  // Toast for new pending limit orders
  useEffect(() => {
    if (pendingOrders.length > lastPendingCountRef.current) {
      const newOrders = pendingOrders.slice(lastPendingCountRef.current);
      for (const o of newOrders) {
        const toast: ToastTrade = {
          id: o.id + "-" + Date.now(),
          symbol: o.symbol,
          action: "limit_" + o.side,
          side: o.side,
          price: o.limitPrice,
          size: o.size,
          timestamp: Date.now(),
        };
        setToasts(prev => [...prev, toast]);

        setTimeout(() => {
          setToasts(prev => prev.filter(to => to.id !== toast.id));
        }, 4000);
      }
    }
    lastPendingCountRef.current = pendingOrders.length;
  }, [pendingOrders]);

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
              variant={toast.action.startsWith("limit_") ? (toast.side === "buy" ? "success" : "danger") : toast.side === "buy" ? "success" : "danger"}
              className="text-[11px] px-2"
            >
              {toast.action === "limit_buy" ? "LIMIT BUY" : toast.action === "limit_sell" ? "LIMIT SELL" : (tradeActionLabel[toast.action] ?? toast.action)}
            </Badge>
            <span className="text-[13px] font-mono font-bold text-zinc-100">{toast.symbol}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[12px] font-mono text-zinc-400">
            <span>{toast.size.toFixed(4)} @ ${toast.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            {toast.action.startsWith("limit_") && <span className="text-amber-400/70 font-semibold">LIMIT</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
