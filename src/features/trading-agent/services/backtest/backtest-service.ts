import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";
import { priceStore } from "../price-store";
import { loadBacktestData, getBacktestStepRange } from "./data";
import {
  injectStepData,
  checkAutoBracketExits,
  executeStepTrades,
  calculateEquity,
  type BacktestContext,
} from "./simulator";
import { calculateMetrics } from "./metrics";

export class BacktestService {
  public async runBacktest(initialEquity: number): Promise<BacktestResult> {
    const historicalData = await loadBacktestData();
    priceStore.isBacktesting = true;

    try {
      const symbols = Object.keys(historicalData);
      if (symbols.length === 0) throw new Error("No symbols found in backtest data");

      const btc1h = historicalData["BTCUSDT"]?.["1h"];
      if (!btc1h || btc1h.length === 0) throw new Error("BTCUSDT 1h candles missing");

      const { startIdx, endIdx } = getBacktestStepRange(btc1h);
      console.log(`[Backtest] Running simulation from step ${startIdx} to ${endIdx}...`);

      const ctx: BacktestContext = {
        cash: initialEquity,
        tradeCount: 0,
        wins: 0,
        currentPositions: {},
        trades: [],
        recentExits: [],
      };

      const equityCurve: { timestamp: Date; equity: number }[] = [];

      for (let idx = startIdx; idx <= endIdx; idx++) {
        const stepSnapshot = btc1h[idx];
        const timestamp = stepSnapshot.timestamp;

        const priceMap = injectStepData(symbols, historicalData, idx, timestamp);
        checkAutoBracketExits(ctx, historicalData, timestamp);

        const startEquity = calculateEquity(ctx.cash, ctx.currentPositions, priceMap);
        await executeStepTrades(ctx, priceMap, timestamp, startEquity, initialEquity);

        const endEquity = calculateEquity(ctx.cash, ctx.currentPositions, priceMap);
        equityCurve.push({ timestamp: new Date(timestamp), equity: endEquity });
      }

      const finalEquity = equityCurve[equityCurve.length - 1]?.equity ?? initialEquity;
      const metrics = calculateMetrics(initialEquity, finalEquity, ctx.trades, equityCurve);

      return { ...metrics, equityCurve, trades: ctx.trades };
    } finally {
      priceStore.isBacktesting = false;
    }
  }
}

export const backtestService = new BacktestService();