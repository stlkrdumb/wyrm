import type { Signal, TickerData, TradingDecision, PortfolioSnapshot, Position, Trade } from "../types";
import {
  loadBalanceState,
  saveBalanceState,
  resetBalanceState,
  type PortfolioState as SavedPortfolioState,
} from "./balance-store";
import { marketWS, type WSSubscription } from "./market-ws.service";
import { priceStore } from "./price-store";
import { getTickerPrice } from "./market-data.service";
import { evaluateSignals, evaluateMultiPair, type MultiPairResult } from "./decision-engine.service";

interface AgentState {
  status: "running" | "stopped" | "paused";
  lastCycleAt: Date | null;
  ticker: TickerData | null;
  decision: TradingDecision | null;
  executionReason: string;
  signals: Signal[];
  portfolio: PortfolioSnapshot;
  positions: Position[];
  trades: Trade[];
  startEquity: number; // equity baseline for correct PnL across restarts
}

export const config = {
  get initialCash(): number {
    return Number(process.env.SIM_INITIAL_CASH) || 1000;
  },
  tradingSymbols: (process.env.TRADING_SYMBOLS || "BTCUSDT").split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
  maxActivePositions: Number(process.env.MAX_ACTIVE_POSITIONS) || 3,
};

let tradeCounter = 0;

/** Initialize WebSocket subscriptions on startup */
async function initWebSocketSubscriptions(): Promise<void> {
  const subscriptions: WSSubscription[] = config.tradingSymbols.map((symbol) => ({
    instType: "SPOT",
    channel: "ticker",
    instId: symbol,
  }));

  try {
    await marketWS.subscribe(subscriptions);
    console.log(`[Agent] WebSocket initialized for ${config.tradingSymbols.length} symbol(s):`, config.tradingSymbols.join(", "));
  } catch (err) {
    console.warn(`[Agent] WS init failed (will fall back to REST):`, err instanceof Error ? err.message : String(err));
  }
}

/** Build initial state — prefer saved balance over fresh default */
function buildInitialState(): AgentState {
  const saved = loadBalanceState();

  let cash: number;
  let realizedPnL = 0;
  // Always start with no open positions — stale positions from crash should not persist
  let positions: Position[] = [];

  if (saved) {
    cash = saved.cash;
    realizedPnL = saved.accumulatedRealizedPnL;
  } else {
    cash = config.initialCash;
  }

  // Track the equity baseline for correct PnL calculation across sessions
  const startEquity = saved?.startCash ?? saved?.cash ?? config.initialCash;

  return {
    status: "stopped",
    lastCycleAt: null,
    ticker: null,
    decision: null,
    executionReason: "",
    signals: [],
    positions,
    trades: [],
    portfolio: {
      timestamp: new Date(),
      initialCash: config.initialCash,
      cash,
      equity: cash,
      positions: [],
      totalTrades: saved?.totalTrades || 0,
      winRate: saved?.winRate || 0,
      totalPnL: Math.round(realizedPnL), // accurate from saved state
    },
    startEquity: startEquity, // baseline for session PnL across restarts
  };
}

let state: AgentState = buildInitialState();

let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureInterval() {
  if (intervalId) return;
  console.log("[Agent] Timer started — running cycle every 3 seconds");
  intervalId = setInterval(() => {
    if (state.status === "running") {
      runAgentCycle();
    } else {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      console.log("[Agent] Timer stopped, status:", state.status);
    }
  }, 3000);
}

function stopInterval() {
  if (intervalId) { if (intervalId) clearInterval(intervalId); intervalId = null; }
  console.log("[Agent] Timer manually stopped");
}

/** Close all open positions at current market price (used when agent stops) */
export async function flattenPositions(): Promise<{ closed: number; totalPnlRealized: number }> {
  const closedPositions: Position[] = [];
  let totalPnlRealized = 0;

  // Fetch prices for all open positions (WS-backed with REST fallback)
  const prices: Map<string, TickerData> = new Map();
  const uniqueSymbols = [...new Set(state.positions.map((p) => p.symbol))];

  for (const symbol of uniqueSymbols) {
    const ticker = await getLivePrice(symbol);
    if (ticker && ticker.lastPrice > 0) prices.set(symbol, ticker);
  }

  // Check we have at least one price
  if (prices.size === 0 && state.positions.length > 0) {
    console.warn("[Agent] Cannot flatten — no price data available, keeping positions");
    return { closed: 0, totalPnlRealized: 0 };
  }

  for (const pos of state.positions) {
    if (pos.size <= 0) continue;
    const ticker = prices.get(pos.symbol);
    const price = ticker?.lastPrice ?? state.ticker?.lastPrice ?? 0;
    if (price === 0) continue;

    const pnl = Math.round((price - pos.entryPrice) * pos.size);
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
    state.portfolio.cash += price * pos.size; // return capital from sale
    closedPositions.push(pos);
  }

  // Update portfolio PnL
  state.portfolio.totalPnL += totalPnlRealized;
  state.portfolio.totalTrades += closedPositions.length;

  // Clear all positions
  const closedCount = state.positions.length;
  state.positions = [];

  const realEquity = state.portfolio.cash; // no open positions, equity = cash
  state.portfolio = { ...state.portfolio, timestamp: new Date(), equity: realEquity, positions: [], totalPnL: realEquity - state.startEquity };

  // Persist — flattened balance is now the new running balance
  saveBalanceState({
    initialCash: config.initialCash,
    startCash: Math.round(realEquity), // update baseline after flatten
    cash: Math.round(state.portfolio.cash),
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: [],
    totalTrades: state.portfolio.totalTrades,
    winRate: state.portfolio.winRate,
  });

  console.log(`[Agent] Flattened ${closedCount} position(s) across ${uniqueSymbols.length} symbol(s) — realized PnL: ${totalPnlRealized >= 0 ? "+" : ""}$${totalPnlRealized.toLocaleString()}`);

  return { closed: closedCount, totalPnlRealized };
}

export async function evaluateDecision(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  return await evaluateSignals(ticker);
}

/** Helper: get latest price for a symbol (WS-backed with REST fallback) */
async function getLivePrice(symbol: string): Promise<TickerData | null> {
  // Try PriceStore first (WS-backed)
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

  // Fallback to REST
  try {
    const ticker = await getTickerPrice(symbol);
    console.log(`[Agent] REST fallback for ${symbol}: $${ticker.lastPrice}`);
    return ticker;
  } catch (err) {
    console.warn(`[Agent] REST fetch failed for ${symbol}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Helper: check how many unique symbols are currently in open positions */
function countUniqueSymbols(): number {
  const unique = new Set(state.positions.map((p) => p.symbol));
  return unique.size;
}

export async function runAgentCycle(): Promise<{ decision: TradingDecision; signals: Signal[]; tickerPrice: number }> {
  // Abort immediately if agent was stopped while cycle was in-flight
  if (state.status !== "running") return { decision: null as any, signals: [], tickerPrice: 0 };

  const symbols = config.tradingSymbols;

  // 1. Fetch prices for ALL active symbols (WS-backed with REST fallback)
  const priceMap = new Map<string, TickerData>();
  for (const symbol of symbols) {
    const ticker = await getLivePrice(symbol);
    if (ticker) priceMap.set(symbol, ticker);
  }

  // If we got no prices at all, abort
  if (priceMap.size === 0) {
    console.warn("[Agent] No price data available — skipping cycle");
    return { decision: null as any, signals: [], tickerPrice: 0 };
  }

  // Use BTCUSDT as the primary display ticker
  const displayTicker = priceMap.get("BTCUSDT") ?? priceMap.values().next().value!;
  state.ticker = displayTicker;
  state.lastCycleAt = new Date();

  // Log prices for all symbols
  for (const [symbol, ticker] of priceMap) {
    console.log(`[Agent] ${symbol}: $${ticker.lastPrice.toLocaleString()} (${ticker.change24hPercent > 0 ? "+" : ""}${ticker.change24hPercent}% 24h)`);
  }

  // 2. Multi-pair LLM analysis
  const multiResult: MultiPairResult = await evaluateMultiPair(priceMap);
  state.decision = Object.values(multiResult.decisions).sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))[0] ?? { action: "hold", strength: 0, confidence: 0, reason: "" };
  state.signals = multiResult.allSignals;

  // 3. Execute trades — process decisions sorted by conviction strength
  let liquidBalance = state.portfolio.cash;

  // Sort decisions by absolute strength (highest conviction first)
  const entries = Object.entries(multiResult.decisions)
    .sort(([, a], [, b]) => Math.abs(b.strength) - Math.abs(a.strength));

  for (const [symbol, decision] of entries) {
    if (decision.action === "hold") continue;

    const ticker = priceMap.get(symbol);
    if (!ticker) continue;

    // Skip if symbol is already at max position count and this is a buy
    if (decision.action === "buy" && countUniqueSymbols() >= config.maxActivePositions) {
      console.log(`[Agent] ${symbol}: skipping buy — already at max open positions (${config.maxActivePositions})`);
      continue;
    }

    // Trade size: 5% of total equity per trade
    const totalEquity = liquidBalance + state.positions.reduce((s, p) => s + p.size * ticker.lastPrice, 0);
    const tradeSize = Math.min(1, (totalEquity * 0.05) / ticker.lastPrice);

    if (tradeSize <= 0 || ticker.lastPrice === 0) continue;

    const idx = state.positions.findIndex((p) => p.symbol === symbol);
    const now = new Date();
    tradeCounter++;

    if (decision.action === "buy") {
      // Deduct from liquid balance (cost basis)
      const cost = ticker.lastPrice * tradeSize;
      if (cost <= liquidBalance) {
        if (idx >= 0) {
          // Add to existing position
          const p = state.positions[idx];
          state.positions[idx] = { ...p, size: p.size + tradeSize, entryPrice: Math.round((p.entryPrice * p.size + ticker.lastPrice * tradeSize) / (p.size + tradeSize)) };
          state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "buy", action: "add", size: tradeSize, price: ticker.lastPrice });
        } else {
          // New position — entry
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
          // Full exit — calculate PnL
          const pnl = Math.round((ticker.lastPrice - pos.entryPrice) * pos.size);
          state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "sell", action: "exit", size: pos.size, price: ticker.lastPrice, pnl });
          state.portfolio.totalPnL += pnl;
          liquidBalance += ticker.lastPrice * pos.size; // return capital
          state.positions.splice(idx, 1);
        } else {
          // Partial reduce
          const avgEntry = Math.round(pos.entryPrice);
          const pnl = Math.round((ticker.lastPrice - avgEntry) * tradeSize);
          state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "sell", action: "reduce", size: tradeSize, price: ticker.lastPrice, pnl });
          state.portfolio.totalPnL += pnl;
          liquidBalance += ticker.lastPrice * tradeSize; // return partial capital
          state.positions[idx] = { ...state.positions[idx], size: pos.size - tradeSize };
        }
      } else {
        console.log(`[Agent] ${symbol}: skipping sell — no position to close`);
      }
    }

    state.portfolio.totalTrades++;
  }

  // Calculate position value per-symbol (not using a single global ticker)
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
    cash: Math.round(liquidBalance),
    equity: Math.round(realEquity),
    positions: [...state.positions],
    totalPnL: Math.round(realEquity - state.startEquity), // correct PnL from session baseline
  };

  // Persist state to disk — so it survives server restart
  const savedPositions = state.positions.map(p => ({ symbol: p.symbol, side: p.side as "long" | "short", size: p.size, entryPrice: p.entryPrice }));
  saveBalanceState({
    initialCash: config.initialCash,
    startCash: Math.round(state.startEquity), // persist baseline
    cash: Math.round(liquidBalance),
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: savedPositions,
    totalTrades: state.portfolio.totalTrades,
    winRate: state.portfolio.winRate,
  });

  return { decision: state.decision!, signals: state.signals, tickerPrice: displayTicker.lastPrice };
}

export function getAgentState(): AgentState { return { ...state }; }

export async function setAgentStatus(s: "running" | "stopped" | "paused"): Promise<{ closed?: number; realizedPnl?: number }> {
  console.log(`[Agent] Status changed to: ${s}`);
  state.status = s;

  const result: Record<string, unknown> = {};

  if (s === "running") {
    ensureInterval();
  } else if (s === "stopped") {
    stopInterval();

    // Flatten all positions on stop — realize PnL before leaving
    try {
      const { closed, totalPnlRealized } = await flattenPositions();
      result.closed = closed;
      result.realizedPnl = totalPnlRealized;
    } catch (err) {
      console.error("[Agent] Flatten error:", err);
    }

    // Clean up WebSocket connection on stop
    marketWS.disconnect();
  }
  // "paused" — just stop timer, keep positions intact

  return result as { closed?: number; realizedPnl?: number };
}

// ─── Initialize WebSocket subscriptions on module load ──────────────
initWebSocketSubscriptions().catch((err) => {
  console.warn(`[Agent] WS init failed (will fall back to REST):`, err instanceof Error ? err.message : String(err));
});
