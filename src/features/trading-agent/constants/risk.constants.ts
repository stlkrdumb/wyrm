/**
 * Risk Management Constants
 * These parameters define the safety boundaries for the trading agent.
 * They are used by the RiskManager service to validate and/or adjust
 * decisions before execution.
 */

export const RISK_CONFIG = {
  /** Maximum percentage of total equity allowed in a single position (e.g., 0.10 = 10%) */
  MAX_POSITION_SIZE_PCT: 0.10,

  /** Maximum number of concurrent open positions allowed */
  MAX_CONCURRENT_POSITIONS: 5,

  /** Hard limit for stop loss percentage from entry price (e.g., 0.05 = 5%) */
  MAX_STOP_LOSS_PCT: 0.05,

  /** Minimum conviction strength required from the LLM to trigger a trade (0.0 to 1.0) */
  MIN_CONVICTION_THRESHOLD: 0.3,

  /** Minimum amount of equity required to open a new position (to avoid dust trades) */
  MIN_TRADE_VALUE: 10.0,
};

/**
 * Agent-Decided Risk Profiles
 * The LLM can pick a risk profile ("tight" | "normal" | "wide") per symbol
 * instead of raw stop-loss/take-profit percentages. Values are overridable
 * via environment variables with sensible defaults.
 */
export const RISK_PROFILES = {
  tight:  { stopLossPct: Number(process.env.RISK_SL_TIGHT)  || 3,  takeProfitPct: Number(process.env.RISK_TP_TIGHT)  || 9  },
  normal: { stopLossPct: Number(process.env.RISK_SL_NORMAL) || 5,  takeProfitPct: Number(process.env.RISK_TP_NORMAL) || 10 },
  wide:   { stopLossPct: Number(process.env.RISK_SL_WIDE)   || 8,  takeProfitPct: Number(process.env.RISK_TP_WIDE)   || 16 },
} as const;

export type RiskProfile = keyof typeof RISK_PROFILES;
