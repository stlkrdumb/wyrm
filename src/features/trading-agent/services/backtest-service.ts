import fs from "node:fs";
import path from "node:path";
import { evaluateMultiPair } from "./decision-engine.service";
import { riskManager } from "./risk-manager.service";
import { priceStore } from "./price-store";
import { config } from "./state-store";
import type { BacktestResult } from "@/features/trading-agent/types/backtest.types";
import type { Candlestick } from "@/features/trading-agent/types";
import { getCandlesWithCache } from "./market-data.service";

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
      console.log(`[Backtest] Data file not found. Fetching fresh historical candles for backtesting...`);
      const folder = path.dirname(DATA_FILE);
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }

      const freshData: Record<string, { "5m": Candlestick[]; "1h": Candlestick[]; "1d": Candlestick[] }> = {};
      const symbolsToFetch = [...new Set(["BTCUSDT", ...config.tradingSymbols])];

      for (const symbol of symbolsToFetch) {
        console.log(`[Backtest] Fetching candles for ${symbol}...`);
        try {
          const [candles5m, candles1h, candles1d] = await Promise.all([
            getCandlesWithCache(symbol, "5m", 1000),
            getCandlesWithCache(symbol, "1h", 200),
            getCandlesWithCache(symbol, "1d", 200),
          ]);
          freshData[symbol] = {
            "5m": candles5m,
            "1h": candles1h,
            "1d": candles1d,
          };
        } catch (err) {
          console.error(`[Backtest] Failed to fetch candles for ${symbol}:`, err);
        }
      }

      if (Object.keys(freshData).length === 0 || !freshData["BTCUSDT"]) {
        throw new Error("Failed to fetch historical backtest data from public endpoints");
      }

      fs.writeFileSync(DATA_FILE, JSON.stringify(freshData, null, 2));
      console.log(`[Backtest] Saved historical candles to ${DATA_FILE}`);
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
      const recentExits: Array<{ symbol: string; reason: "Stop Loss" | "Take Profit" | "Dust Cleanup"; timestamp: number }> = [];

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

        // Check SL/TP auto-bracket exits on the current step candles
        for (const [symbol, pos] of Object.entries(currentPositions)) {
          const symData = historicalData[symbol];
          if (!symData) continue;
          const candle1h = symData["1h"][idx];
          if (!candle1h) continue;

          const slPrice = pos.entryPrice * (1 - pos.stopLossPct / 100);
          const tpPrice = pos.entryPrice * (1 + pos.takeProfitPct / 100);

          let exited = false;
          let exitPrice = 0;
          let reason: "Stop Loss" | "Take Profit" = "Stop Loss";

          // If low price breaches stop loss, trigger stop loss
          if (candle1h.low <= slPrice) {
            exited = true;
            exitPrice = slPrice;
            reason = "Stop Loss";
          }
          // If high price breaches take profit, trigger take profit
          else if (candle1h.high >= tpPrice) {
            exited = true;
            exitPrice = tpPrice;
            reason = "Take Profit";
          }

          if (exited) {
            const revenue = pos.size * exitPrice;
            const fee = revenue * config.feePct;
            cash += revenue - fee;

            const realizedPnL = pos.size * (exitPrice - pos.entryPrice) - fee;
            tradeCount++;
            if (realizedPnL > 0) wins++;

            trades.push({
              timestamp: new Date(timestamp),
              symbol,
              side: "sell",
              price: exitPrice,
              pnl: realizedPnL
            });

            // Track the exit in recentExits (cooldown window / anti-hallucination)
            recentExits.push({
              symbol,
              reason,
              timestamp
            });

            console.log(`[Backtest] ${symbol} auto-bracket exit: ${reason} at $${exitPrice.toFixed(2)} (entry $${pos.entryPrice.toFixed(2)}, PnL: $${realizedPnL.toFixed(2)})`);
            delete currentPositions[symbol];
          }
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
        const multiResult = await evaluateMultiPair(priceMap, activePositionsList, undefined, recentExits);

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
          } as any, ticker);

          if (validation.isAllowed) {
            const finalDecision = validation.adjustedDecision ?? decision;

            if (finalDecision.action === "buy") {
              // Check recent exits cooldown
              const lastExit = recentExits.find(e => e.symbol === symbol);
              if (lastExit) {
                const elapsed = timestamp - lastExit.timestamp;
                const recentExitCooldownMs = Number(process.env.RECENT_EXIT_COOLDOWN_MS) || 600_000;
                if (elapsed < recentExitCooldownMs) {
                  console.log(`[Backtest] ${symbol}: skipping buy — auto-bracket cooldown (${Math.round(elapsed / 1000)}s / ${Math.round(recentExitCooldownMs / 1000)}s)`);
                  continue;
                }
              }

              const size = finalDecision.size ?? 0;
              const cost = size * price;
              const fee = cost * config.feePct;
              const totalCost = cost + fee;

              if (totalCost > 0 && totalCost <= cash) {
                cash -= totalCost;
                const existing = currentPositions[symbol];
                const stopLossPct = finalDecision.slPct ?? (finalDecision.riskProfile === "tight" ? 3 : finalDecision.riskProfile === "wide" ? 8 : config.stopLossPct);
                const takeProfitPct = finalDecision.tpPct ?? (finalDecision.riskProfile === "tight" ? 9 : finalDecision.riskProfile === "wide" ? 16 : config.takeProfitPct);

                // Capitalize entry price with fee to match order-executor behavior
                const entryPriceWithFee = price * (1 + config.feePct);

                if (existing) {
                  const newSize = existing.size + size;
                  const newEntryPrice = (existing.entryPrice * existing.size + entryPriceWithFee * size) / newSize;
                  currentPositions[symbol] = { size: newSize, entryPrice: newEntryPrice, stopLossPct, takeProfitPct };
                } else {
                  currentPositions[symbol] = { size, entryPrice: entryPriceWithFee, stopLossPct, takeProfitPct };
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
                const fee = revenue * config.feePct;
                cash += revenue - fee;

                const realizedPnL = size * (price - existing.entryPrice) - fee;
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
      const sharpe = variance > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(8760) : 0;

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
