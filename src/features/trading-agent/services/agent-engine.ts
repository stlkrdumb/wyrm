import dotenv from "dotenv";
import path from "node:path";
import type { Signal, TickerData, TradingDecision, Position, PendingOrder } from "@/features/trading-agent/types";
import type { AgentState } from "./state-store";
import { config, setTradeCounter, getTradeCounter } from "./state-store";
import { getLivePrice } from "./price-fetcher.service";
import { executeTrades } from "./order-executor.service";
import { priceStore } from "./price-store";
import { evaluateMultiPair, type MultiPairResult } from "./decision-engine.service";
import { runScreening } from "./screening.service";
import { getActiveModel } from "./llm.service";
import { riskManager } from "./risk-manager.service";
import { historyService } from "./history-service";
import { loadBalanceState, saveBalanceState } from "./balance-store";
import { checkPendingOrders, cancelAllPendingOrders } from "./pending-order.service";

// Load .env.local to ensure env vars are available
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

// ─── Public API Re-exports ──────────────────
export type { AgentState };
export { config };

/** Callback for LLM token streaming progress */
type OnTokenCallback = (token: string) => void;

// ─── State Management ───────────────────────
const state: AgentState | null = buildInitialState();

function getState(): AgentState {
  if (!state) throw new Error("Agent not initialized");
  return state;
}

export let llmProgress: { text: string; tokensReceived: number } | null = null;

function setS(v: Partial<AgentState>): void {
  if (state) Object.assign(state, v);
}

const MAX_LOGS = 100;

function pushLog(level: "info" | "action" | "warning" | "error", message: string): void {
  if (!state) return;
  state.logs.push({ timestamp: new Date(), level, message });
  if (state.logs.length > MAX_LOGS) {
    state.logs = state.logs.slice(-MAX_LOGS);
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
    positions = saved.positions.map(p => ({ ...p, unrealizedPnL: 0, stopLossPct: p.stopLossPct ?? config.stopLossPct, takeProfitPct: p.takeProfitPct ?? config.takeProfitPct }));
  } else {
    cash = config.initialCash;
  }

  const startEquity = saved?.startCash ?? cash ?? config.initialCash;
  const peakEq = saved?.peakEquity ?? startEquity;

  return {
    status: "stopped",
    lastCycleAt: null,
    ticker: null,
    decision: null,
    executionReason: "",
    signals: [],
    positions,
    pendingOrders: (saved?.pendingOrders?.map((o: Record<string, unknown>) => ({ ...o, createdAt: new Date(o.createdAt as string) })) ?? []) as PendingOrder[],
    trades: [],
    portfolio: {
      timestamp: new Date(),
      initialCash: config.initialCash,
      cash,
      equity: cash,
      totalTrades: saved?.totalTrades || 0,
      winRate: saved?.winRate || 0,
      totalPnL: realizedPnL,
    },
    startEquity,
    circuitBreakerTripped: saved?.circuitBreakerTripped ?? false,
    circuitBreakerThresholdPct: saved?.circuitBreakerThresholdPct ?? 5.0,
    peakEquity: peakEq,
    modelName: process.env.LLM_MODEL || "qwen3.6-plus",
    watchlist: positions.map(p => p.symbol),
    equityHistory: [],
    logs: [],
    decisionSource: null,
  };
}

/** Recalculate portfolio equity from live positions */
function recalcEquity(st: AgentState): void {
  let posVal = 0;
  for (const p of st.positions) {
    const symSnap = priceStore.getCached(p.symbol);
    if (!symSnap) { posVal += p.size * p.entryPrice; continue; }
    posVal += p.size * symSnap.lastPrice;
  }
  let pendingVal = 0;
  for (const o of st.pendingOrders) {
    if (o.side === "buy") {
      pendingVal += o.size * o.limitPrice;
    }
  }
  const newEquity = st.portfolio.cash + posVal + pendingVal;
  const newPnL = newEquity - st.startEquity;
  if (Math.abs(newPnL) > st.portfolio.cash * 0.02) {
    console.log(`[recalcEquity] cash: $${st.portfolio.cash.toFixed(2)} | positions: $${posVal.toFixed(2)} | pendingBuys: $${pendingVal.toFixed(2)} | startEq: $${st.startEquity.toFixed(2)} => equity: $${newEquity.toFixed(2)} / PnL: $${newPnL.toFixed(2)}`);
  }
  st.portfolio = { ...st.portfolio, equity: newEquity };
}

/** Called by market-ws.service.ts when a ticker update arrives */
export function updatePositionUnrealizedPnL(symbol: string, currentPrice: number): void {
  const st = getState();

  const idx = st.positions.findIndex((p) => p.symbol === symbol);
  if (idx < 0 || st.positions[idx].entryPrice <= 0) return;

  const pos = st.positions[idx];
  const unrealizedPnL = (currentPrice - pos.entryPrice) * pos.size;
  st.positions[idx] = { ...pos, unrealizedPnL };
  recalcEquity(st);

  // Check auto-bracket (stop-loss / take-profit)
  const slPct = pos.stopLossPct ?? config.stopLossPct;
  const tpPct = pos.takeProfitPct ?? config.takeProfitPct;
  const isStopLoss = currentPrice <= pos.entryPrice * (1 - slPct / 100);
  const isTakeProfit = currentPrice >= pos.entryPrice * (1 + tpPct / 100);

  if (isStopLoss || isTakeProfit) {
    const reason = isStopLoss ? "Stop Loss" : "Take Profit";
    console.log(`[Auto-Bracket] ${symbol} exit: ${reason} ($${currentPrice.toLocaleString()}/entry $${pos.entryPrice.toLocaleString()})`);

    const exitFee = currentPrice * pos.size * config.feePct;
    const pnl = unrealizedPnL - exitFee;
    const tc = getTradeCounter() + 1;
    setTradeCounter(tc);

    st.trades.push({ id: `T${tc}`, timestamp: new Date(), symbol, side: "sell", action: "exit", size: pos.size, price: currentPrice, pnl, fee: exitFee });
    st.portfolio.cash += currentPrice * pos.size - (currentPrice * pos.size) * config.feePct;
    st.positions.splice(idx, 1);
    st.watchlist = st.watchlist.filter(s => s !== symbol);
    st.portfolio.totalPnL = st.portfolio.cash - st.startEquity;
    st.portfolio.totalTrades++;

    recalcEquity(st);
  }

  // Check pending limit orders for this symbol
  checkPendingOrders(st, symbol, currentPrice);
}

export async function evaluateDecision(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  const priceMap = new Map<string, TickerData>();
  priceMap.set(ticker.symbol, ticker);
  const r = await evaluateMultiPair(priceMap, state?.positions ?? [], undefined);
  return { decision: r.decisions[ticker.symbol], signals: r.allSignals };
}

/** Abort helper — returns true if agent is no longer running */
function isStopped(): boolean {
  const st = getState();
  if (st.circuitBreakerTripped) { st.status = "stopped"; return true; }
  return st.status !== "running";
}

export async function runAgentCycle(_onToken?: OnTokenCallback): Promise<{ tickerPrice: number; tickers: Record<string, TickerData> }> { // eslint-disable-line @typescript-eslint/no-unused-vars
  const st = getState();
  if (st.circuitBreakerTripped) { st.status = "stopped"; return { tickerPrice: 0, tickers: {} }; }
  if (st.status !== "running") return { tickerPrice: 0, tickers: {} };

  llmProgress = { text: "", tokensReceived: 0 };
  st.lastCycleAt = new Date();
  pushLog("info", "Cycle started — scanning market...");

  // Stage 1: Screen the wider market for trade candidates
  const screenResult = await runScreening(st.positions);
  if (isStopped()) { console.warn("[Agent] Stop requested during screening — aborting cycle"); return { tickerPrice: 0, tickers: {} }; }
  const screenSelected = screenResult.selected;

  // Always include existing positions + screening picks
  const positionSymbols = st.positions.map(p => p.symbol);
  const targetSymbols = [...new Set([...positionSymbols, ...screenSelected])];

  if (targetSymbols.length === 0) {
    console.warn("[Agent] No positions and screening picked nothing — skipping cycle");
    return { tickerPrice: 0, tickers: {} };
  }

  // Fetch prices for target symbols
  const prices = new Map<string, TickerData>();
  for (const symbol of targetSymbols) {
    const t = await getLivePrice(symbol);
    if (t && t.lastPrice > 0) prices.set(symbol, t);
  }

  if (prices.size === 0) { console.warn("[Agent] No price data — skipping cycle"); return { tickerPrice: 0, tickers: {} }; }

  const displayTicker = prices.get("BTCUSDT") ?? prices.values().next().value!;
  st.ticker = displayTicker;

  for (const [, t] of prices) { console.log(`[Agent] ${t.symbol}: $${t.lastPrice.toLocaleString()} (${t.change24hPercent >= 0 ? "+" : ""}${t.change24hPercent}%)`); }

  if (screenSelected.length > 0) {
    console.log(`[Agent] Screening selected: ${screenSelected.join(", ")} — ${screenResult.reason}`);
    pushLog("info", `Screening: ${screenSelected.join(", ")} — ${screenResult.reason}`);
  }

  // Stage 2: Deep TA + sentiment analysis on selected + held symbols
  const er: MultiPairResult = await evaluateMultiPair(prices, st.positions, st.pendingOrders, (token: string) => {
    if (!llmProgress) llmProgress = { text: "", tokensReceived: 0 };
    llmProgress.text += token;
    llmProgress.tokensReceived += 1;
  });
  if (isStopped()) { console.warn("[Agent] Stop requested during evaluation — aborting cycle"); return { tickerPrice: 0, tickers: {} }; }
  setS({ decisionSource: er.source });

  const validated: Record<string, TradingDecision> = {};
  let best: TradingDecision | null = null;
  for (const [sym, decision] of Object.entries(er.decisions)) {
    const ticker = prices.get(sym);
    if (decision.action !== "hold" && (decision.size === undefined || decision.size === 0)) {
      if (ticker?.lastPrice) {
        const totalEquity = st.portfolio.equity;
        const strengthFactor = Math.abs(decision.strength);
        decision.size = (totalEquity * config.orderSizePct * strengthFactor) / ticker.lastPrice;
      }
    }

    const vr = riskManager.validateDecision(decision, st.portfolio, ticker ?? undefined, st.positions);
    await historyService.saveDecision({
      id: `DEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date(), symbol: sym, decision, riskStatus: "approved", riskReason: "",
      originalSize: decision.size ?? 0, adjustedSize: vr.adjustedDecision?.size ?? 0,
      marketContext: ticker ? { lastPrice: ticker.lastPrice, change24hPercent: ticker.change24hPercent } : undefined,
    });

    if (vr.isAllowed) {
      const fd = vr.adjustedDecision ?? decision;
      validated[sym] = fd;
      if (!best || Math.abs(fd.strength) > Math.abs(best.strength)) best = fd;
    } else { st.executionReason = `${sym}: ${vr.reason}`; }
  }

  setS({ decision: best, signals: er.allSignals });
  if (best && best.action !== "hold") {
    pushLog("action", `${best.action.toUpperCase()} signal — strength ${(best.strength * 100).toFixed(0)}% — ${best.reason ?? ""}`);
  } else {
    pushLog("info", "No actionable signal — holding position");
  }
  if (isStopped()) { console.warn("[Agent] Stop requested before trade execution — aborting cycle"); return { tickerPrice: 0, tickers: {} }; }
  executeTrades(st, validated, prices, displayTicker);

  // Sync watchlist: keep position symbols + pending order symbols + add freshly screened picks
  const posSyms = new Set(st.positions.map(p => p.symbol));
  const pendingSyms = new Set(st.pendingOrders.map(o => o.symbol));
  const kept = st.watchlist.filter(s => posSyms.has(s) || pendingSyms.has(s));
  // Ensure all position symbols are present even if added this cycle
  for (const sym of posSyms) {
    if (!kept.includes(sym)) kept.push(sym);
  }
  for (const sym of pendingSyms) {
    if (!kept.includes(sym)) kept.push(sym);
  }
  for (const s of screenSelected) {
    if (!posSyms.has(s) && !kept.includes(s)) kept.push(s);
  }
  st.watchlist = kept;

  // Record equity snapshot for chart history
  recalcEquity(st);
  st.equityHistory.push({ timestamp: new Date(), equity: st.portfolio.equity });
  if (st.equityHistory.length > 500) st.equityHistory.splice(0, st.equityHistory.length - 500);

  // Sync model name with what LLM is actually using
  st.modelName = getActiveModel();

  return { tickerPrice: displayTicker.lastPrice, tickers: Object.fromEntries(prices) };
}

export function getAgentState(): AgentState {
  const st = getState();
  // Deep copy preserving Date objects (JSON.stringify would convert Dates to strings)
  return {
    ...st,
    lastCycleAt: st.lastCycleAt ? new Date(st.lastCycleAt) : null,
    ticker: st.ticker ? { ...st.ticker, timestamp: st.ticker.timestamp instanceof Date ? st.ticker.timestamp : new Date(st.ticker.timestamp) } : null,
    signals: st.signals.map(sig => ({ ...sig, timestamp: sig.timestamp instanceof Date ? sig.timestamp : new Date(sig.timestamp) })),
    portfolio: {
      ...st.portfolio,
      timestamp: st.portfolio.timestamp instanceof Date ? st.portfolio.timestamp : new Date(st.portfolio.timestamp),
    },
    positions: st.positions.map(p => ({ ...p })),
    pendingOrders: st.pendingOrders.map(o => ({ ...o, createdAt: o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt) })),
    trades: st.trades.map(t => ({ ...t, timestamp: t.timestamp instanceof Date ? t.timestamp : new Date(t.timestamp) })),
  };
}

export async function setAgentStatus(s: "running" | "stopped" | "paused"): Promise<{ closed?: number; realizedPnl?: number }> {
  const st = getState();
  st.status = s;

  if (s === "paused" || s === "stopped") {
    cancelAllPendingOrders(st);
    let closedCount = 0, totalPnlRealized = 0;
    for (const p of st.positions) {
      if (p.size <= 0) continue;
      const snap = priceStore.getCached(p.symbol);
      const currentPrice = snap?.lastPrice ?? p.entryPrice;
      const revenue = currentPrice * p.size;
      const fee = revenue * config.feePct;
      const pnl = (currentPrice - p.entryPrice) * p.size - fee;
      const tc = getTradeCounter() + 1; setTradeCounter(tc);
      st.trades.push({ id: `T${tc}`, timestamp: new Date(), symbol: p.symbol, side: "sell", action: "exit", size: p.size, price: currentPrice, pnl, fee });
      st.portfolio.cash += revenue - fee;
      totalPnlRealized += pnl; closedCount++;
    }
    st.positions = [];
    st.portfolio.totalPnL = st.portfolio.cash - st.startEquity;
    st.portfolio.equity = st.portfolio.cash;
      st.watchlist = [];
      saveBalanceState({
        initialCash: config.initialCash, startCash: state?.startEquity ?? st.startEquity, cash: st.portfolio.cash,
        accumulatedRealizedPnL: st.portfolio.totalPnL, positions: [], pendingOrders: [], totalTrades: st.portfolio.totalTrades, winRate: st.portfolio.winRate,
      });
      return { closed: closedCount, realizedPnl: totalPnlRealized };
    }
    return {};
  }

export function resetCircuitBreaker(): void {
  getState().circuitBreakerTripped = false;
}

export function updateCircuitBreakerThreshold(pct: number): void {
  const st = getState();
  if (pct >= 1 && pct <= 50) st.circuitBreakerThresholdPct = pct;
}
