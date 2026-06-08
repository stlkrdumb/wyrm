import type { TickerData, TradingDecision, Signal, Position, Trade, PortfolioSnapshot } from "../types";
import { marketWS } from "./market-ws.service";
import { getTickerPrice } from "./market-data.service";
import { saveBalanceState } from "./balance-store";

export interface AgentState {
  status: "running" | "stopped" | "paused";
  lastCycleAt: Date | null;
  ticker: TickerData | null;
  decision: TradingDecision | null;
  executionReason: string;
  signals: Signal[];
  portfolio: PortfolioSnapshot;
  positions: Position[];
  trades: Trade[];
  startEquity: number;
}

export const config = {
  get initialCash(): number {
    return Number(process.env.SIM_INITIAL_CASH) || 1000;
  },
  tradingSymbols: (process.env.TRADING_SYMBOLS || "BTCUSDT").split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
  maxActivePositions: Number(process.env.MAX_ACTIVE_POSITIONS) || 3,
};

let tradeCounter = 0;

export function getTradeCounter(): number {
  return tradeCounter;
}

export function setTradeCounter(val: number): void {
  tradeCounter = val;
}

/** Get latest price for a symbol (WS-backed with REST fallback) */
export async function getLivePrice(symbol: string): Promise<TickerData | null> {
  const cached = marketWS.getPriceStore().getCached(symbol);

  if (cached && !marketWS.getPriceStore().isStale(symbol, 60_000)) {
    return {
      symbol: cached.symbol,
      lastPrice: cached.lastPrice,
      high24h: cached.high24h,
      low24h: cached.low24h,
      volume24h: cached.quoteVolume,
      change24hPercent: cached.changePercent,
      timestamp: cached.updatedAt,
    };
  }

  try {
    const ticker = await getTickerPrice(symbol);
    console.log(`[Agent] REST fallback for ${symbol}: $${ticker.lastPrice}`);
    return ticker;
  } catch (err) {
    console.warn(`[Agent] REST fetch failed for ${symbol}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Close all open positions at current market price (used when agent stops) */
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

    const pnl = (price - pos.entryPrice) * pos.size;
    tradeCounter++;
    state.trades.push({
      id: `T${tradeCounter}`,
      timestamp: new Date(),
      symbol: pos.symbol,
      side: "sell",
      action: "exit",
      size: pos.size,
      price,
      pnl,
    });
    totalPnlRealized += pnl;
    state.portfolio.cash += price * pos.size;
    closedPositions.push(pos);
  }

  state.portfolio.totalPnL += totalPnlRealized;
  state.portfolio.totalTrades += closedPositions.length;

  const closedCount = state.positions.length;
  state.positions = [];

  const realEquity = state.portfolio.cash;
  state.portfolio = {
    ...state.portfolio,
    timestamp: new Date(),
    equity: realEquity,
    positions: [],
    totalPnL: realEquity - state.startEquity,
  };

  saveBalanceState({
    initialCash: config.initialCash,
    startCash: realEquity,
    cash: state.portfolio.cash,
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: [],
    totalTrades: state.portfolio.totalTrades,
    winRate: state.portfolio.winRate,
  });

  console.log(`[Agent] Flattened ${closedCount} position(s) across ${uniqueSymbols.length} symbol(s) — realized PnL: ${totalPnlRealized >= 0 ? "+" : ""}$${totalPnlRealized.toLocaleString()}`);

  return { closed: closedCount, totalPnlRealized };
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

    const ticker = priceMap.get(symbol);
    if (!ticker) continue;

    if (decision.action === "buy" && uniqueSymbolsCount >= config.maxActivePositions) {
      console.log(`[Agent] ${symbol}: skipping buy — already at max open positions (${config.maxActivePositions})`);
      continue;
    }

    const totalEquity = liquidBalance + state.positions.reduce((s, p) => s + p.size * ticker.lastPrice, 0);
    const tradeSize = Math.min(1, (totalEquity * 0.05) / ticker.lastPrice);

    if (tradeSize <= 0 || ticker.lastPrice === 0) continue;

    const idx = state.positions.findIndex((p) => p.symbol === symbol);
    const now = new Date();
    tradeCounter++;

    if (decision.action === "buy") {
      const cost = ticker.lastPrice * tradeSize;
      if (cost <= liquidBalance) {
        if (idx >= 0) {
          const p = state.positions[idx];
          state.positions[idx] = {
            ...p,
            size: p.size + tradeSize,
            entryPrice: (p.entryPrice * p.size + ticker.lastPrice * tradeSize) / (p.size + tradeSize),
          };
          state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "buy", action: "add", size: tradeSize, price: ticker.lastPrice });
        } else {
          state.positions.push({ symbol, side: "long", size: tradeSize, entryPrice: ticker.lastPrice, unrealizedPnL: 0 });
          state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "buy", action: "entry", size: tradeSize, price: ticker.lastPrice });
        }
        liquidBalance -= cost;
      } else {
        console.log(`[Agent] ${symbol}: skipping buy — insufficient funds (need $${cost.toFixed(2)}, have $${liquidBalance.toFixed(2)})`);
      }
    } else if (decision.action === "sell") {
      if (idx >= 0) {
        const pos = state.positions[idx];

        if (pos.size <= tradeSize) {
          const pnl = (ticker.lastPrice - pos.entryPrice) * pos.size;
          state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "sell", action: "exit", size: pos.size, price: ticker.lastPrice, pnl });
          state.portfolio.totalPnL += pnl;
          liquidBalance += ticker.lastPrice * pos.size;
          state.positions.splice(idx, 1);
        } else {
          const avgEntry = pos.entryPrice;
          const pnl = (ticker.lastPrice - avgEntry) * tradeSize;
          state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "sell", action: "reduce", size: tradeSize, price: ticker.lastPrice, pnl });
          state.portfolio.totalPnL += pnl;
          liquidBalance += ticker.lastPrice * tradeSize;
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
  state.portfolio = {
    ...state.portfolio,
    timestamp: new Date(),
    initialCash: config.initialCash,
    cash: liquidBalance,
    equity: realEquity,
    positions: [...state.positions],
    totalPnL: realEquity - state.startEquity,
  };

  const savedPositions = state.positions.map(p => ({ symbol: p.symbol, side: p.side as "long" | "short", size: p.size, entryPrice: p.entryPrice }));
  saveBalanceState({
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: liquidBalance,
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: savedPositions,
    totalTrades: state.portfolio.totalTrades,
    winRate: state.portfolio.winRate,
  });
}
