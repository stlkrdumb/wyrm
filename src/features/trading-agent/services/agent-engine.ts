import type { Signal, TickerData, PortfolioSnapshot, Position, Trade } from "../types";
import { TradingDecision } from "../types";
import { getTickerPrice } from "./market-data.service";
import { evaluateSignals } from "./decision-engine.service";

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
}

const config = {
  initialCash: Number(process.env.SIM_INITIAL_CASH) || 100000,
};

let tradeCounter = 0;

let state: AgentState = {
  status: "stopped", lastCycleAt: null, ticker: null, decision: null,
  executionReason: "", signals: [],
  portfolio: { timestamp: new Date(), initialCash: config.initialCash, cash: config.initialCash, equity: config.initialCash, positions: [], totalTrades: 0, winRate: 0, totalPnL: 0 },
  positions: [], trades: [],
};

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
  const symbol = process.env.AGENT_SYMBOL || "BTCUSDT";
  let ticker: TickerData;

  try {
    ticker = await getTickerPrice(symbol);
  } catch (err) {
    console.warn(`[Agent] Could not fetch price for flatten, using cached ticker: ${err}`);
    ticker = state.ticker ?? { symbol, lastPrice: 0, high24h: 0, low24h: 0, volume24h: 0, change24hPercent: 0, timestamp: new Date() };
  }

  const closedPositions: Position[] = [];
  let totalPnlRealized = 0;

  if (ticker.lastPrice === 0 && state.positions.length > 0) {
    console.warn("[Agent] Cannot flatten — no price data available, keeping positions");
    return { closed: 0, totalPnlRealized: 0 };
  }

  for (const pos of state.positions) {
    if (pos.size <= 0) continue;
    const pnl = Math.round((ticker.lastPrice - pos.entryPrice) * pos.size);
    tradeCounter++;
    state.trades.push({
      id: `T${tradeCounter}`,
      timestamp: new Date(),
      symbol: pos.symbol,
      side: "sell",
      action: "exit",
      size: pos.size,
      price: ticker.lastPrice,
      pnl,
    });
    totalPnlRealized += pnl;
    closedPositions.push(pos);
  }

  // Update portfolio PnL
  state.portfolio.totalPnL += totalPnlRealized;
  state.portfolio.totalTrades += closedPositions.length;

  // Clear all positions
  const closedCount = state.positions.length;
  state.positions = [];
  state.ticker = ticker;

  const posValue = state.positions.reduce((s, p) => s + p.size * ticker.lastPrice, 0);
  state.portfolio = { ...state.portfolio, timestamp: new Date(), equity: posValue, positions: [], totalPnL: state.portfolio.totalPnL };

  console.log(`[Agent] Flattened ${closedCount} position(s) at $${ticker.lastPrice.toLocaleString()} — realized PnL: ${totalPnlRealized >= 0 ? "+" : ""}$${totalPnlRealized.toLocaleString()}`);

  return { closed: closedCount, totalPnlRealized };
}

export async function evaluateDecision(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  return await evaluateSignals(ticker);
}

export async function runAgentCycle(): Promise<{ decision: TradingDecision; signals: Signal[]; tickerPrice: number }> {
  // Abort immediately if agent was stopped while cycle was in-flight
  if (state.status !== "running") return { decision: null as any, signals: [], tickerPrice: 0 };

  const symbol = process.env.AGENT_SYMBOL || "BTCUSDT";

  // Fetch real price from Bitget via Agent Hub bgc CLI (with fallback to simulate)
  let ticker: TickerData;
  try {
    ticker = await getTickerPrice(symbol);
    console.log(`[Agent] Real price fetched: ${ticker.symbol} $${ticker.lastPrice} (${ticker.change24hPercent > 0 ? "+" : ""}${ticker.change24hPercent}% 24h)`);
  } catch (error) {
    console.warn(`[Agent] Bitget ticker fetch failed, falling back to simulated price: ${error}`);
    const basePrice = 103250 + (Math.random() - 0.5) * 800;
    ticker = { symbol, lastPrice: Math.round(basePrice), high24h: basePrice*1.02, low24h: basePrice*0.98, volume24h: 0, change24hPercent: (Math.random()-0.5)*4, timestamp: new Date() };
  }

  // LLM-powered analysis using real market data
  const { decision, signals } = await evaluateDecision(ticker);
  state.ticker = ticker;
  state.decision = decision;
  state.signals = signals;
  state.lastCycleAt = new Date();

  if (decision.action !== "hold") {
    const totalEquity = state.portfolio.cash + state.positions.reduce((s, p) => s + p.size * ticker.lastPrice, 0);
    const tradeSize = Math.min(1, (totalEquity * 0.05) / ticker.lastPrice);

    if (decision.action === "buy") {
      const idx = state.positions.findIndex((p) => p.symbol === symbol);
      const now = new Date();
      tradeCounter++;

      if (idx >= 0) {
        const p = state.positions[idx];
        state.positions[idx] = { ...p, size: p.size + tradeSize, entryPrice: Math.round((p.entryPrice * p.size + ticker.lastPrice * tradeSize) / (p.size + tradeSize)) };
        // Log add/reduce
        if (tradeSize > 0) {
          state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "buy", action: "add", size: tradeSize, price: ticker.lastPrice });
        }
      } else {
        // New position — entry
        state.positions.push({ symbol, side: "long", size: tradeSize, entryPrice: ticker.lastPrice, unrealizedPnL: 0 });
        state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "buy", action: "entry", size: tradeSize, price: ticker.lastPrice });
      }
    } else {
      // Sell
      const idx = state.positions.findIndex((p) => p.symbol === symbol);
      const now = new Date();
      tradeCounter++;

      if (idx >= 0 && state.positions[idx].size <= tradeSize) {
        // Full exit — calculate PnL
        const p = state.positions[idx];
        const pnl = Math.round((ticker.lastPrice - p.entryPrice) * p.size);
        state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "sell", action: "exit", size: p.size, price: ticker.lastPrice, pnl });
        state.portfolio.totalPnL += pnl;
        state.positions.splice(idx, 1);
      } else if (idx >= 0) {
        // Partial reduce
        const prevSize = state.positions[idx].size;
        const avgEntry = Math.round(state.positions[idx].entryPrice);
        state.positions[idx] = { ...state.positions[idx], size: state.positions[idx].size - tradeSize };
        const pnl = Math.round((ticker.lastPrice - avgEntry) * tradeSize);
        state.trades.push({ id: `T${tradeCounter}`, timestamp: now, symbol, side: "sell", action: "reduce", size: tradeSize, price: ticker.lastPrice, pnl });
        state.portfolio.totalPnL += pnl;
      }
    }
    state.portfolio.totalTrades++;
  }

  const totalPosVal = state.positions.reduce((s, p) => s + p.size * ticker.lastPrice, 0);
  state.portfolio = { ...state.portfolio, timestamp: new Date(), equity: totalPosVal, positions: [...state.positions], totalPnL: totalPosVal - config.initialCash };

  return { decision, signals, tickerPrice: ticker.lastPrice };
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
  }
  // "paused" — just stop timer, keep positions intact

  return result as { closed?: number; realizedPnl?: number };
}
