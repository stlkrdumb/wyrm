/**
 * Agent Metrics Service
 * Collects and exposes real-time metrics for monitoring and debugging.
 * Singleton — shared across cycles via module scope.
 */

interface CycleMetrics {
  total: number;
  successful: number;
  timeout: number;
  error: number;
}

interface LLMLatencySamples {
  samples: number[];
  p50: number;
  p95: number;
  max: number;
}

interface TradeMetrics {
  total: number;
  buys: number;
  sells: number;
  realizedPnL: number;
}

export interface AgentMetrics {
  cycles: CycleMetrics;
  llmLatency: LLMLatencySamples;
  trades: TradeMetrics;
  portfolio: {
    cash: number;
    equity: number;
    totalPnL: number;
    dailyPnL: number;
    peakEquity: number;
  };
  status: {
    agent: "running" | "stopped" | "paused";
    circuitBreakerTripped: boolean;
    lastCycleAt: number | null;
    cycleIntervalMs: number;
    cycleAdherencePct: number;
  };
  config: {
    modelName: string;
    tradingSymbols: string[];
    convictionThreshold: number;
    stopLossPct: number;
    takeProfitPct: number;
  };
}

const MAX_LATENCY_SAMPLES = 50;

class MetricsService {
  private cycles: CycleMetrics = { total: 0, successful: 0, timeout: 0, error: 0 };
  private llmLatencySamples: number[] = [];
  private cycleTimestamps: number[] = [];
  private trades: TradeMetrics = { total: 0, buys: 0, sells: 0, realizedPnL: 0 };

  recordCycleStart(): void {
    this.cycles.total++;
    this.cycleTimestamps.push(Date.now());
    if (this.cycleTimestamps.length > 10) this.cycleTimestamps.shift();
  }

  recordCycleSuccess(): void {
    this.cycles.successful++;
  }

  recordCycleTimeout(): void {
    this.cycles.timeout++;
  }

  recordCycleError(): void {
    this.cycles.error++;
  }

  recordLLMLatency(ms: number): void {
    this.llmLatencySamples.push(ms);
    if (this.llmLatencySamples.length > MAX_LATENCY_SAMPLES) {
      this.llmLatencySamples.shift();
    }
  }

  recordTrade(side: "buy" | "sell", pnl?: number): void {
    this.trades.total++;
    if (side === "buy") this.trades.buys++;
    else this.trades.sells++;
    if (pnl !== undefined) this.trades.realizedPnL += pnl;
  }

  getMetrics(state: any): AgentMetrics {
    const sortedLatencies = [...this.llmLatencySamples].sort((a, b) => a - b);
    const p50 = sortedLatencies.length > 0
      ? sortedLatencies[Math.floor(sortedLatencies.length * 0.5)]
      : 0;
    const p95 = sortedLatencies.length > 0
      ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)]
      : 0;
    const maxLatency = sortedLatencies.length > 0
      ? sortedLatencies[sortedLatencies.length - 1]
      : 0;

    const cycleIntervalMs = Number(process.env.AGENT_CYCLE_INTERVAL_MS) || 30000;
    let cycleAdherencePct = 100;
    if (this.cycleTimestamps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < this.cycleTimestamps.length; i++) {
        intervals.push(this.cycleTimestamps[i] - this.cycleTimestamps[i - 1]);
      }
      const adherentCount = intervals.filter(ms => ms <= cycleIntervalMs * 1.2).length;
      cycleAdherencePct = (adherentCount / intervals.length) * 100;
    }

    return {
      cycles: { ...this.cycles },
      llmLatency: { samples: this.llmLatencySamples, p50, p95, max: maxLatency },
      trades: { ...this.trades },
      portfolio: {
        cash: state.portfolio?.cash ?? 0,
        equity: state.portfolio?.equity ?? 0,
        totalPnL: state.portfolio?.totalPnL ?? 0,
        dailyPnL: state.dailyPnL ?? 0,
        peakEquity: state.peakEquity ?? 0,
      },
      status: {
        agent: state.status ?? "stopped",
        circuitBreakerTripped: !!state.circuitBreakerTripped,
        lastCycleAt: state.lastCycleAt ? new Date(state.lastCycleAt).getTime() : null,
        cycleIntervalMs,
        cycleAdherencePct,
      },
      config: {
        modelName: state.modelName ?? "unknown",
        tradingSymbols: (process.env.TRADING_SYMBOLS || "BTCUSDT").split(",").map((s: string) => s.trim()),
        convictionThreshold: Number(process.env.MIN_CONVICTION_THRESHOLD) || 0.3,
        stopLossPct: Number(process.env.SIM_STOP_LOSS_PCT) || 5,
        takeProfitPct: Number(process.env.SIM_TAKE_PROFIT_PCT) || 10,
      },
    };
  }
}

export const metricsService = new MetricsService();
