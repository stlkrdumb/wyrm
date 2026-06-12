import type { AgentState } from "@/features/trading-agent/services/state-store";
import type { TickerData, TradingDecision } from "@/features/trading-agent/types";
import { config, setTradeCounter, getTradeCounter, calculateWinRate } from "./state-store";
import { getLivePrice } from "./price-fetcher.service";
import { saveBalanceState } from "./balance-store";
import { priceStore } from "./price-store";
import { RISK_PROFILES } from "../constants/risk.constants";

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

function resolveSLTP(decision: TradingDecision): { stopLossPct: number; takeProfitPct: number } {
  // LLM_RISKPROFILE=true: LLM directly outputs slPct/tpPct — completely ignore RISK_PROFILES
  if (process.env.LLM_RISKPROFILE === "true" && decision.slPct !== undefined && decision.tpPct !== undefined) {
    return { stopLossPct: decision.slPct, takeProfitPct: decision.tpPct };
  }
  // Fallback chain: LLM-picked profile -> config defaults
  if (decision.riskProfile && RISK_PROFILES[decision.riskProfile]) {
    return { ...RISK_PROFILES[decision.riskProfile] };
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
    const now = new Date();
    state.trades.push({
      id: `T${counter}`,
      timestamp: now,
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

    // Buy: require fresh WS price. Sell: use position's unrealizedPnL directly — no price lookup needed.
    let execPrice: number | undefined;
    if (decision.action !== "sell") {
      const wsPrice = resolveWsPrice(symbol);
      if (!wsPrice) {
        console.warn(`[Agent] ${symbol}: skipping buy — no WS price data`);
        continue;
      }
      execPrice = wsPrice.price;
    }

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

    // ─── Sell handling — uses unrealizedPnL directly, no price lookup ───
    if (decision.action === "sell") {
      const idx = state.positions.findIndex(p => p.symbol === symbol);
      if (idx >= 0) {
        const pos = state.positions[idx];
        const now = new Date();
        const tc = getTradeCounter() + 1;
        setTradeCounter(tc);

        if (pos.size <= (decision.size || pos.size)) {
          // Full exit
          const revenue = pos.entryPrice * pos.size + pos.unrealizedPnL;
          const fee = revenue * config.feePct;
          const pnl = pos.unrealizedPnL - fee;
          const avgPrice = pos.entryPrice + (pos.unrealizedPnL / pos.size);
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "sell", action: "exit", size: pos.size, price: avgPrice, pnl, fee });
          liquidBalance += revenue - fee;
          state.positions.splice(idx, 1);
          livePositionCount = new Set(state.positions.map(p => p.symbol)).size;
        } else {
          // Partial reduce — compare in dollars using current position value
          const rawDesiredSize = decision.size || (pos.size / 2);
          const currentPrice = pos.entryPrice + (pos.unrealizedPnL / pos.size);
          const sellValue = rawDesiredSize * currentPrice;
          const posValue = pos.size * currentPrice;

          if (sellValue >= posValue - 0.01) {
            // Full exit — sell dollar covers the position
            const revenue = (pos.entryPrice * pos.size) + pos.unrealizedPnL;
            const fee = revenue * config.feePct;
            const pnl = pos.unrealizedPnL - fee;
            const avgPrice = pos.entryPrice + (pos.unrealizedPnL / pos.size);
            state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "sell", action: "exit", size: pos.size, price: avgPrice, pnl, fee });
            liquidBalance += revenue - fee;
            state.positions.splice(idx, 1);
            livePositionCount = new Set(state.positions.map(p => p.symbol)).size;
          } else {
            const reduceSize = Math.min(rawDesiredSize, pos.size - 0.0001);
            const pnlFraction = reduceSize / pos.size;
            const revenue = (pos.entryPrice * reduceSize) + (pos.unrealizedPnL * pnlFraction);
            const fee = revenue * config.feePct;
            const pnl = (pos.unrealizedPnL * pnlFraction) - fee;
            state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "sell", action: "reduce", size: reduceSize, price: pos.entryPrice + (pos.unrealizedPnL / pos.size), pnl, fee });
            liquidBalance += revenue - fee;
            state.positions[idx] = { ...state.positions[idx], size: pos.size - reduceSize };
          }
        }
        state.portfolio.totalTrades++;
      } else {
        console.log(`[Agent] ${symbol}: skipping sell — no position to close`);
      }
      continue;
    }

    // ─── Buy path — requires fresh WS price ───
    const strengthFactor = Math.abs(strength);
    const allocationPct = config.orderSizePct * strengthFactor;
    const tradeSize = decision.size ?? ((totalEquity * allocationPct) / execPrice!);

    if (!Number.isFinite(tradeSize) || tradeSize <= 0) continue;

    const idx = state.positions.findIndex(p => p.symbol === symbol);
    const now = new Date();
    const tc = getTradeCounter() + 1;
    setTradeCounter(tc);

    const cost = execPrice! * tradeSize;
    const fee = cost * config.feePct;
    const totalCost = cost + fee;
    if (totalCost <= liquidBalance) {
        if (idx >= 0) {
          const p = state.positions[idx];
          state.positions[idx] = {
            ...p,
            size: p.size + tradeSize,
            entryPrice: (p.entryPrice * p.size + execPrice! * tradeSize * (1 + config.feePct)) / (p.size + tradeSize),
          };
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "buy", action: "add", size: tradeSize, price: execPrice!, fee });
        } else {
          const sltp = resolveSLTP(decision);
          state.positions.push({ symbol, side: "long", size: tradeSize, entryPrice: execPrice! * (1 + config.feePct), unrealizedPnL: 0, ...sltp });
          state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "buy", action: "entry", size: tradeSize, price: execPrice!, fee });
          livePositionCount++;
        }
        liquidBalance -= totalCost;
      } else {
        console.log(`[Agent] ${symbol}: skipping buy — insufficient funds (need $${totalCost.toFixed(2)}, have $${liquidBalance.toFixed(2)})`);
      }

    state.portfolio.totalTrades++;
  }

  // ─── Dust cleanup: close positions worth less than 1% of portfolio equity ───
  const rawEquity = liquidBalance + state.positions.reduce((s, p) => {
    const px = priceMap.get(p.symbol)?.lastPrice ?? p.entryPrice;
    return s + (p.size * px);
  }, 0);
  const DUST_THRESHOLD = rawEquity * 0.01;
  for (let i = state.positions.length - 1; i >= 0; i--) {
    const pos = state.positions[i];
    const px = priceMap.get(pos.symbol)?.lastPrice ?? pos.entryPrice;
    const posValue = pos.size * px;

    if (posValue < DUST_THRESHOLD) {
      const revenue = (pos.entryPrice * pos.size) + (pos.unrealizedPnL || 0);
      const fee = revenue * config.feePct;
      const pnl = (pos.unrealizedPnL || 0) - fee;
      const tc = getTradeCounter() + 1;
      setTradeCounter(tc);

      state.trades.push({
        id: `T${tc}`, timestamp: new Date(), symbol: pos.symbol,
        side: "sell", action: "exit", size: pos.size,
        price: px, pnl, fee,
      });

      // Notify the LLM via recentExits so it knows this symbol is closed
      if (state.recentExits) {
        state.recentExits.set(pos.symbol, { timestamp: Date.now(), reason: "Dust Cleanup" });
      }

      liquidBalance += revenue - fee;
      state.positions.splice(i, 1);
      state.portfolio.totalTrades++;
      console.log(`[Dust] Closed ${pos.symbol} ($${posValue.toFixed(2)}) — below 1% threshold ($${DUST_THRESHOLD.toFixed(2)})`);
    }
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
