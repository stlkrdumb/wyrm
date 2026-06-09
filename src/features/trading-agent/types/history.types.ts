import type { TradingDecision } from "./signal.types";

/**
 * Represents a historical record of a trading decision made by the agent.
 * This includes the original intent, the risk evaluation, and the final outcome.
 */
export interface DecisionRecord {
  id: string;
  timestamp: Date;
  symbol: string;
  decision: TradingDecision;
  riskStatus: "approved" | "blocked" | "adjusted";
  riskReason?: string;
  originalSize?: number;
  adjustedSize?: number;
  
  /** 
   * The market prices at the time of decision. 
   * Useful for backtesting and visual reconstruction.
   */
  marketContext?: {
    lastPrice: number;
    change24hPercent: number;
  };

  /** 
   * If the decision was executed, link to the trade ID.
   * If it was blocked, this will be null.
   */
  tradeId?: string;
}
