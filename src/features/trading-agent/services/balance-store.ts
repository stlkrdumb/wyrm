/** Persist portfolio state to disk so balance survives server restarts. */
import fs from "node:fs";
import type { PendingOrder } from "@/features/trading-agent/types";
import path from "node:path";

const STORE_PATH = path.join(
  process.cwd(),
  ".data",
  "portfolio-state.json"
);

export interface PortfolioState {
  initialCash: number;       // config value (never changes)
  startCash: number;         // equity at last reset/start point (for correct PnL)
  cash: number;              // liquid balance
  accumulatedRealizedPnL: number; // all realized PnL from closed trades
  positions: Array<{        // open positions at last save
    symbol: string;
    side: "long" | "short";
    size: number;
    entryPrice: number;
    stopLossPct: number;
    takeProfitPct: number;
  }>;
  pendingOrders: Array<{    // pending limit orders at last save
    id: string;
    symbol: string;
    side: "buy" | "sell";
    limitPrice: number;
    size: number;
    createdAt: string;
    stopLossPct: number;
    takeProfitPct: number;
  }>;
  totalTrades: number;
  winRate: number;           // approximate — for display
  circuitBreakerTripped?: boolean;
  circuitBreakerThresholdPct?: number;
  peakEquity?: number;
}

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadBalanceState(): PortfolioState | null {
  try {
    if (!fs.existsSync(STORE_PATH)) return null;
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const state = JSON.parse(raw) as PortfolioState;
    // Backward compat: if startCash missing, derive from cash
    if (state.startCash === undefined) {
      state.startCash = state.cash;
    }
    console.log(`[Balance] Loaded from disk — cash: $${state.cash.toLocaleString()}, startCash: $${state.startCash}, realized PnL: ${state.accumulatedRealizedPnL >= 0 ? "+" : ""}$${state.accumulatedRealizedPnL}, positions: ${state.positions.length}`);
    return state;
  } catch {
    return null;
  }
}

export function saveBalanceState(state: PortfolioState): void {
  ensureDir();
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("[Balance] Save failed:", err instanceof Error ? err.message : String(err));
  }
}

export function resetBalanceState(initialCash: number): PortfolioState {
  const state: PortfolioState = {
    initialCash,
    startCash: initialCash,
    cash: initialCash,
    accumulatedRealizedPnL: 0,
    positions: [],
    pendingOrders: [],
    totalTrades: 0,
    winRate: 0,
    circuitBreakerTripped: false,
    circuitBreakerThresholdPct: 5.0,
    peakEquity: initialCash,
  };
  saveBalanceState(state);
  console.log(`[Balance] Reset to initial: $${initialCash.toLocaleString()}`);
  return state;
}
