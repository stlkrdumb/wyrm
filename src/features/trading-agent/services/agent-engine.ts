import dotenv from "dotenv";
import path from "node:path";
import type { Signal, TickerData, TradingDecision, Position } from "@/features/trading-agent/types";
import type { AgentState } from "./state-store";
import { config, setTradeCounter, getTradeCounter } from "./state-store";
import { getLivePrice } from "./price-fetcher.service";
import { executeTrades } from "./order-executor.service";
import { priceStore } from "./price-store";
import { evaluateMultiPair, type MultiPairResult } from "./decision-engine.service";
import { refreshWatchlist } from "./screening.service";
import { getActiveModel } from "./llm.service";
import { riskManager } from "./risk-manager.service";
import { historyService } from "./history-service";
import { loadBalanceState, saveBalanceState } from "./balance-store";
import { marketWS } from "./market-ws.service";

// Load .env.local to ensure env vars are available
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

// ─── Public API Re-exports ──────────────────
export type { AgentState };
export { config };

/** Callback for LLM token streaming progress */
type OnTokenCallback = (token: string) => void;

// ─── State Management ───────────────────────
// Share the agent state singleton across Next.js bundles using Node's global object
const globalForAgentState = global as unknown as { agentState?: AgentState };

const state: AgentState = globalForAgentState.agentState ?? buildInitialState();

if (process.env.NODE_ENV !== "production") {
  globalForAgentState.agentState = state;
}

function getState(): AgentState {
  return state;
}

export let llmProgress: { text: string; tokensReceived: number } | null = null;

function setS(v: Partial<AgentState>): void {
  Object.assign(state, v);
}

const MAX_LOGS = 100;

function pushLog(level: "info" | "action" | "warning" | "error", message: string): void {
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
    positions = saved.positions.map(p => ({
      ...p,
      unrealizedPnL: 0,
      stopLossPct: p.stopLossPct ?? config.stopLossPct,
      takeProfitPct: p.takeProfitPct ?? config.takeProfitPct,
    }));
    // Restore trade counter so new trade IDs don't collide with previous session
    if (typeof saved.tradeCounter === "number") setTradeCounter(saved.tradeCounter);
  } else {
    cash = config.initialCash;
  }

  // Equity = cash + mark-to-market of any open positions (use entry price as fallback)
  const positionsValueAtEntry = positions.reduce((s, p) => s + p.size * p.entryPrice, 0);
  const startEquity = saved?.startCash ?? cash ?? config.initialCash;
  const peakEq = saved?.peakEquity ?? Math.max(startEquity, cash + positionsValueAtEntry);

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
      // Initial equity includes position value, not just cash — prevents display jump on restart
      equity: cash + positionsValueAtEntry,
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
    lastWatchlistRefresh: null,
    equityHistory: saved?.equityHistory
      ? saved.equityHistory.map(e => ({ timestamp: new Date(e.timestamp), equity: e.equity }))
      : [],
    logs: [],
    decisionSource: null,
    recentExits: new Map<string, { timestamp: number; reason: "Stop Loss" | "Take Profit" | "Dust Cleanup" }>(),
  };
}

/** Recalculate portfolio equity from live positions.
 *  State is read directly by the 1s poll — no SSE emission needed. */
function recalcEquity(st: AgentState): void {
  let totalPosVal = 0;
  for (const p of st.positions) {
    const symSnap = priceStore.getCached(p.symbol);
    if (!symSnap) { totalPosVal += p.size * p.entryPrice; continue; }
    totalPosVal += p.size * symSnap.lastPrice;
  }
  st.portfolio = { ...st.portfolio, equity: st.portfolio.cash + totalPosVal };
}

/** Called by market-ws.service.ts when a ticker update arrives */
export function updatePositionUnrealizedPnL(symbol: string, currentPrice: number): void {
  const st = getState();

  const idx = st.positions.findIndex((p) => p.symbol === symbol);
  if (idx < 0) return;
  const pos = st.positions[idx];
  if (pos.entryPrice <= 0) {
    console.warn(`[Auto-Bracket] ${symbol} has invalid entry price $${pos.entryPrice} — skipping PnL update`);
    return;
  }

  const unrealizedPnL = (currentPrice - pos.entryPrice) * pos.size;
  st.positions[idx] = { ...pos, unrealizedPnL };
  recalcEquity(st);

  // Use per-position SL/TP with global config as fallback
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

    // Record auto-bracket exit so the LLM doesn't re-enter within the cooldown window
    st.recentExits.set(symbol, { timestamp: Date.now(), reason });
    // Periodically prune stale entries (older than 24h) to keep the map small
    if (st.recentExits.size > 50) {
      const cutoff = Date.now() - 86_400_000;
      for (const [sym, entry] of st.recentExits) {
        if (entry.timestamp < cutoff) st.recentExits.delete(sym);
      }
    }

    // Recalc equity after the position close
    recalcEquity(st);
  }
}

export async function evaluateDecision(ticker: TickerData): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  const priceMap = new Map<string, TickerData>();
  priceMap.set(ticker.symbol, ticker);
  const r = await evaluateMultiPair(priceMap, state.positions, undefined);
  return { decision: r.decisions[ticker.symbol], signals: r.allSignals };
}

/** Abort helper — returns true if agent is no longer running.
 *  Side-effect free — the circuit-breaker transition happens in checkCircuitBreaker. */
function isStopped(): boolean {
  const st = getState();
  if (st.circuitBreakerTripped) return true;
  return st.status !== "running";
}

export async function runAgentCycle(onToken?: OnTokenCallback): Promise<{ tickerPrice: number; tickers: Record<string, TickerData> }> {
  const st = getState();
  if (st.circuitBreakerTripped) { st.status = "stopped"; return { tickerPrice: 0, tickers: {} }; }
  if (st.status !== "running") return { tickerPrice: 0, tickers: {} };

  llmProgress = { text: "", tokensReceived: 0 };
  st.llmProgress = llmProgress;
  st.lastCycleAt = new Date();
  pushLog("info", "Cycle started — scanning market...");

  // Stage 1: Refresh watchlist pool (top volume / reversal candidates)
  const now = Date.now();
  const WATCHLIST_REFRESH_MS = Number(process.env.WATCHLIST_REFRESH_MS) || 300_000;
  const positionSymbols = st.positions.map(p => p.symbol);

  if (!st.lastWatchlistRefresh || now - st.lastWatchlistRefresh > WATCHLIST_REFRESH_MS) {
    st.watchlist = await refreshWatchlist(positionSymbols);
    st.lastWatchlistRefresh = now;
    // Subscribe to WS feeds IMMEDIATELY so the WS has time to push ticks for new
    // coins before the LLM finishes and executeTrades runs. Without this, fresh
    // watchlist symbols trade on REST-snapshot prices instead of live WS data.
    marketWS.syncSubscriptionsForPositions(st.watchlist);
    if (isStopped()) { console.warn("[Agent] Stop requested during watchlist refresh — aborting cycle"); return { tickerPrice: 0, tickers: {} }; }
  }

  const targetSymbols = st.watchlist;
  if (targetSymbols.length === 0) {
    console.warn("[Agent] Watchlist empty — skipping cycle");
    return { tickerPrice: 0, tickers: {} };
  }

  // Fetch prices in parallel — use allSettled so a single failure doesn't abort the cycle
  const prices = new Map<string, TickerData>();
  const priceResults = await Promise.allSettled(targetSymbols.map(s => getLivePrice(s)));
  for (const result of priceResults) {
    if (result.status === "fulfilled" && result.value && result.value.lastPrice > 0) {
      prices.set(result.value.symbol, result.value);
    }
  }

  if (prices.size === 0) { console.warn("[Agent] No price data — skipping cycle"); return { tickerPrice: 0, tickers: {} }; }

  // Pick a display ticker — prefer BTCUSDT, then the highest-volume coin
  const btcTicker = prices.get("BTCUSDT");
  let displayTicker: TickerData;
  if (btcTicker) {
    displayTicker = btcTicker;
  } else {
    displayTicker = Array.from(prices.values())
      .sort((a, b) => b.volume24h - a.volume24h)[0] ?? prices.values().next().value!;
  }
  st.ticker = displayTicker;

  for (const [, t] of prices) { console.log(`[Agent] ${t.symbol}: $${t.lastPrice.toLocaleString()} (${t.change24hPercent >= 0 ? "+" : ""}${t.change24hPercent}%)`); }

  // Stage 2: Deep TA + sentiment analysis on selected + held symbols
  // Pass recent auto-exits so the LLM knows which symbols it doesn't hold anymore
  const recentExitsForPrompt = Array.from(st.recentExits.entries()).map(([symbol, entry]) => ({
    symbol,
    reason: entry.reason,
    timestamp: entry.timestamp,
  }));
  const er: MultiPairResult = await evaluateMultiPair(prices, st.positions, onToken ?? ((token: string) => {
    if (!llmProgress) llmProgress = { text: "", tokensReceived: 0 };
    llmProgress.text += token;
    llmProgress.tokensReceived += 1;
    st.llmProgress = llmProgress;
  }), recentExitsForPrompt);
  if (isStopped()) { console.warn("[Agent] Stop requested during evaluation — aborting cycle"); return { tickerPrice: 0, tickers: {} }; }
  setS({ decisionSource: er.source });

  const validated: Record<string, TradingDecision> = {};
  let best: TradingDecision | null = null;
  const recentExitCooldownMs = Number(process.env.RECENT_EXIT_COOLDOWN_MS) || 600_000; // 10 min default
  for (const [sym, decision] of Object.entries(er.decisions)) {
    const ticker = prices.get(sym);

    // Block re-entry for symbols recently auto-exited via stop-loss or take-profit
    if (decision.action === "buy") {
      const lastExit = st.recentExits.get(sym);
      if (lastExit !== undefined) {
        const elapsed = Date.now() - lastExit.timestamp;
        if (elapsed < recentExitCooldownMs) {
          const secs = Math.round(elapsed / 1000);
          console.log(`[Agent] ${sym}: skipping buy — auto-bracket cooldown (${secs}s / ${Math.round(recentExitCooldownMs / 1000)}s)`);
          st.executionReason = `${sym}: cooldown after recent auto-exit (${secs}s ago)`;
          continue;
        }
        // Cooldown expired — clean up the entry
        st.recentExits.delete(sym);
      }
    }

    if (decision.action !== "hold" && (decision.size === undefined || decision.size === 0)) {
      if (decision.action === "sell") {
        // Sells: use the full position size for a clean exit
        const pos = st.positions.find(p => p.symbol === sym);
        decision.size = pos?.size ?? (ticker?.lastPrice ? (st.portfolio.equity * config.orderSizePct * Math.abs(decision.strength)) / ticker.lastPrice : Number.MAX_SAFE_INTEGER);
      } else if (ticker?.lastPrice) {
        const totalEquity = st.portfolio.equity;
        const strengthFactor = Math.abs(decision.strength);
        const confidenceFactor = typeof decision.confidence === "number" ? Math.max(0, Math.min(1, decision.confidence)) : 1.0;
        decision.size = (totalEquity * config.orderSizePct * strengthFactor * confidenceFactor) / ticker.lastPrice;
      }
    }

    const vr = riskManager.validateDecision(decision, st.portfolio, ticker ?? undefined, st.positions);
    // History save is non-critical — log and continue on failure rather than aborting the cycle
    try {
      await historyService.saveDecision({
        id: `DEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date(), symbol: sym, decision, riskStatus: vr.isAllowed ? "approved" : "blocked", riskReason: vr.reason || "",
        originalSize: decision.size ?? 0, adjustedSize: vr.adjustedDecision?.size ?? 0,
        marketContext: ticker ? { lastPrice: ticker.lastPrice, change24hPercent: ticker.change24hPercent } : undefined,
      });
    } catch (historyErr) {
      console.warn(`[Agent] Failed to save decision history for ${sym}:`, historyErr instanceof Error ? historyErr.message : String(historyErr));
    }

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
  executeTrades(st, validated, prices);

  // Sync watchlist: ensure all position symbols are present
  const posSyms = new Set(st.positions.map(p => p.symbol));
  for (const sym of posSyms) {
    if (!st.watchlist.includes(sym)) st.watchlist.push(sym);
  }

  // Record equity snapshot for chart history
  recalcEquity(st);
  st.equityHistory.push({ timestamp: new Date(), equity: st.portfolio.equity });
  if (st.equityHistory.length > 500) st.equityHistory.splice(0, st.equityHistory.length - 500);

  // Sync model name with what LLM is actually using
  st.modelName = getActiveModel();

  // Persist updated state to disk at the end of the cycle
  try {
    saveBalanceState({
      initialCash: config.initialCash,
      startCash: st.startEquity,
      cash: st.portfolio.cash,
      accumulatedRealizedPnL: st.portfolio.totalPnL,
      positions: st.positions.map(p => ({
        symbol: p.symbol,
        side: p.side as "long" | "short",
        size: p.size,
        entryPrice: p.entryPrice,
        stopLossPct: p.stopLossPct,
        takeProfitPct: p.takeProfitPct,
      })),
      totalTrades: st.portfolio.totalTrades,
      winRate: st.portfolio.winRate,
      circuitBreakerTripped: st.circuitBreakerTripped,
      circuitBreakerThresholdPct: st.circuitBreakerThresholdPct,
      peakEquity: st.peakEquity,
      tradeCounter: getTradeCounter(),
      equityHistory: st.equityHistory.map(e => ({
        timestamp: e.timestamp.toISOString(),
        equity: e.equity,
      })),
    });
  } catch (saveErr) {
    console.error("[Agent] Failed to persist state at end of cycle:", saveErr instanceof Error ? saveErr.message : String(saveErr));
  }

  return { tickerPrice: displayTicker.lastPrice, tickers: Object.fromEntries(prices) };
}

export function getAgentState(): AgentState {
  const st = getState();
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
    trades: st.trades.map(t => ({ ...t, timestamp: t.timestamp instanceof Date ? t.timestamp : new Date(t.timestamp) })),
    recentExits: new Map(st.recentExits),
  };
}

export async function setAgentStatus(s: "running" | "stopped" | "paused"): Promise<{ closed?: number; realizedPnl?: number }> {
  const st = getState();
  st.status = s;

  if (s !== "paused" && s !== "stopped") return {};

  // Snapshot positions BEFORE any await — WS ticks can splice positions during the await
  const snapshot = st.positions.filter(p => p.size > 0).map(p => ({
    symbol: p.symbol,
    size: p.size,
    entryPrice: p.entryPrice,
    side: p.side,
    stopLossPct: p.stopLossPct,
    takeProfitPct: p.takeProfitPct,
  }));

  // Fetch close prices in parallel, indexed by symbol to avoid race with concurrent mutations
  const priceMap = new Map<string, number>();
  const priceResults = await Promise.allSettled(snapshot.map(p => getLivePrice(p.symbol)));
  for (let i = 0; i < snapshot.length; i++) {
    const r = priceResults[i];
    if (r.status === "fulfilled" && r.value && r.value.lastPrice > 0) {
      priceMap.set(snapshot[i].symbol, r.value.lastPrice);
    }
  }

  let closedCount = 0, totalPnlRealized = 0;
  const closedSymbols = new Set<string>();
  for (const pos of snapshot) {
    const currentPrice = priceMap.get(pos.symbol) ?? pos.entryPrice;
    if (!priceMap.has(pos.symbol)) {
      console.warn(`[Agent] Closing ${pos.symbol} at entry price — no live data`);
    }
    const revenue = currentPrice * pos.size;
    const fee = revenue * config.feePct;
    const pnl = (currentPrice - pos.entryPrice) * pos.size - fee;
    const tc = getTradeCounter() + 1;
    setTradeCounter(tc);
    st.trades.push({ id: `T${tc}`, timestamp: new Date(), symbol: pos.symbol, side: "sell", action: "exit", size: pos.size, price: currentPrice, pnl, fee });
    st.portfolio.cash += revenue - fee;
    totalPnlRealized += pnl;
    closedCount++;
    closedSymbols.add(pos.symbol);
  }

  // Remove closed positions, then mark-to-market any survivors with the prices we have
  st.positions = st.positions.filter(p => !closedSymbols.has(p.symbol));
  let survivorValue = 0;
  for (const p of st.positions) {
    const px = priceMap.get(p.symbol) ?? p.entryPrice;
    survivorValue += p.size * px;
  }

  st.portfolio.equity = st.portfolio.cash + survivorValue;
  st.portfolio.totalPnL = st.portfolio.equity - st.startEquity;
  st.watchlist = st.watchlist.filter(s => closedSymbols.has(s) ? false : st.positions.some(p => p.symbol === s) || s === "BTCUSDT");

  // Persist after in-memory state is fully updated — failure no longer creates disk/memory divergence
  try {
    saveBalanceState({
      initialCash: config.initialCash,
      startCash: st.startEquity,
      cash: st.portfolio.cash,
      accumulatedRealizedPnL: st.portfolio.totalPnL,
      positions: st.positions.map(p => ({ symbol: p.symbol, side: p.side as "long" | "short", size: p.size, entryPrice: p.entryPrice, stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct })),
      totalTrades: st.portfolio.totalTrades,
      winRate: st.portfolio.winRate,
      circuitBreakerTripped: st.circuitBreakerTripped,
      circuitBreakerThresholdPct: st.circuitBreakerThresholdPct,
      peakEquity: st.peakEquity,
      tradeCounter: getTradeCounter(),
    });
  } catch (saveErr) {
    console.error("[Agent] Failed to persist state on stop/pause — in-memory state may diverge from disk:", saveErr instanceof Error ? saveErr.message : String(saveErr));
  }

  return { closed: closedCount, realizedPnl: totalPnlRealized };
}

export function resetCircuitBreaker(): void {
  getState().circuitBreakerTripped = false;
}

export function updateCircuitBreakerThreshold(pct: number): void {
  const st = getState();
  if (pct >= 1 && pct <= 50) st.circuitBreakerThresholdPct = pct;
}
