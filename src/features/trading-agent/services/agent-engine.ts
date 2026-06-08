import type { Signal, TickerData, TradingDecision, Position } from "../types";
import {
  loadBalanceState,
} from "./balance-store";
import { marketWS, type WSSubscription } from "./market-ws.service";
import { priceStore } from "./price-store";
import { evaluateMultiPair, type MultiPairResult } from "./decision-engine.service";
import {
  type AgentState,
  config,
  getLivePrice,
  flattenPositions as helperFlattenPositions,
  executeTrades,
} from "./agent-helpers";

export { config };

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

// Called by WS service when a ticker updates for a symbol with an open position
export function updatePositionUnrealizedPnL(symbol: string, currentPrice: number): void {
  const idx = state.positions.findIndex((p) => p.symbol === symbol);
  if (idx >= 0 && state.positions[idx].entryPrice > 0) {
    const pos = state.positions[idx];
    const unrealizedPnL = (currentPrice - pos.entryPrice) * pos.size;
    state.positions[idx] = { ...pos, unrealizedPnL };

    // Recalculate total equity to reflect new unrealized PnL
    let totalPosVal = 0;
    for (const p of state.positions) {
      const symTicker = priceStore.getCached(p.symbol);
      const price = symTicker?.lastPrice ?? p.entryPrice;
      totalPosVal += p.size * price;
    }
    const liquidBalance = state.portfolio.cash;
    const realEquity = liquidBalance + totalPosVal;
    state.portfolio = {
      ...state.portfolio,
      timestamp: new Date(),
      cash: liquidBalance,
      equity: realEquity,
      positions: [...state.positions],
      totalPnL: realEquity - state.startEquity,
    };
  }
}

/** Build initial state — prefer saved balance over fresh default */
function buildInitialState(): AgentState {
  const saved = loadBalanceState();

  let cash: number;
  let realizedPnL = 0;
  let positions: Position[] = [];

  if (saved) {
    cash = saved.cash;
    realizedPnL = saved.accumulatedRealizedPnL;
  } else {
    cash = config.initialCash;
  }

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
      totalPnL: Math.round(realizedPnL),
    },
    startEquity: startEquity,
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
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log("[Agent] Timer manually stopped");
}

/** Close all open positions at current market price */
export async function flattenPositions(): Promise<{ closed: number; totalPnlRealized: number }> {
  return await helperFlattenPositions(state);
}

export async function evaluateDecision(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  const priceMap = new Map<string, TickerData>();
  priceMap.set(ticker.symbol, ticker);
  const result = await evaluateMultiPair(priceMap);
  const firstSymbol = Object.keys(result.decisions)[0];
  return {
    decision: result.decisions[firstSymbol],
    signals: result.allSignals,
  };
}

export async function runAgentCycle(): Promise<{ decision: TradingDecision; signals: Signal[]; tickerPrice: number }> {
  if (state.status !== "running") return { decision: null as any, signals: [], tickerPrice: 0 };

  const symbols = config.tradingSymbols;
  const priceMap = new Map<string, TickerData>();
  for (const symbol of symbols) {
    const ticker = await getLivePrice(symbol);
    if (ticker) priceMap.set(symbol, ticker);
  }

  if (priceMap.size === 0) {
    console.warn("[Agent] No price data available — skipping cycle");
    return { decision: null as any, signals: [], tickerPrice: 0 };
  }

  const displayTicker = priceMap.get("BTCUSDT") ?? priceMap.values().next().value!;
  state.ticker = displayTicker;
  state.lastCycleAt = new Date();

  for (const [symbol, ticker] of priceMap) {
    console.log(`[Agent] ${symbol}: $${ticker.lastPrice.toLocaleString()} (${ticker.change24hPercent > 0 ? "+" : ""}${ticker.change24hPercent}% 24h)`);
  }

  const multiResult: MultiPairResult = await evaluateMultiPair(priceMap);
  state.decision = Object.values(multiResult.decisions).sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))[0] ?? { action: "hold", strength: 0, confidence: 0, reason: "" };
  state.signals = multiResult.allSignals;

  // Execute using the helper function
  executeTrades(state, multiResult.decisions, priceMap, displayTicker);

  return { decision: state.decision!, signals: state.signals, tickerPrice: displayTicker.lastPrice };
}

export function getAgentState(): AgentState {
  return { ...state };
}

export async function setAgentStatus(s: "running" | "stopped" | "paused"): Promise<{ closed?: number; realizedPnl?: number }> {
  console.log(`[Agent] Status changed to: ${s}`);
  state.status = s;

  const result: Record<string, unknown> = {};

  if (s === "running") {
    ensureInterval();
  } else if (s === "stopped") {
    stopInterval();

    try {
      const { closed, totalPnlRealized } = await flattenPositions();
      result.closed = closed;
      result.realizedPnl = totalPnlRealized;
    } catch (err) {
      console.error("[Agent] Flatten error:", err);
    }

    marketWS.disconnect();
  }

  return result as { closed?: number; realizedPnl?: number };
}

initWebSocketSubscriptions().catch((err) => {
  console.warn(`[Agent] WS init failed (will fall back to REST):`, err instanceof Error ? err.message : String(err));
});
