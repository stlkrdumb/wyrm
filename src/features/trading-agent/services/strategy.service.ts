import fs from "node:fs";
import path from "node:path";
import { updateCircuitBreakerThreshold } from "./agent-engine";
import { runtimeConfigOverrides } from "./state-store";

const STRATEGY_FILE = path.join(process.cwd(), ".data", "agent-strategy.json");

export interface AgentStrategy {
  persona: string;
  customInstructions: string;
  circuitBreakerThresholdPct?: number;
  orderSizePct?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  cycleIntervalMs?: number;
  maxActivePositions?: number;
  convictionThreshold?: number;
}

const DEFAULT_STRATEGY: AgentStrategy = {
  persona: "Conservative quantitative analyst prioritizing capital preservation.",
  customInstructions: "Trade conservatively. Always favor 'hold' unless conviction is very high. Look for strong RSI oversold (<35) for buy entry and overbought (>65) for exit.",
  circuitBreakerThresholdPct: 10,
  orderSizePct: 0.05,
  stopLossPct: 5,
  takeProfitPct: 10,
  cycleIntervalMs: 30000,
  maxActivePositions: 3,
  convictionThreshold: 0.3,
};

class StrategyService {
  private cachedStrategy: AgentStrategy | null = null;

  public getStrategy(): AgentStrategy {
    if (this.cachedStrategy) return this.cachedStrategy;

    try {
      if (!fs.existsSync(STRATEGY_FILE)) {
        this.saveStrategy(DEFAULT_STRATEGY);
        return DEFAULT_STRATEGY;
      }
      const raw = fs.readFileSync(STRATEGY_FILE, "utf-8");
      const parsed = JSON.parse(raw) as AgentStrategy;
      
      // Ensure defaults/fallbacks
      if (parsed.circuitBreakerThresholdPct == null) parsed.circuitBreakerThresholdPct = 10;
      if (parsed.orderSizePct == null) parsed.orderSizePct = 0.05;
      if (parsed.stopLossPct == null) parsed.stopLossPct = 5;
      if (parsed.takeProfitPct == null) parsed.takeProfitPct = 10;
      if (parsed.cycleIntervalMs == null) parsed.cycleIntervalMs = 30000;
      if (parsed.maxActivePositions == null) parsed.maxActivePositions = 3;
      if (parsed.convictionThreshold == null) parsed.convictionThreshold = 0.3;

      this.cachedStrategy = parsed;

      // Apply overrides immediately
      runtimeConfigOverrides.stopLossPct = parsed.stopLossPct;
      runtimeConfigOverrides.takeProfitPct = parsed.takeProfitPct;
      runtimeConfigOverrides.orderSizePct = parsed.orderSizePct;
      runtimeConfigOverrides.cycleIntervalMs = parsed.cycleIntervalMs;
      runtimeConfigOverrides.maxActivePositions = parsed.maxActivePositions;
      runtimeConfigOverrides.convictionThreshold = parsed.convictionThreshold;

      return parsed;
    } catch (err) {
      console.warn("[StrategyService] Failed to load strategy, using default:", err);
      runtimeConfigOverrides.stopLossPct = DEFAULT_STRATEGY.stopLossPct;
      runtimeConfigOverrides.takeProfitPct = DEFAULT_STRATEGY.takeProfitPct;
      runtimeConfigOverrides.orderSizePct = DEFAULT_STRATEGY.orderSizePct;
      runtimeConfigOverrides.cycleIntervalMs = DEFAULT_STRATEGY.cycleIntervalMs;
      return DEFAULT_STRATEGY;
    }
  }

  public saveStrategy(strategy: AgentStrategy): void {
    try {
      const dir = path.dirname(STRATEGY_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STRATEGY_FILE, JSON.stringify(strategy, null, 2));
      this.cachedStrategy = strategy;
      console.log("[StrategyService] Saved strategy to disk:", strategy.persona);

      // Apply the drawdown threshold immediately to the agent state
      if (strategy.circuitBreakerThresholdPct != null) {
        updateCircuitBreakerThreshold(strategy.circuitBreakerThresholdPct);
      }

      // Apply overrides immediately
      runtimeConfigOverrides.stopLossPct = strategy.stopLossPct;
      runtimeConfigOverrides.takeProfitPct = strategy.takeProfitPct;
      runtimeConfigOverrides.orderSizePct = strategy.orderSizePct;
      runtimeConfigOverrides.cycleIntervalMs = strategy.cycleIntervalMs;
      runtimeConfigOverrides.maxActivePositions = strategy.maxActivePositions;
      runtimeConfigOverrides.convictionThreshold = strategy.convictionThreshold;
    } catch (err) {
      console.error("[StrategyService] Failed to save strategy:", err);
    }
  }
}

export const strategyService = new StrategyService();
