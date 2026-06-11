import fs from "node:fs";
import path from "node:path";
import { evaluateMultiPair } from "./decision-engine.service";
import { riskManager } from "./risk-manager.service";
import { priceStore } from "./price-store";
import { config } from "./state-store";
import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";
import type { Candlestick } from "@/features/trading-agent/types";

const DATA_FILE = path.join(process.cwd(), ".data", "backtests", "backtest-data.json");

/**
 * BacktestService
 * Simulates agent behavior over a historical data set.
 */
export class BacktestService {
  /**
   * Runs a backtest on the provided historical snapshots.
   * @param initialEquity The starting capital for the backtest.
   * @returns A promise resolving to the BacktestResult.
   */
  public async runBacktest(initialEquity: number): Promise<BacktestResult> {
    if (!fs.existsSync(DATA_FILE)) {
      throw new Error(`Backtest data file not found at ${DATA_FILE}`);
    }

    const rawData = fs.readFileSync(DATA_FILE, "utf-8");
    const historicalData = JSON.parse(rawData) as Record<
      string,
      { "5m": Candlestick[]; "1h": Candlestick[]; "1d": Candlestick[] }
    >;

    // Enable backtesting flag in priceStore
    priceStore.isBacktesting = true;

    try {
      const symbols = Object.keys(historicalData);
      if (symbols.length === 0) {
        throw new Error("No symbols found in backtest data");
      }

      const btc1h = historicalData["BTCUSDT"]?.["1h"];
      if (!btc1h || btc1h.length === 0) {
        throw new Error("BTCUSDT 1h candles are missing in backtest data");
      }

      let cash = initialEquity;
      let tradeCount = 0;
      let wins = 0;
      const equityCurve: { timestamp: Date; equity: number }[] = [];
      const trades: Array<{ timestamp: Date; symbol: string; side: "buy" | "sell"; price: number; pnl: number }> = [];

      // Tracks open spot positions: symbol -> { size, entryPrice }
      const currentPositions: Record<string, { size: number; entryPrice: number; stopLossPct: number; takeProfitPct: number }> = {};

      // Run backtest over the last 30 snapshots to keep LLM calls fast but allow a rich lookback
      const stepsToRun = 30;
      const startIdx = Math.max(0, btc1h.length - stepsToRun);
      const endIdx = btc1h.length - 1;

      console.log(`[Backtest] Running offline simulation from step ${startIdx} to ${endIdx}...`);

      for (let idx = startIdx; idx <= endIdx; idx++) {
        const stepSnapshot = btc1h[idx];
        const timestamp = stepSnapshot.timestamp;

        // Populate priceMap and inject candles into priceStore up to this step
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const priceMap = new Map<string, any>();
        for (const symbol of symbols) {
          const symData = historicalData[symbol];
          if (!symData) continue;

          const candle1h = symData["1h"][idx];
          if (!candle1h) continue;

          // Standardize ticker object for validation
          const prev1h = symData["1h"][Math.max(0, idx - 24)] ?? symData["1h"][0];
          const change24hPercent = prev1h.close > 0 ? ((candle1h.close - prev1h.close) / prev1h.close) * 100 : 0;

          priceMap.set(symbol, {
            symbol,
            lastPrice: candle1h.close,
            high24h: candle1h.high,
            low24h: candle1h.low,
            volume24h: candle1h.volume,
            change24hPercent: Number(change24hPercent.toFixed(2))
          });

          // Slice candles up to current step timestamp and inject into store
          const sliced1h = symData["1h"].slice(0, idx + 1);
          priceStore.setCandles(symbol, "1h", sliced1h);

          const sliced5m = symData["5m"].filter(c => c.timestamp <= timestamp).slice(-100);
          priceStore.setCandles(symbol, "5m", sliced5m);

          const sliced1d = symData["1d"].filter(c => c.timestamp <= timestamp).slice(-50);
          priceStore.setCandles(symbol, "1d", sliced1d);
        }

        // Calculate portfolio equity at the start of this step
        const startEquity = cash + Object.entries(currentPositions).reduce((sum, [symbol, pos]) => {
          const currentPrice = priceMap.get(symbol)?.lastPrice ?? pos.entryPrice;
          return sum + pos.size * currentPrice;
        }, 0);

        // Map positions for the decision engine
        const activePositionsList = Object.entries(currentPositions).map(([symbol, pos]) => {
          const currentPrice = priceMap.get(symbol)?.lastPrice ?? pos.entryPrice;
          return {
            symbol,
            side: "long" as const,
            size: pos.size,
            entryPrice: pos.entryPrice,
            unrealizedPnL: pos.size * (currentPrice - pos.entryPrice),
            stopLossPct: pos.stopLossPct,
            takeProfitPct: pos.takeProfitPct,
          };
        });

        // 1. Evaluate decisions based on historical snapshot
        const multiResult = await evaluateMultiPair(priceMap, activePositionsList);

        // 2. Validate and Execute simulated trades
        for (const [symbol, decision] of Object.entries(multiResult.decisions)) {
          const ticker = priceMap.get(symbol);
          const price = ticker?.lastPrice ?? 0;
          if (price <= 0) continue;

          const validation = riskManager.validateDecision(decision, { 
            timestamp: new Date(timestamp),
            initialCash: initialEquity,
            cash,
            equity: startEquity, 
            positions: activePositionsList, 
            totalTrades: tradeCount,
            winRate: tradeCount > 0 ? (wins / tradeCount) * 100 : 0,
            totalPnL: startEquity - initialEquity
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any, ticker);

          if (validation.isAllowed) {
            const finalDecision = validation.adjustedDecision ?? decision;

            if (finalDecision.action === "buy") {
              const size = finalDecision.size ?? 0;
              const cost = size * price;

              if (cost > 0 && cost <= cash) {
                cash -= cost;
                const existing = currentPositions[symbol];
                if (existing) {
                  const newSize = existing.size + size;
                  const newEntryPrice = (existing.entryPrice * existing.size + price * size) / newSize;
                  currentPositions[symbol] = { size: newSize, entryPrice: newEntryPrice, stopLossPct: existing.stopLossPct, takeProfitPct: existing.takeProfitPct };
                } else {
                  currentPositions[symbol] = { size, entryPrice: price, stopLossPct: config.stopLossPct, takeProfitPct: config.takeProfitPct };
                }

                tradeCount++;
                trades.push({
                  timestamp: new Date(timestamp),
                  symbol,
                  side: "buy",
                  price,
                  pnl: 0
                });
              }
            } else if (finalDecision.action === "sell") {
              const existing = currentPositions[symbol];
              if (existing && existing.size > 0) {
                const size = Math.min(finalDecision.size ?? existing.size, existing.size);
                const revenue = size * price;
                cash += revenue;

                const realizedPnL = size * (price - existing.entryPrice);
                tradeCount++;
                if (realizedPnL > 0) wins++;

                trades.push({
                  timestamp: new Date(timestamp),
                  symbol,
                  side: "sell",
                  price,
                  pnl: realizedPnL
                });

                if (existing.size - size <= 0.000001) {
                  delete currentPositions[symbol];
                } else {
                  currentPositions[symbol] = {
                    size: existing.size - size,
                    entryPrice: existing.entryPrice,
                    stopLossPct: existing.stopLossPct,
                    takeProfitPct: existing.takeProfitPct
                  };
                }
              }
            }
          }
        }

        // Calculate portfolio equity at the end of this step
        const endEquity = cash + Object.entries(currentPositions).reduce((sum, [symbol, pos]) => {
          const currentPrice = priceMap.get(symbol)?.lastPrice ?? pos.entryPrice;
          return sum + pos.size * currentPrice;
        }, 0);

        equityCurve.push({
          timestamp: new Date(timestamp),
          equity: endEquity
        });
      }

      // Calculate Max Drawdown
      let peak = initialEquity;
      let maxDrawdown = 0;
      for (const curvePoint of equityCurve) {
        if (curvePoint.equity > peak) {
          peak = curvePoint.equity;
        }
        const dd = peak > 0 ? ((peak - curvePoint.equity) / peak) * 100 : 0;
        if (dd > maxDrawdown) {
          maxDrawdown = dd;
        }
      }

      const finalEquity = equityCurve[equityCurve.length - 1]?.equity ?? initialEquity;
      const losses = tradeCount - wins;

      // Sharpe ratio (annualized, assuming daily returns)
      const returns = equityCurve.map((p, i) => {
        const prev = i === 0 ? initialEquity : equityCurve[i - 1].equity;
        return prev > 0 ? (p.equity - prev) / prev : 0;
      });
      const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1);
      const sharpe = variance > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(365) : 0;

      // Average win/loss
      const winTrades = trades.filter(t => t.pnl > 0);
      const lossTrades = trades.filter(t => t.pnl < 0);
      const avgWin = winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.pnl, 0) / winTrades.length : 0;
      const avgLoss = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + t.pnl, 0) / lossTrades.length) : 0;

      // Max consecutive losses
      let maxConsecutiveLosses = 0;
      let currentStreak = 0;
      for (const t of trades) {
        if (t.pnl < 0) {
          currentStreak++;
          maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
        } else if (t.pnl > 0) {
          currentStreak = 0;
        }
      }

      return {
        totalReturn: ((finalEquity - initialEquity) / initialEquity) * 100,
        maxDrawdown,
        winRate: tradeCount > 0 ? (wins / tradeCount) * 100 : 0,
        totalTrades: tradeCount,
        sharpeRatio: Number(sharpe.toFixed(2)),
        avgWin: Number(avgWin.toFixed(2)),
        avgLoss: Number(avgLoss.toFixed(2)),
        wins,
        losses,
        maxConsecutiveLosses,
        equityCurve,
        trades
      };
    } finally {
      // Restore backtesting flag to false
      priceStore.isBacktesting = false;
    }
  }
}

export const backtestService = new BacktestService();
