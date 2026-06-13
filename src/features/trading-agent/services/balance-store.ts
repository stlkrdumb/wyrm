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
  totalTrades: number;
  winRate: number;           // approximate — for display
  circuitBreakerTripped?: boolean;
  circuitBreakerThresholdPct?: number;
  peakEquity?: number;
  tradeCounter?: number;     // monotonic — prevents duplicate trade IDs across restarts
  equityHistory?: Array<{ timestamp: string; equity: number }>;
}

/** Runtime validation — guards against corrupted or partial JSON. */
function validateState(raw: unknown): PortfolioState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;

  if (typeof s.cash !== "number" || !Number.isFinite(s.cash)) {
    console.warn("[Balance] Invalid state — cash is not a finite number");
    return null;
  }
  if (typeof s.startCash !== "number" || !Number.isFinite(s.startCash)) {
    console.warn("[Balance] Invalid state — startCash is not a finite number");
    return null;
  }
  if (!Array.isArray(s.positions)) {
    console.warn("[Balance] Invalid state — positions is not an array");
    return null;
  }
  // Validate each position's fields
  for (const p of s.positions as unknown[]) {
    if (!p || typeof p !== "object") return null;
    const pos = p as Record<string, unknown>;
    if (typeof pos.symbol !== "string") return null;
    if (typeof pos.size !== "number" || !Number.isFinite(pos.size)) return null;
    if (typeof pos.entryPrice !== "number" || !Number.isFinite(pos.entryPrice)) return null;
  }
  // Coerce optional fields with sensible defaults
  return {
    initialCash: typeof s.initialCash === "number" ? s.initialCash : 1000,
    startCash: s.startCash as number,
    cash: s.cash as number,
    accumulatedRealizedPnL: typeof s.accumulatedRealizedPnL === "number" ? s.accumulatedRealizedPnL : 0,
    positions: s.positions as PortfolioState["positions"],
    totalTrades: typeof s.totalTrades === "number" ? s.totalTrades : 0,
    winRate: typeof s.winRate === "number" ? s.winRate : 0,
    circuitBreakerTripped: typeof s.circuitBreakerTripped === "boolean" ? s.circuitBreakerTripped : false,
    circuitBreakerThresholdPct: typeof s.circuitBreakerThresholdPct === "number" ? s.circuitBreakerThresholdPct : 5.0,
    peakEquity: typeof s.peakEquity === "number" ? s.peakEquity : (s.cash as number),
    tradeCounter: typeof s.tradeCounter === "number" && s.tradeCounter >= 0 ? s.tradeCounter : 0,
    equityHistory: Array.isArray(s.equityHistory)
      ? (s.equityHistory.filter(
          (e) => e && typeof e === "object" && typeof e.timestamp === "string" && typeof e.equity === "number"
        ) as PortfolioState["equityHistory"])
      : [],
  };
}

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadBalanceState(): PortfolioState | null {
  try {
    if (!fs.existsSync(STORE_PATH)) return null;
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const state = validateState(parsed);
    if (!state) {
      console.warn("[Balance] Persisted state failed validation — ignoring");
      return null;
    }
    // Backward compat: if startCash missing, derive from cash
    if (state.startCash === undefined) {
      state.startCash = state.cash;
    }
    console.log(`[Balance] Loaded from disk — cash: $${state.cash.toLocaleString()}, startCash: $${state.startCash}, realized PnL: ${state.accumulatedRealizedPnL >= 0 ? "+" : ""}$${state.accumulatedRealizedPnL}, positions: ${state.positions.length}, tradeCounter: ${state.tradeCounter ?? 0}`);
    return state;
  } catch (err) {
    console.warn("[Balance] Failed to read state:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export function saveBalanceState(state: PortfolioState): void {
  ensureDir();
  try {
    let finalState = state;
    if (!state.equityHistory && fs.existsSync(STORE_PATH)) {
      try {
        const raw = fs.readFileSync(STORE_PATH, "utf-8");
        const existing = JSON.parse(raw);
        if (existing && typeof existing === "object" && Array.isArray(existing.equityHistory)) {
          finalState = {
            ...state,
            equityHistory: existing.equityHistory,
          };
        }
      } catch {
        // ignore read/parse errors
      }
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(finalState, null, 2));
  } catch (err) {
    console.error("[Balance] Save failed:", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export function resetBalanceState(initialCash: number): PortfolioState {
  const state: PortfolioState = {
    initialCash,
    startCash: initialCash,
    cash: initialCash,
    accumulatedRealizedPnL: 0,
    positions: [],
    totalTrades: 0,
    winRate: 0,
    circuitBreakerTripped: false,
    circuitBreakerThresholdPct: 5.0,
    peakEquity: initialCash,
    tradeCounter: 0,
    equityHistory: [],
  };
  saveBalanceState(state);
  console.log(`[Balance] Reset to initial: $${initialCash.toLocaleString()}`);
  return state;
}
