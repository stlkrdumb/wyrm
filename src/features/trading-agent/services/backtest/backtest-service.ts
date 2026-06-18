import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";
import { priceStore } from "../price-store";
import { loadBacktestData, getBacktestStepRange } from "./data";
import { config } from "../state-store";
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
      let lastTimestamp = btc1h[endIdx]?.timestamp || Date.now();

      for (let idx = startIdx; idx <= endIdx; idx++) {
        const stepSnapshot = btc1h[idx];
        const timestamp = stepSnapshot.timestamp;
        lastTimestamp = timestamp;

        const priceMap = injectStepData(symbols, historicalData, idx, timestamp);
        checkAutoBracketExits(ctx, historicalData, timestamp);

        const startEquity = calculateEquity(ctx.cash, ctx.currentPositions, priceMap);
        await executeStepTrades(ctx, priceMap, timestamp, startEquity, initialEquity);

        const endEquity = calculateEquity(ctx.cash, ctx.currentPositions, priceMap);
        equityCurve.push({ timestamp: new Date(timestamp), equity: endEquity });
      }

      // Force-liquidate any remaining open positions at the final step prices to show realized PnL
      const finalPriceMap = injectStepData(symbols, historicalData, endIdx, lastTimestamp);
      for (const [symbol, pos] of Object.entries(ctx.currentPositions)) {
        const currentPrice = finalPriceMap.get(symbol)?.lastPrice ?? pos.entryPrice;
        const revenue = pos.size * currentPrice;
        const fee = revenue * config.feePct;
        ctx.cash += revenue - fee;

        const realizedPnL = pos.size * (currentPrice - pos.entryPrice) - fee;
        ctx.tradeCount++;
        if (realizedPnL > 0) ctx.wins++;

        ctx.trades.push({
          timestamp: new Date(lastTimestamp),
          symbol,
          side: "sell",
          price: currentPrice,
          pnl: realizedPnL,
        });

        console.log(`[Backtest] Final liquidation: ${symbol} at $${currentPrice.toFixed(2)} (PnL: $${realizedPnL.toFixed(2)})`);
        delete ctx.currentPositions[symbol];
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