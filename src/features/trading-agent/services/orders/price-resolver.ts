/**
 * Price resolution utilities — resolves execution prices for orders.
 * Trade prices must come from the live WS feed, never REST snapshots.
 */
import type { TradingDecision } from "@/features/trading-agent/types";
import { priceStore } from "../price-store";
import { config } from "../state-store";
import { RISK_PROFILES } from "../../constants/risk.constants";

/** Resolve the trade execution price from the WS cache ONLY.
 *  Returns null when no fresh WS data is available — caller should skip the trade. */
export function resolveWsPrice(symbol: string): { price: number } | null {
  const cached = priceStore.getCached(symbol);
  if (cached && !priceStore.isStale(symbol, 60_000) && cached.lastPrice > 0) {
    return { price: cached.lastPrice };
  }
  return null;
}

/** Resolve stop-loss and take-profit percentages from decision or config. */
export function resolveSLTP(decision: TradingDecision): { stopLossPct: number; takeProfitPct: number } {
  // LLM_RISKPROFILE=true: LLM directly outputs slPct/tpPct — ignore RISK_PROFILES
  if (
    process.env.LLM_RISKPROFILE === "true" &&
    decision.slPct !== undefined &&
    decision.tpPct !== undefined
  ) {
    return { stopLossPct: decision.slPct, takeProfitPct: decision.tpPct };
  }
  // Fallback chain: LLM-picked profile -> config defaults
  if (decision.riskProfile && RISK_PROFILES[decision.riskProfile]) {
    return { ...RISK_PROFILES[decision.riskProfile] };
  }
  return { stopLossPct: config.stopLossPct, takeProfitPct: config.takeProfitPct };
}
