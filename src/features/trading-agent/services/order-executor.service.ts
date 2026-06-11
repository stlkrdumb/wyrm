import type { AgentState } from "@/features/trading-agent/services/state-store";
import type { TickerData, TradingDecision, Position } from "@/features/trading-agent/types";
import { config, setTradeCounter, getTradeCounter, calculateWinRate } from "./state-store";
import { getLivePrice } from "./price-fetcher.service";
import { saveBalanceState } from "./balance-store";
import { RISK_PROFILES, type RiskProfile } from "../constants/risk.constants";
import { cancelPendingOrder } from "./pending-order.service";

function resolveSLTP(profile?: RiskProfile): { stopLossPct: number; takeProfitPct: number } {
  if (profile && RISK_PROFILES[profile]) {
    return { ...RISK_PROFILES[profile] };
  }
  return { stopLossPct: config.stopLossPct, takeProfitPct: config.takeProfitPct };
}

export async function flattenPositions(state: AgentState): Promise<{ closed: number; totalPnlRealized: number }> {
  const closedPositions: Position[] = [];
  let totalPnlRealized = 0;

  const uniqueSymbols = [...new Set(state.positions.map((p) => p.symbol))];
  const prices: Map<string, TickerData> = new Map();

  for (const symbol of uniqueSymbols) {
    const ticker = await getLivePrice(symbol);
    if (ticker && ticker.lastPrice > 0) prices.set(symbol, ticker);
  }

  if (prices.size === 0 && state.positions.length > 0) {
    console.warn("[Agent] Cannot flatten — no price data available, keeping positions");
    return { closed: 0, totalPnlRealized: 0 };
  }

  for (const pos of state.positions) {
    if (pos.size <= 0) continue;
    const ticker = prices.get(pos.symbol);
    const price = ticker?.lastPrice ?? state.ticker?.lastPrice ?? 0;
    if (price === 0) continue;

    const revenue = price * pos.size;
    const fee = revenue * config.feePct;
    const pnl = (price - pos.entryPrice) * pos.size - fee;

    const counter = getTradeCounter() + 1;
    setTradeCounter(counter);
    state.trades.push({
      id: `T${counter}`,
      timestamp: new Date(),
      symbol: pos.symbol,
      side: "sell",
      action: "exit",
      size: pos.size,
      price,
      pnl,
      fee,
    });
    totalPnlRealized += pnl;
    state.portfolio.cash += revenue - fee;
    closedPositions.push(pos);
  }

  state.portfolio.totalPnL += totalPnlRealized;
  const winRate = calculateWinRate(state.trades);
  state.portfolio = {
    ...state.portfolio,
    timestamp: new Date(),
    equity: state.portfolio.cash,
    totalPnL: state.portfolio.cash - state.startEquity,
    winRate,
  };

  saveBalanceState({
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: state.portfolio.cash,
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: [],
    pendingOrders: [],
    totalTrades: state.portfolio.totalTrades,
    winRate,
    circuitBreakerTripped: state.circuitBreakerTripped,
    circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
    peakEquity: state.peakEquity,
  });

  console.log(`[Agent] Flattened ${closedPositions.length} position(s)`);
  return { closed: closedPositions.length, totalPnlRealized };
}

export function executeTrades(
  state: AgentState,
  decisions: Record<string, TradingDecision>,
  priceMap: Map<string, TickerData>,
  displayTicker: TickerData
): void {
  let liquidBalance = state.portfolio.cash;

  const entries = Object.entries(decisions)
    .sort(([, a], [, b]) => Math.abs(b.strength) - Math.abs(a.strength));

  const uniqueSymbolsCount = new Set(state.positions.map((p) => p.symbol)).size;

  for (const [symbol, decision] of entries) {
    if (decision.action === "hold") continue;

    if (typeof priceMap.get(symbol) === "undefined") continue;
    const ticker = priceMap.get(symbol)!;

    if (decision.action === "buy" && uniqueSymbolsCount >= config.maxActivePositions) {
      console.log(`[Agent] ${symbol}: skipping buy — already at max open positions (${config.maxActivePositions})`);
      continue;
    }

    const totalEquity = liquidBalance + state.positions.reduce((s, p) => {
      const posPrice = priceMap.get(p.symbol)?.lastPrice ?? p.entryPrice;
      return s + (p.size * posPrice);
    }, 0);

    const strengthFactor = Math.abs(decision.strength);
    const allocationPct = config.orderSizePct * strengthFactor;
    const tradeSize = decision.size ?? ((totalEquity * allocationPct) / ticker.lastPrice);

    if (tradeSize <= 0 || ticker.lastPrice === 0) continue;

    // Handle limit orders — create pending order instead of executing immediately
    if (decision.orderType === "limit" && decision.limitPrice && decision.limitPrice > 0) {
      const sltp = resolveSLTP(decision.riskProfile);

      let reservedCash = 0;

      // For limit buys: reserve cash now
      if (decision.action === "buy") {
        const cost = ticker.lastPrice * tradeSize;
        const fee = cost * config.feePct;
        reservedCash = cost + fee;
        if (reservedCash > liquidBalance) {
          console.log(`[Agent] ${symbol}: skipping limit buy — insufficient funds for reservation`);
          continue;
        }
      }

      // For limit sells: verify position exists
      if (decision.action === "sell") {
        const posIdx = state.positions.findIndex(p => p.symbol === symbol);
        if (posIdx < 0) {
          console.log(`[Agent] ${symbol}: skipping limit sell — no position held`);
          continue;
        }
      }

      // Cancel any existing pending order for this symbol (replace with new)
      cancelPendingOrder(state, symbol);
      liquidBalance = state.portfolio.cash; // sync after cash return

      // Create new pending order
      state.pendingOrders.push({
        id: `LO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        symbol,
        side: decision.action,
        limitPrice: decision.limitPrice,
        size: tradeSize,
        reservedCash,
        createdAt: new Date(),
        ...sltp,
      });

      if (decision.action === "buy") {
        liquidBalance -= reservedCash;
        state.portfolio.cash -= reservedCash;
      }

      // Add to watchlist + subscribe WS
      if (!state.watchlist.includes(symbol)) {
        state.watchlist.push(symbol);
      }

      const limitMsg = `${symbol}: LIMIT ${decision.action.toUpperCase()} @ $${decision.limitPrice.toFixed(2)} (size: ${tradeSize.toFixed(4)})`;
      state.logs.push({ timestamp: new Date(), level: "action", message: limitMsg });
      console.log(`[Agent] ${limitMsg}`);
      state.portfolio.totalTrades++;
      continue;
    }

    // Cancel any existing pending order for this symbol before executing market order
    cancelPendingOrder(state, symbol);
    liquidBalance = state.portfolio.cash; // sync after cash return

    const idx = state.positions.findIndex((p) => p.symbol === symbol);
    const now = new Date();
    const tc = getTradeCounter() + 1;
    setTradeCounter(tc);

    if (decision.action === "buy") {
      const cost = ticker.lastPrice * tradeSize;
      const fee = cost * config.feePct;
      const totalCost = cost + fee;
      if (totalCost <= liquidBalance) {
        if (idx >= 0) {
          const p = state.positions[idx];
          state.positions[idx] = {
            ...p,
            size: p.size + tradeSize,
            entryPrice: (p.entryPrice * p.size + ticker.lastPrice * tradeSize * (1 + config.feePct)) / (p.size + tradeSize),
          };
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "buy", action: "add", size: tradeSize, price: ticker.lastPrice, fee });
        } else {
          const sltp = resolveSLTP(decision.riskProfile);
          state.positions.push({ symbol, side: "long", size: tradeSize, entryPrice: ticker.lastPrice * (1 + config.feePct), unrealizedPnL: 0, ...sltp });
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "buy", action: "entry", size: tradeSize, price: ticker.lastPrice, fee });
        }
        liquidBalance -= totalCost;
      } else {
        console.log(`[Agent] ${symbol}: skipping buy — insufficient funds (need $${totalCost.toFixed(2)}, have $${liquidBalance.toFixed(2)})`);
      }
    } else if (decision.action === "sell") {
      if (idx >= 0) {
        const pos = state.positions[idx];

        if (pos.size <= tradeSize) {
          const revenue = ticker.lastPrice * pos.size;
          const fee = revenue * config.feePct;
          const pnl = (ticker.lastPrice - pos.entryPrice) * pos.size - fee;
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "sell", action: "exit", size: pos.size, price: ticker.lastPrice, pnl, fee });
          state.portfolio.totalPnL += pnl;
          liquidBalance += revenue - fee;
          state.positions.splice(idx, 1);
        } else {
          const avgEntry = pos.entryPrice;
          const revenue = ticker.lastPrice * tradeSize;
          const fee = revenue * config.feePct;
          const pnl = (ticker.lastPrice - avgEntry) * tradeSize - fee;
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "sell", action: "reduce", size: tradeSize, price: ticker.lastPrice, pnl, fee });
          state.portfolio.totalPnL += pnl;
          liquidBalance += revenue - fee;
          state.positions[idx] = { ...state.positions[idx], size: pos.size - tradeSize };
        }
      } else {
        console.log(`[Agent] ${symbol}: skipping sell — no position to close`);
      }
    }

    state.portfolio.totalTrades++;
  }

  let totalPosVal = 0;
  for (const p of state.positions) {
    const symTicker = priceMap.get(p.symbol);
    const price = symTicker?.lastPrice ?? displayTicker?.lastPrice ?? p.entryPrice;
    totalPosVal += p.size * price;
  }
  const realEquity = liquidBalance + totalPosVal;
  const winRate = calculateWinRate(state.trades);
  state.portfolio = {
    ...state.portfolio,
    timestamp: new Date(),
    initialCash: config.initialCash,
    cash: liquidBalance,
    equity: realEquity,
    totalPnL: realEquity - state.startEquity,
    winRate,
  };

  const savedPositions = state.positions.map(p => ({ symbol: p.symbol, side: p.side as "long" | "short", size: p.size, entryPrice: p.entryPrice, stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct }));
  const savedPending = state.pendingOrders.map(o => ({ id: o.id, symbol: o.symbol, side: o.side, limitPrice: o.limitPrice, size: o.size, reservedCash: o.reservedCash, createdAt: o.createdAt.toISOString(), stopLossPct: o.stopLossPct, takeProfitPct: o.takeProfitPct }));
  saveBalanceState({
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: liquidBalance,
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: savedPositions,
    pendingOrders: savedPending,
    totalTrades: state.portfolio.totalTrades,
    winRate,
    circuitBreakerTripped: state.circuitBreakerTripped,
    circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
    peakEquity: state.peakEquity,
  });
}
