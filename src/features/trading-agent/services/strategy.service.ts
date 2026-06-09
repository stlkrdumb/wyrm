import fs from "node:fs";
import path from "node:path";

const STRATEGY_FILE = path.join(process.cwd(), ".data", "agent-strategy.json");

export interface AgentStrategy {
  persona: string;
  customInstructions: string;
}

const DEFAULT_STRATEGY: AgentStrategy = {
  persona: "Conservative quantitative analyst prioritizing capital preservation.",
  customInstructions: "Trade conservatively. Always favor 'hold' unless conviction is very high. Look for strong RSI oversold (<35) for buy entry and overbought (>65) for exit.",
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
      this.cachedStrategy = parsed;
      return parsed;
    } catch (err) {
      console.warn("[StrategyService] Failed to load strategy, using default:", err);
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
    } catch (err) {
      console.error("[StrategyService] Failed to save strategy:", err);
    }
  }
}

export const strategyService = new StrategyService();
