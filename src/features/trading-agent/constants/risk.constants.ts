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
