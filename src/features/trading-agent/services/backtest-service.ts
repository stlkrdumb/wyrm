import fs from "node:fs";
import path from "node:path";
import { evaluateMultiPair } from "./decision-engine.service";
import { riskManager } from "./risk-manager.service";
import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";

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
    const snapshots: any[] = JSON.parse(rawData);

    let cash = initialEquity;
    let tradeCount = 0;
    let wins = 0;
    const equityCurve: { timestamp: Date; equity: number }[] = [];
    const trades: Array<{ timestamp: Date; symbol: string; side: "buy" | "sell"; price: number; pnl: number }> = [];

    // Tracks open spot positions: symbol -> { size, entryPrice }
    const currentPositions: Record<string, { size: number; entryPrice: number }> = {};

    for (const snapshot of snapshots) {
      const tickers = snapshot.tickers as Record<string, any>;
      const priceMap = new Map<string, any>();
      for (const [symbol, data] of Object.entries(tickers)) {
        priceMap.set(symbol, {
          lastPrice: data.lastPrice,
          change24hPercent: data.change24hPercent
        });
      }

      // Calculate portfolio equity at the start of this step
      const startEquity = cash + Object.entries(currentPositions).reduce((sum, [symbol, pos]) => {
        const price = tickers[symbol]?.lastPrice ?? pos.entryPrice;
        return sum + pos.size * price;
      }, 0);

      // Map positions for the decision engine
      const activePositionsList = Object.entries(currentPositions).map(([symbol, pos]) => {
        const price = tickers[symbol]?.lastPrice ?? pos.entryPrice;
        return {
          symbol,
          side: "long" as const,
          size: pos.size,
          entryPrice: pos.entryPrice,
          unrealizedPnL: pos.size * (price - pos.entryPrice)
        };
      });

      // 1. Evaluate decisions based on current snapshot
      const multiResult = await evaluateMultiPair(priceMap, activePositionsList);

      // 2. Validate and Execute simulated trades
      for (const [symbol, decision] of Object.entries(multiResult.decisions)) {
        const ticker = priceMap.get(symbol);
        const price = ticker?.lastPrice ?? 0;
        if (price <= 0) continue;

        const validation = riskManager.validateDecision(decision, { 
          timestamp: new Date(snapshot.timestamp),
          initialCash: initialEquity,
          cash,
          equity: startEquity, 
          positions: activePositionsList, 
          totalTrades: tradeCount,
          winRate: tradeCount > 0 ? (wins / tradeCount) * 100 : 0,
          totalPnL: startEquity - initialEquity
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
                currentPositions[symbol] = { size: newSize, entryPrice: newEntryPrice };
              } else {
                currentPositions[symbol] = { size, entryPrice: price };
              }

              tradeCount++;
              trades.push({
                timestamp: new Date(snapshot.timestamp),
                symbol,
                side: "buy",
                price,
                pnl: 0 // Buying does not realize PnL
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
                timestamp: new Date(snapshot.timestamp),
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
                  entryPrice: existing.entryPrice
                };
              }
            }
          }
        }
      }

      // Calculate portfolio equity at the end of this step
      const endEquity = cash + Object.entries(currentPositions).reduce((sum, [symbol, pos]) => {
        const price = tickers[symbol]?.lastPrice ?? pos.entryPrice;
        return sum + pos.size * price;
      }, 0);

      equityCurve.push({
        timestamp: new Date(snapshot.timestamp),
        equity: endEquity
      });
    }

    // Calculate Max Drawdown from the equity curve
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

    return {
      totalReturn: ((finalEquity - initialEquity) / initialEquity) * 100,
      maxDrawdown,
      winRate: tradeCount > 0 ? (wins / tradeCount) * 100 : 0,
      totalTrades: tradeCount,
      equityCurve,
      trades
    };
  }
}

export const backtestService = new BacktestService();
