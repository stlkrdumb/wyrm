import type { AgentState } from "@/features/trading-agent/services/state-store";
import type { TickerData, TradingDecision } from "@/features/trading-agent/types";
import { config, setTradeCounter, getTradeCounter, calculateWinRate } from "./state-store";
import { getLivePrice } from "./price-fetcher.service";
import { saveBalanceState } from "./balance-store";
import { priceStore } from "./price-store";
import { RISK_PROFILES, type RiskProfile } from "../constants/risk.constants";

/** Resolve the trade execution price from the WS cache ONLY — never REST.
 *  Trade prices are the source of truth and must be real-time from the live feed.
 *  REST snapshots are fine for LLM analysis / TA context, but never for execution.
 *  Returns null when no fresh WS data is available — caller should skip the trade. */
function resolveWsPrice(symbol: string): { price: number } | null {
  const cached = priceStore.getCached(symbol);
  if (cached && !priceStore.isStale(symbol, 60_000) && cached.lastPrice > 0) {
    return { price: cached.lastPrice };
  }
  return null;
}

function resolveSLTP(profile?: RiskProfile): { stopLossPct: number; takeProfitPct: number } {
  if (profile && RISK_PROFILES[profile]) {
    return { ...RISK_PROFILES[profile] };
  }
  return { stopLossPct: config.stopLossPct, takeProfitPct: config.takeProfitPct };
}

export async function flattenPositions(state: AgentState): Promise<{ closed: number; totalPnlRealized: number }> {
  const positionsToClose = state.positions.filter(p => p.size > 0);
  if (positionsToClose.length === 0) {
    return { closed: 0, totalPnlRealized: 0 };
  }

  const uniqueSymbols = [...new Set(positionsToClose.map(p => p.symbol))];
  const prices: Map<string, TickerData> = new Map();

  for (const symbol of uniqueSymbols) {
    try {
      const ticker = await getLivePrice(symbol);
      if (ticker && ticker.lastPrice > 0) prices.set(symbol, ticker);
    } catch (err) {
      console.warn(`[Agent] Could not fetch ${symbol} for flatten:`, err instanceof Error ? err.message : String(err));
    }
  }

  if (prices.size === 0) {
    console.warn("[Agent] Cannot flatten — no price data available, keeping positions");
    return { closed: 0, totalPnlRealized: 0 };
  }

  let totalPnlRealized = 0;
  let closedCount = 0;
  const closedSymbols = new Set<string>();
  const skippedCount = positionsToClose.length - positionsToClose.filter(p => prices.has(p.symbol)).length;

  for (const pos of positionsToClose) {
    const ticker = prices.get(pos.symbol);
    if (!ticker) {
      console.warn(`[Agent] Flatten: skipping ${pos.symbol} — no price data, will remain in positions`);
      continue;
    }

    const price = ticker.lastPrice;
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
    closedCount++;
    closedSymbols.add(pos.symbol);
  }

  // Remove closed positions from state
  state.positions = state.positions.filter(p => !closedSymbols.has(p.symbol));

  // Mark-to-market remaining open positions so equity isn't just cash
  let remainingPosVal = 0;
  for (const p of state.positions) {
    const symTicker = prices.get(p.symbol);
    const px = symTicker?.lastPrice ?? p.entryPrice;
    remainingPosVal += p.size * px;
  }

  state.portfolio = {
    ...state.portfolio,
    timestamp: new Date(),
    cash: state.portfolio.cash,
    equity: state.portfolio.cash + remainingPosVal,
    totalPnL: state.portfolio.cash + remainingPosVal - state.startEquity,
    winRate: calculateWinRate(state.trades),
  };

  if (state.peakEquity < state.portfolio.equity) state.peakEquity = state.portfolio.equity;

  saveBalanceState({
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: state.portfolio.cash,
    accumulatedRealizedPnL: totalPnlRealized,
    positions: state.positions.map(p => ({ symbol: p.symbol, side: p.side as "long" | "short", size: p.size, entryPrice: p.entryPrice, stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct })),
    totalTrades: state.portfolio.totalTrades,
    winRate: state.portfolio.winRate,
    circuitBreakerTripped: state.circuitBreakerTripped,
    circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
    peakEquity: state.peakEquity,
    tradeCounter: getTradeCounter(),
  });

  console.log(`[Agent] Flattened ${closedCount}/${positionsToClose.length} position(s) — realized $${totalPnlRealized.toFixed(2)}${skippedCount > 0 ? ` (${skippedCount} skipped — no price)` : ""}`);
  return { closed: closedCount, totalPnlRealized };
}

export function executeTrades(
  state: AgentState,
  decisions: Record<string, TradingDecision>,
  priceMap: Map<string, TickerData>
): void {
  let liquidBalance = state.portfolio.cash;

  const entries = Object.entries(decisions)
    .sort(([, a], [, b]) => Math.abs(b.strength) - Math.abs(a.strength));

  // Local counter — incremented on each new buy, decremented when an existing position is fully sold
  let livePositionCount = new Set(state.positions.map(p => p.symbol)).size;

  for (const [symbol, decision] of entries) {
    if (decision.action === "hold") continue;

    const ticker = priceMap.get(symbol);
    if (!ticker || ticker.lastPrice <= 0) {
      console.warn(`[Agent] ${symbol}: skipping ${decision.action} — no live price data`);
      continue;
    }

    // Trade execution price MUST come from the WS feed — never REST. If no fresh WS
    // data is available (cold cache, stale, or WS disconnected), skip the trade.
    const wsPrice = resolveWsPrice(symbol);
    if (!wsPrice) {
      console.warn(`[Agent] ${symbol}: skipping ${decision.action} — no WS price data, won't fall back to REST`);
      continue;
    }
    const execPrice = wsPrice.price;

    if (decision.action === "buy" && livePositionCount >= config.maxActivePositions) {
      console.log(`[Agent] ${symbol}: skipping buy — already at max open positions (${config.maxActivePositions})`);
      continue;
    }

    // Validate decision.strength to prevent NaN propagation
    const strength = decision.strength;
    if (typeof strength !== "number" || !Number.isFinite(strength)) {
      console.warn(`[Agent] ${symbol}: skipping — invalid strength value: ${strength}`);
      continue;
    }

    // Compute current equity from positions in priceMap (fallback to entry price if missing)
    const totalEquity = liquidBalance + state.positions.reduce((s, p) => {
      const posPrice = priceMap.get(p.symbol)?.lastPrice ?? p.entryPrice;
      return s + (p.size * posPrice);
    }, 0);

    const strengthFactor = Math.abs(strength);
    const allocationPct = config.orderSizePct * strengthFactor;
    const tradeSize = decision.size ?? ((totalEquity * allocationPct) / execPrice);

    if (!Number.isFinite(tradeSize) || tradeSize <= 0) continue;

    const idx = state.positions.findIndex(p => p.symbol === symbol);
    const now = new Date();
    const tc = getTradeCounter() + 1;
    setTradeCounter(tc);

    if (decision.action === "buy") {
      const cost = execPrice * tradeSize;
      const fee = cost * config.feePct;
      const totalCost = cost + fee;
      if (totalCost <= liquidBalance) {
        if (idx >= 0) {
          const p = state.positions[idx];
          state.positions[idx] = {
            ...p,
            size: p.size + tradeSize,
            entryPrice: (p.entryPrice * p.size + execPrice * tradeSize * (1 + config.feePct)) / (p.size + tradeSize),
          };
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "buy", action: "add", size: tradeSize, price: execPrice, fee });
        } else {
          const sltp = resolveSLTP(decision.riskProfile);
          state.positions.push({ symbol, side: "long", size: tradeSize, entryPrice: execPrice * (1 + config.feePct), unrealizedPnL: 0, ...sltp });
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "buy", action: "entry", size: tradeSize, price: execPrice, fee });
          livePositionCount++;
        }
        liquidBalance -= totalCost;
      } else {
        console.log(`[Agent] ${symbol}: skipping buy — insufficient funds (need $${totalCost.toFixed(2)}, have $${liquidBalance.toFixed(2)})`);
      }
    } else if (decision.action === "sell") {
      if (idx >= 0) {
        const pos = state.positions[idx];

        if (pos.size <= tradeSize) {
          const revenue = execPrice * pos.size;
          const fee = revenue * config.feePct;
          const pnl = (execPrice - pos.entryPrice) * pos.size - fee;
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "sell", action: "exit", size: pos.size, price: execPrice, pnl, fee });
          liquidBalance += revenue - fee;
          state.positions.splice(idx, 1);
          livePositionCount = new Set(state.positions.map(p => p.symbol)).size;
        } else {
          const avgEntry = pos.entryPrice;
          const revenue = execPrice * tradeSize;
          const fee = revenue * config.feePct;
          const pnl = (execPrice - avgEntry) * tradeSize - fee;
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "sell", action: "reduce", size: tradeSize, price: execPrice, pnl, fee });
          liquidBalance += revenue - fee;
          state.positions[idx] = { ...state.positions[idx], size: pos.size - tradeSize };
        }
      } else {
        console.log(`[Agent] ${symbol}: skipping sell — no position to close`);
      }
    }

    state.portfolio.totalTrades++;
  }

  // Mark-to-market all remaining positions
  let totalPosVal = 0;
  for (const p of state.positions) {
    const symTicker = priceMap.get(p.symbol);
    // Use entry price as fallback — never use displayTicker's price (it may be a different symbol)
    const price = symTicker?.lastPrice ?? p.entryPrice;
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

  if (state.peakEquity < state.portfolio.equity) state.peakEquity = state.portfolio.equity;

  const savedPositions = state.positions.map(p => ({ symbol: p.symbol, side: p.side as "long" | "short", size: p.size, entryPrice: p.entryPrice, stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct }));
  saveBalanceState({
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: liquidBalance,
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: savedPositions,
    totalTrades: state.portfolio.totalTrades,
    winRate,
    circuitBreakerTripped: state.circuitBreakerTripped,
    circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
    peakEquity: state.peakEquity,
    tradeCounter: getTradeCounter(),
  });
}
