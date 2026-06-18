import type { Candlestick, TradingDecision } from "@/features/trading-agent/types";
import type { BacktestData } from "./data";
import { priceStore } from "../price-store";
import { evaluateMultiPair } from "../decision-engine.service";
import { riskManager } from "../risk-manager.service";
import { config } from "../state-store";

export interface BacktestPosition {
  size: number;
  entryPrice: number;
  stopLossPct: number;
  takeProfitPct: number;
}

export interface BacktestStepResult {
  trades: Array<{ timestamp: Date; symbol: string; side: "buy" | "sell"; price: number; pnl?: number }>;
  equity: number;
  cash: number;
  tradeCount: number;
  wins: number;
  currentPositions: Record<string, BacktestPosition>;
}

export interface BacktestContext {
  cash: number;
  tradeCount: number;
  wins: number;
  currentPositions: Record<string, BacktestPosition>;
  trades: Array<{ timestamp: Date; symbol: string; side: "buy" | "sell"; price: number; pnl?: number }>;
  recentExits: Array<{ symbol: string; reason: "Stop Loss" | "Take Profit" | "Dust Cleanup" | "Manual Close"; timestamp: number }>;
}

/** Calculate portfolio equity from cash + open positions. */
export function calculateEquity(
  cash: number,
  positions: Record<string, BacktestPosition>,
  priceMap: Map<string, any>
): number {
  const positionsValue = Object.entries(positions).reduce((sum, [sym, pos]) => {
    const currentPrice = priceMap.get(sym)?.lastPrice ?? pos.entryPrice;
    return sum + pos.size * currentPrice;
  }, 0);
  return cash + positionsValue;
}

/** Inject historical candles into the price store for a single step. */
export function injectStepData(
  symbols: string[],
  historicalData: BacktestData,
  idx: number,
  timestamp: number
): Map<string, any> {
  const priceMap = new Map<string, any>();

  for (const symbol of symbols) {
    const symData = historicalData[symbol];
    if (!symData) continue;

    const candle1h = symData["1h"][idx];
    if (!candle1h) continue;

    const prev1h = symData["1h"][Math.max(0, idx - 24)] ?? symData["1h"][0];
    const change24hPercent = prev1h.close > 0
      ? ((candle1h.close - prev1h.close) / prev1h.close) * 100
      : 0;

    priceMap.set(symbol, {
      symbol,
      lastPrice: candle1h.close,
      high24h: candle1h.high,
      low24h: candle1h.low,
      volume24h: candle1h.volume,
      change24hPercent: Number(change24hPercent.toFixed(2)),
    });

    // Inject sliced candles into priceStore
    priceStore.setCandles(symbol, "1h", symData["1h"].slice(0, idx + 1));
    priceStore.setCandles(symbol, "5m", symData["5m"].filter(c => c.timestamp <= timestamp).slice(-100));
    priceStore.setCandles(symbol, "1d", symData["1d"].filter(c => c.timestamp <= timestamp).slice(-50));
  }

  return priceMap;
}

/** Check and process auto-bracket exits (SL/TP) for current positions at this step. */
export function checkAutoBracketExits(
  ctx: BacktestContext,
  historicalData: BacktestData,
  timestamp: number
): void {
  for (const [symbol, pos] of Object.entries(ctx.currentPositions)) {
    const symData = historicalData[symbol];
    if (!symData) continue;
    const candle1h = symData["1h"].find(c => c.timestamp === timestamp);
    if (!candle1h) continue;

    const slPrice = pos.entryPrice * (1 - pos.stopLossPct / 100);
    const tpPrice = pos.entryPrice * (1 + pos.takeProfitPct / 100);

    let exited = false;
    let exitPrice = 0;
    let reason: "Stop Loss" | "Take Profit" = "Stop Loss";

    if (candle1h.low <= slPrice) {
      exited = true; exitPrice = slPrice; reason = "Stop Loss";
    } else if (candle1h.high >= tpPrice) {
      exited = true; exitPrice = tpPrice; reason = "Take Profit";
    }

    if (exited) {
      const revenue = pos.size * exitPrice;
      const fee = revenue * config.feePct;
      ctx.cash += revenue - fee;

      const realizedPnL = pos.size * (exitPrice - pos.entryPrice) - fee;
      ctx.tradeCount++;
      if (realizedPnL > 0) ctx.wins++;

      ctx.trades.push({
        timestamp: new Date(timestamp), symbol, side: "sell",
        price: exitPrice, pnl: realizedPnL,
      });

      ctx.recentExits.push({ symbol, reason, timestamp });
      console.log(`[Backtest] ${symbol} auto-bracket: ${reason} at $${exitPrice.toFixed(2)} (PnL: $${realizedPnL.toFixed(2)})`);
      delete ctx.currentPositions[symbol];
    }
  }
}

/** Execute trades produced by the LLM decision engine for the current step. */
export async function executeStepTrades(
  ctx: BacktestContext,
  priceMap: Map<string, any>,
  timestamp: number,
  startEquity: number,
  initialEquity: number
): Promise<void> {
  const activePositionsList = Object.entries(ctx.currentPositions).map(([sym, pos]) => {
    const currentPrice = priceMap.get(sym)?.lastPrice ?? pos.entryPrice;
    return {
      symbol: sym, side: "long" as const, size: pos.size, entryPrice: pos.entryPrice,
      unrealizedPnL: pos.size * (currentPrice - pos.entryPrice),
      stopLossPct: pos.stopLossPct, takeProfitPct: pos.takeProfitPct,
    };
  });

  const multiResult = await evaluateMultiPair(priceMap, activePositionsList, undefined, ctx.recentExits);

  for (const [symbol, decision] of Object.entries(multiResult.decisions)) {
    const ticker = priceMap.get(symbol);
    const price = ticker?.lastPrice ?? 0;
    if (price <= 0) continue;

    // Populate decision size before validation, just like the live agent-engine
    if (decision.action === "sell") {
      const pos = ctx.currentPositions[symbol];
      if (pos) {
        const strengthFactor = Math.max(0.1, Math.min(1.0, Math.abs(decision.strength)));
        decision.size = pos.size * strengthFactor;
      } else {
        decision.size = price > 0 ? (startEquity * config.orderSizePct * Math.abs(decision.strength)) / price : 0;
      }
    } else if (decision.action === "buy" && price > 0) {
      const strengthFactor = Math.abs(decision.strength);
      const confidenceFactor = typeof decision.confidence === "number" ? Math.max(0, Math.min(1, decision.confidence)) : 1.0;
      decision.size = (startEquity * config.orderSizePct * strengthFactor * confidenceFactor) / price;
    }

    const sellTrades = ctx.trades.filter(t => t.side === "sell").length;
    const validation = riskManager.validateDecision(decision, {
      timestamp: new Date(timestamp), initialCash: initialEquity, cash: ctx.cash,
      equity: startEquity, positions: activePositionsList, totalTrades: ctx.tradeCount,
      winRate: sellTrades > 0 ? (ctx.wins / sellTrades) * 100 : 0,
      totalPnL: startEquity - initialEquity,
    } as any, ticker);

    if (!validation.isAllowed) continue;
    const finalDecision = validation.adjustedDecision ?? decision;

    if (finalDecision.action === "buy") {
      executeBuy(ctx, finalDecision, symbol, price, timestamp);
    } else if (finalDecision.action === "sell") {
      executeSell(ctx, finalDecision, symbol, price, timestamp);
    } else if (finalDecision.action === "modify_position") {
      const existing = ctx.currentPositions[symbol];
      if (existing) {
        const slPct = finalDecision.slPct ?? existing.stopLossPct;
        const tpPct = finalDecision.tpPct ?? existing.takeProfitPct;
        ctx.currentPositions[symbol] = {
          ...existing,
          stopLossPct: slPct,
          takeProfitPct: tpPct
        };
      }
    }
  }
}

function executeBuy(
  ctx: BacktestContext, d: TradingDecision, symbol: string, price: number, timestamp: number
): void {
  const lastExit = ctx.recentExits.find(e => e.symbol === symbol);
  if (lastExit) {
    const elapsed = timestamp - lastExit.timestamp;
    const cooldownMs = Number(process.env.RECENT_EXIT_COOLDOWN_MS) || 600_000;
    if (elapsed < cooldownMs) {
      console.log(`[Backtest] ${symbol}: skipping buy — cooldown (${Math.round(elapsed / 1000)}s)`);
      return;
    }
  }

  const size = d.size ?? 0;
  const cost = size * price;
  const fee = cost * config.feePct;
  const totalCost = cost + fee;

  if (totalCost <= 0 || totalCost > ctx.cash) return;

  ctx.cash -= totalCost;
  const existing = ctx.currentPositions[symbol];
  const slPct = d.slPct ?? (d.riskProfile === "tight" ? 3 : d.riskProfile === "wide" ? 8 : config.stopLossPct);
  const tpPct = d.tpPct ?? (d.riskProfile === "tight" ? 9 : d.riskProfile === "wide" ? 16 : config.takeProfitPct);
  const entryPriceWithFee = price * (1 + config.feePct);

  if (existing) {
    const newSize = existing.size + size;
    const newEntryPrice = (existing.entryPrice * existing.size + entryPriceWithFee * size) / newSize;
    ctx.currentPositions[symbol] = { size: newSize, entryPrice: newEntryPrice, stopLossPct: slPct, takeProfitPct: tpPct };
  } else {
    ctx.currentPositions[symbol] = { size, entryPrice: entryPriceWithFee, stopLossPct: slPct, takeProfitPct: tpPct };
  }

  ctx.tradeCount++;
  ctx.trades.push({ timestamp: new Date(timestamp), symbol, side: "buy", price });
}

function executeSell(
  ctx: BacktestContext, d: TradingDecision, symbol: string, price: number, timestamp: number
): void {
  const existing = ctx.currentPositions[symbol];
  if (!existing || existing.size <= 0) return;

  const size = Math.min(d.size ?? existing.size, existing.size);
  const revenue = size * price;
  const fee = revenue * config.feePct;
  ctx.cash += revenue - fee;

  const realizedPnL = size * (price - existing.entryPrice) - fee;
  ctx.tradeCount++;
  if (realizedPnL > 0) ctx.wins++;

  ctx.trades.push({ timestamp: new Date(timestamp), symbol, side: "sell", price, pnl: realizedPnL });

  if (existing.size - size <= 0.000001) {
    delete ctx.currentPositions[symbol];
  } else {
    ctx.currentPositions[symbol] = {
      size: existing.size - size, entryPrice: existing.entryPrice,
      stopLossPct: existing.stopLossPct, takeProfitPct: existing.takeProfitPct,
    };
  }
}
