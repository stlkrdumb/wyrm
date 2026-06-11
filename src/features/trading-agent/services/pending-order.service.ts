import type { AgentState } from "./state-store";
import { config, setTradeCounter, getTradeCounter } from "./state-store";

function pushEvent(state: AgentState, level: "info" | "action" | "warning" | "error", message: string): void {
  state.logs.push({ timestamp: new Date(), level, message });
  if (state.logs.length > 100) state.logs = state.logs.slice(-100);
}

/** Called on every WebSocket tick — checks if any pending limit orders should be filled */
export function checkPendingOrders(state: AgentState, symbol: string, currentPrice: number): void {
  const orderIdx = state.pendingOrders.findIndex(o => o.symbol === symbol);
  if (orderIdx < 0) return;

  const order = state.pendingOrders[orderIdx];
  let shouldFill = false;

  if (order.side === "buy" && currentPrice <= order.limitPrice) {
    shouldFill = true;
  } else if (order.side === "sell" && currentPrice >= order.limitPrice) {
    shouldFill = true;
  }

  if (!shouldFill) return;

  fillOrder(state, orderIdx, order, currentPrice);
}

/** Execute a filled limit order */
function fillOrder(state: AgentState, orderIdx: number, order: typeof state.pendingOrders[0], fillPrice: number): void {
  state.pendingOrders.splice(orderIdx, 1);

  const tc = getTradeCounter() + 1;
  setTradeCounter(tc);
  const now = new Date();

  if (order.side === "buy") {
    const cost = fillPrice * order.size;
    const fee = cost * config.feePct;
    const totalCost = cost + fee;

    if (totalCost > state.portfolio.cash) {
      pushEvent(state, "warning", `${order.symbol}: LIMIT BUY filled @ $${fillPrice.toFixed(2)} but insufficient cash — cancelled`);
      return;
    }

    const idx = state.positions.findIndex(p => p.symbol === order.symbol);
    if (idx >= 0) {
      const p = state.positions[idx];
      state.positions[idx] = {
        ...p,
        size: p.size + order.size,
        entryPrice: (p.entryPrice * p.size + fillPrice * order.size * (1 + config.feePct)) / (p.size + order.size),
      };
    } else {
      state.positions.push({
        symbol: order.symbol,
        side: "long",
        size: order.size,
        entryPrice: fillPrice * (1 + config.feePct),
        unrealizedPnL: 0,
        stopLossPct: order.stopLossPct,
        takeProfitPct: order.takeProfitPct,
      });
    }

    const trueCost = order.size * order.limitPrice * (1 + config.feePct);
    const surplus = Math.min(order.reservedCash, trueCost) - totalCost;
    state.portfolio.cash += surplus;
    state.trades.push({ id: `T${tc}`, timestamp: now, symbol: order.symbol, side: "buy", action: idx >= 0 ? "add" : "entry", size: order.size, price: fillPrice, fee });

    pushEvent(state, "action", `${order.symbol}: LIMIT BUY filled @ $${fillPrice.toFixed(2)}`);
    console.log(`[PendingOrder] ${order.symbol}: LIMIT BUY filled @ $${fillPrice.toFixed(2)} (limit: $${order.limitPrice.toFixed(2)})`);

    if (!state.watchlist.includes(order.symbol)) {
      state.watchlist.push(order.symbol);
    }
  } else {
    const idx = state.positions.findIndex(p => p.symbol === order.symbol);
    if (idx < 0) {
      pushEvent(state, "warning", `${order.symbol}: LIMIT SELL filled @ $${fillPrice.toFixed(2)} but no position held — cancelled`);
      return;
    }

    const pos = state.positions[idx];
    const revenue = fillPrice * order.size;
    const fee = revenue * config.feePct;
    const pnl = (fillPrice - pos.entryPrice) * order.size - fee;

    if (order.size >= pos.size) {
      state.positions.splice(idx, 1);
      state.watchlist = state.watchlist.filter(s => s !== order.symbol);
      state.trades.push({ id: `T${tc}`, timestamp: now, symbol: order.symbol, side: "sell", action: "exit", size: pos.size, price: fillPrice, pnl, fee });
    } else {
      state.positions[idx] = { ...pos, size: pos.size - order.size };
      state.trades.push({ id: `T${tc}`, timestamp: now, symbol: order.symbol, side: "sell", action: "reduce", size: order.size, price: fillPrice, pnl, fee });
    }

    state.portfolio.cash += revenue - fee;
    state.portfolio.totalPnL += pnl;

    pushEvent(state, "action", `${order.symbol}: LIMIT SELL filled @ $${fillPrice.toFixed(2)} — PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
    console.log(`[PendingOrder] ${order.symbol}: LIMIT SELL filled @ $${fillPrice.toFixed(2)} (limit: $${order.limitPrice.toFixed(2)}) — PnL: $${pnl.toFixed(2)}`);
  }

  state.portfolio.totalTrades++;
}

/** Cancel a specific pending order and unreserve cash if it was a buy */
export function cancelPendingOrder(state: AgentState, symbol: string): void {
  const idx = state.pendingOrders.findIndex(o => o.symbol === symbol);
  if (idx < 0) return;

  const order = state.pendingOrders[idx];

  // Return reserved cash for buy orders
  if (order.side === "buy" && order.reservedCash > 0) {
    state.portfolio.cash += order.reservedCash;
  }

  state.pendingOrders.splice(idx, 1);

  pushEvent(state, "info", `${symbol}: LIMIT ${order.side.toUpperCase()} @ $${order.limitPrice.toFixed(2)} cancelled — cash unreserved`);
  console.log(`[PendingOrder] ${symbol}: ${order.side.toUpperCase()} limit @ $${order.limitPrice.toFixed(2)} cancelled`);
}

/** Cancel all pending orders (called on agent stop/pause) */
export function cancelAllPendingOrders(state: AgentState): void {
  if (state.pendingOrders.length === 0) return;
  const count = state.pendingOrders.length;
  state.pendingOrders = [];
  pushEvent(state, "warning", `${count} pending limit order(s) cancelled — agent stopped`);
  console.log(`[PendingOrder] Cancelling ${count} pending limit orders...`);
}
