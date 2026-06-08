/** Persist portfolio state to disk so balance survives server restarts. */
import fs from "node:fs";
import path from "node:path";

const STORE_PATH = path.join(
  process.cwd(),
  ".data",
  "portfolio-state.json"
);

export interface PortfolioState {
  initialCash: number;       // config value (never changes)
  cash: number;              // liquid balance
  accumulatedRealizedPnL: number; // all realized PnL from closed trades
  positions: Array<{        // open positions at last save
    symbol: string;
    side: "long" | "short";
    size: number;
    entryPrice: number;
  }>;
  totalTrades: number;
  winRate: number;           // approximate — for display
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
    console.log(`[Balance] Loaded from disk — cash: $${state.cash.toLocaleString()}, realized PnL: ${state.accumulatedRealizedPnL >= 0 ? "+" : ""}$${state.accumulatedRealizedPnL}, positions: ${state.positions.length}`);
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
    cash: initialCash,
    accumulatedRealizedPnL: 0,
    positions: [],
    totalTrades: 0,
    winRate: 0,
  };
  saveBalanceState(state);
  console.log(`[Balance] Reset to initial: $${initialCash.toLocaleString()}`);
  return state;
}
