/**
 * Order Executor — executes buy/sell decisions against the live price feed.
 * Handles position sizing, SL/TP resolution, dust cleanup, and portfolio updates.
 */
import type { AgentState } from "./state-store";
import type { TickerData, TradingDecision } from "@/features/trading-agent/types";
import { config, setTradeCounter, getTradeCounter, calculateWinRate } from "./state-store";
import { saveBalanceState } from "./balance-store";
import { priceStore } from "./price-store";
import { resolveWsPrice, resolveSLTP } from "./orders/price-resolver";
import { metricsService } from "./metrics.service";
import { flattenPositions } from "./orders/flatten";

export { flattenPositions };

export function executeTrades(
  state: AgentState,
  decisions: Record<string, TradingDecision>,
  priceMap: Map<string, TickerData>
): void {
  let liquidBalance = state.portfolio.cash;
  const entries = Object.entries(decisions)
    .sort(([, a], [, b]) => Math.abs(b.strength) - Math.abs(a.strength));

  let livePositionCount = new Set(state.positions.map(p => p.symbol)).size;

  for (const [symbol, decision] of entries) {
    if (decision.action === "hold") continue;

    const ticker = priceMap.get(symbol);
    if (!ticker || ticker.lastPrice <= 0) {
      console.warn(`[Agent] ${symbol}: skipping ${decision.action} — no live price data`);
      continue;
    }

    // Buy: require fresh WS price. Sell: use unrealizedPnL directly.
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
      console.log(`[Agent] ${symbol}: skipping buy — max positions (${config.maxActivePositions})`);
      continue;
    }

    const strength = decision.strength;
    if (typeof strength !== "number" || !Number.isFinite(strength)) {
      console.warn(`[Agent] ${symbol}: skipping — invalid strength: ${strength}`);
      continue;
    }

    const totalEquity = liquidBalance + state.positions.reduce((s, p) => {
      return s + (p.size * (priceMap.get(p.symbol)?.lastPrice ?? p.entryPrice));
    }, 0);

    // ─── Sell handling ───
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
          metricsService.recordTrade("sell", pnl);
          liquidBalance += revenue - fee;
          state.positions.splice(idx, 1);
          if (state.recentExits) state.recentExits.set(symbol, { timestamp: Date.now(), reason: "Manual Close" });
          state.watchlist = state.watchlist.filter(s => s !== symbol);
          livePositionCount = new Set(state.positions.map(p => p.symbol)).size;
        } else {
          // Partial reduce
          const rawDesiredSize = decision.size || (pos.size / 2);
          const currentPrice = pos.entryPrice + (pos.unrealizedPnL / pos.size);
          const sellValue = rawDesiredSize * currentPrice;
          const posValue = pos.size * currentPrice;
          const remainingValue = (pos.size - rawDesiredSize) * currentPrice;

          if (sellValue >= posValue - 0.01 || remainingValue < 1.00) {
            // Dust — full exit
            const revenue = (pos.entryPrice * pos.size) + pos.unrealizedPnL;
            const fee = revenue * config.feePct;
            const pnl = pos.unrealizedPnL - fee;
            const avgPrice = pos.entryPrice + (pos.unrealizedPnL / pos.size);
            state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "sell", action: "exit", size: pos.size, price: avgPrice, pnl, fee });
            metricsService.recordTrade("sell", pnl);
            liquidBalance += revenue - fee;
            state.positions.splice(idx, 1);
            if (state.recentExits) state.recentExits.set(symbol, { timestamp: Date.now(), reason: "Dust Cleanup" });
            state.watchlist = state.watchlist.filter(s => s !== symbol);
            livePositionCount = new Set(state.positions.map(p => p.symbol)).size;
          } else {
            const reduceSize = rawDesiredSize;
            const pnlFraction = reduceSize / pos.size;
            const revenue = (pos.entryPrice * reduceSize) + (pos.unrealizedPnL * pnlFraction);
            const fee = revenue * config.feePct;
            const pnl = (pos.unrealizedPnL * pnlFraction) - fee;
            state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "sell", action: "reduce", size: reduceSize, price: pos.entryPrice + (pos.unrealizedPnL / pos.size), pnl, fee });
            metricsService.recordTrade("sell", pnl);
            liquidBalance += revenue - fee;
            state.positions[idx] = {
              ...state.positions[idx],
              size: pos.size - reduceSize,
              unrealizedPnL: pos.unrealizedPnL * (1 - pnlFraction),
            };
          }
        }
        state.portfolio.totalTrades++;
      } else {
        console.log(`[Agent] ${symbol}: skipping sell — no position`);
      }
      continue;
    }

    // ─── Buy path ───
    const strengthFactor = Math.abs(strength);
    const confidenceFactor = typeof decision.confidence === "number" ? Math.max(0, Math.min(1, decision.confidence)) : 1.0;
    const allocationPct = config.orderSizePct * strengthFactor * confidenceFactor;
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
        metricsService.recordTrade("buy");
      } else {
        const sltp = resolveSLTP(decision);
        state.positions.push({ symbol, side: "long", size: tradeSize, entryPrice: execPrice! * (1 + config.feePct), unrealizedPnL: 0, ...sltp });
        state.trades.push({ id: `T${tc}`, timestamp: now, symbol, side: "buy", action: "entry", size: tradeSize, price: execPrice!, fee });
        metricsService.recordTrade("buy");
        livePositionCount++;
      }
      liquidBalance -= totalCost;
    } else {
      console.log(`[Agent] ${symbol}: insufficient funds (need $${totalCost.toFixed(2)}, have $${liquidBalance.toFixed(2)})`);
    }

    state.portfolio.totalTrades++;
  }

  // ─── Dust cleanup ───
  const rawEquity = liquidBalance + state.positions.reduce((s, p) => {
    return s + (p.size * (priceMap.get(p.symbol)?.lastPrice ?? p.entryPrice));
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
        side: "sell", action: "exit", size: pos.size, price: px, pnl, fee,
      });
      metricsService.recordTrade("sell", pnl);

      if (state.recentExits) {
        state.recentExits.set(pos.symbol, { timestamp: Date.now(), reason: "Dust Cleanup" });
      }
      state.watchlist = state.watchlist.filter(s => s !== pos.symbol);

      liquidBalance += revenue - fee;
      state.positions.splice(i, 1);
      state.portfolio.totalTrades++;
      console.log(`[Dust] Closed ${pos.symbol} ($${posValue.toFixed(2)}) — below 1% threshold`);
    }
  }

  // Mark-to-market all remaining positions
  let totalPosVal = 0;
  for (const p of state.positions) {
    const symTicker = priceMap.get(p.symbol);
    totalPosVal += p.size * (symTicker?.lastPrice ?? p.entryPrice);
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

  saveBalanceState({
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: liquidBalance,
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: state.positions.map(p => ({
      symbol: p.symbol, side: p.side as "long" | "short", size: p.size,
      entryPrice: p.entryPrice, stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct,
    })),
    totalTrades: state.portfolio.totalTrades,
    winRate,
    circuitBreakerTripped: state.circuitBreakerTripped,
    circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
    peakEquity: state.peakEquity,
    tradeCounter: getTradeCounter(),
  });
}
