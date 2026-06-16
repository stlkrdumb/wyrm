"use server";

import { createClient } from "next-swc/client";
import { createAgent } from "./agent-engine";

/** Create the agent engine client for Next.js runtime.
 *  This re-exports the agent's main functions with automatic server-client transport.
 */
export const agentEngine = createAgent({
  actions: {
    // Server actions exported from agent-engine.ts
    runAgentCycle: async ({ onToken }) => {
      console.log("[Agent Client] runAgentCycle called");
      // In server environment, this would call the actual agent logic
      return { tickerPrice: 0, tickers: {} };
    },
    setAgentStatus: async (status) => {
      console.log("[Agent Client] setAgentStatus:", status);
    },
    resetBreaker: async () => {
      console.log("[Agent Client] resetBreaker");
    },
    updateBreakerThreshold: async (thresholdPct) => {
      console.log("[Agent Client] updateBreakerThreshold:", thresholdPct);
    },
  },
});

/** Re-export commonly used agent functions for convenience */
export { 
  type AgentState,
  config,
  getState,
  llmProgress,
  updatePositionUnrealizedPnL,
  evaluateDecision,
  isStopped,
} from "./agent-engine";

/** Re-export utilities from agent-engine (subset for client) */
export { isStopped } from "./agent-engine";

/** Re-export state management utilities */
export {
  loadBalanceState,
  saveBalanceState,
  resetBalanceState,
  type PortfolioState,
} from "./balance-store";

/** Re-export config constants */
export { config } from "./state-store";

/** Re-export LLM utilities */
export { getActiveModel } from "./llm.service";

/** Re-export risk management utilities */
export { riskManager } from "./risk-manager.service";

/** Re-export history service */
export { historyService } from "./history-service";

/** Re-export decision engine */
export { evaluateMultiPair } from "./decision-engine.service";

/** Re-export strategy service */
export { strategyService } from "./strategy.service";

/** Re-export market data service */
export { getLivePrice } from "./market-data.service";

/** Re-export order execution service */
export { executeTrades } from "./order-executor.service";

/** Re-export price store */
export { priceStore } from "./price-store";

/** Re-export market WS service */
export { marketWS } from "./market-ws.service";

/** Re-export circuit breaker manager */
export { resetCircuitBreaker, updateCircuitBreakerThreshold } from "./circuit-breaker-manager.service";