import type { Signal, TickerData, TradingDecision, Position } from "@/features/trading-agent/types";
import {
  loadBalanceState,
  saveBalanceState,
} from "./balance-store";
import { marketWS, type WSSubscription } from "./market-ws.service";
import { priceStore } from "./price-store";
import { evaluateMultiPair, type MultiPairResult } from "./decision-engine.service";
import { riskManager } from "./risk-manager.service";
import { historyService } from "./history-service";
import type { DecisionRecord } from "@/features/trading-agent/types/history.types";
import {
  type AgentState,
  config,
  getLivePrice,
  flattenPositions as helperFlattenPositions,
  executeTrades,
  getTradeCounter,
  setTradeCounter,
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

    // Check Stop Loss & Take Profit limits
    const isStopLoss = currentPrice <= pos.entryPrice * (1 - config.stopLossPct / 100);
    const isTakeProfit = currentPrice >= pos.entryPrice * (1 + config.takeProfitPct / 100);

    if (isStopLoss || isTakeProfit) {
      const reason = isStopLoss ? "Stop Loss Triggered" : "Take Profit Triggered";
      console.log(`[Agent] [AUTONOMOUS BRACKET] ${symbol} exit triggered: ${reason} (Price: $${currentPrice.toLocaleString()} vs Entry: $${pos.entryPrice.toLocaleString()})`);
      
      const pnl = unrealizedPnL;
      const tradeCounter = getTradeCounter() + 1;
      setTradeCounter(tradeCounter);

      // Add sell trade record
      state.trades.push({
        id: `T${tradeCounter}`,
        timestamp: new Date(),
        symbol,
        side: "sell",
        action: "exit",
        size: pos.size,
        price: currentPrice,
        pnl,
      });

      // Update cash, total trades, and remove position
      state.portfolio.cash += currentPrice * pos.size;
      state.positions.splice(idx, 1);
      state.portfolio.totalPnL += pnl;
      state.portfolio.totalTrades++;

      // Recalculate portfolio equity
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

      // Save updated state to disk
      const savedPositions = state.positions.map(p => ({
        symbol: p.symbol,
        side: p.side as "long" | "short",
        size: p.size,
        entryPrice: p.entryPrice
      }));
      saveBalanceState({
        initialCash: config.initialCash,
        startCash: state.startEquity,
        cash: liquidBalance,
        accumulatedRealizedPnL: state.portfolio.totalPnL,
        positions: savedPositions,
        totalTrades: state.portfolio.totalTrades,
        winRate: state.portfolio.winRate,
        circuitBreakerTripped: state.circuitBreakerTripped,
        circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
        peakEquity: state.peakEquity,
      });
      return;
    }

    // Recalculate total equity to reflect new unrealized PnL (if no exit triggered)
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
    checkCircuitBreaker();
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
      totalPnL: realizedPnL,
    },
    startEquity: startEquity,
    circuitBreakerTripped: saved?.circuitBreakerTripped ?? false,
    circuitBreakerThresholdPct: saved?.circuitBreakerThresholdPct ?? 5.0,
    peakEquity: saved?.peakEquity ?? startEquity,
  };
}

/** Shared LLM progress tracker — updated by chatCompletion callbacks */
export let llmProgress: { text: string; tokensReceived: number } | null = null;

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

/** Callback for LLM token streaming progress */
type OnTokenCallback = (token: string) => void;

export async function evaluateDecision(
  ticker: TickerData,
  onToken?: OnTokenCallback
): Promise<{ decision: TradingDecision; signals: Signal[] }> {
  const priceMap = new Map<string, TickerData>();
  priceMap.set(ticker.symbol, ticker);
  const result = await evaluateMultiPair(priceMap, [], onToken);
  const firstSymbol = Object.keys(result.decisions)[0];
  return {
    decision: result.decisions[firstSymbol],
    signals: result.allSignals,
  };
}

export function checkCircuitBreaker(): void {
  if (state.circuitBreakerTripped) return;

  const currentEquity = state.portfolio.equity;
  if (currentEquity > state.peakEquity) {
    state.peakEquity = currentEquity;
  }

  const drawdownPct = state.peakEquity > 0 
    ? ((state.peakEquity - currentEquity) / state.peakEquity) * 100 
    : 0;

  if (drawdownPct >= state.circuitBreakerThresholdPct) {
    state.circuitBreakerTripped = true;
    state.status = "stopped";
    state.executionReason = `BREAKER TRIPPED: Drawdown of ${drawdownPct.toFixed(2)}% exceeded limit of ${state.circuitBreakerThresholdPct}%`;
    console.warn(`[Agent] [CIRCUIT BREAKER] DRAWDOWN EXCEEDED LIMIT! Tripping circuit breaker and emergency flattening all positions.`);

    // Emergency flatten positions
    flattenPositions().then(({ closed, totalPnlRealized }) => {
      console.log(`[Agent] [CIRCUIT BREAKER] Emergency flattening complete. Closed ${closed} positions, realized PnL of $${totalPnlRealized.toFixed(2)}.`);
    }).catch(err => {
      console.error(`[Agent] [CIRCUIT BREAKER] Failed emergency flattening:`, err);
    });

    const savedPositions = state.positions.map(p => ({
      symbol: p.symbol,
      side: p.side as "long" | "short",
      size: p.size,
      entryPrice: p.entryPrice
    }));
    saveBalanceState({
      initialCash: config.initialCash,
      startCash: state.startEquity,
      cash: state.portfolio.cash,
      accumulatedRealizedPnL: state.portfolio.totalPnL,
      positions: savedPositions,
      totalTrades: state.portfolio.totalTrades,
      winRate: state.portfolio.winRate,
      circuitBreakerTripped: true,
      circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
      peakEquity: state.peakEquity,
    });
  }
}

export function resetCircuitBreaker(): void {
  state.circuitBreakerTripped = false;
  state.peakEquity = state.portfolio.equity;
  state.executionReason = "Circuit Breaker reset manually.";
  console.log(`[Agent] Circuit Breaker reset. Peak equity set to $${state.peakEquity.toFixed(2)}.`);
  
  const savedPositions = state.positions.map(p => ({
    symbol: p.symbol,
    side: p.side as "long" | "short",
    size: p.size,
    entryPrice: p.entryPrice
  }));
  saveBalanceState({
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: state.portfolio.cash,
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: savedPositions,
    totalTrades: state.portfolio.totalTrades,
    winRate: state.portfolio.winRate,
    circuitBreakerTripped: false,
    circuitBreakerThresholdPct: state.circuitBreakerThresholdPct,
    peakEquity: state.peakEquity,
  });
}

export function updateCircuitBreakerThreshold(thresholdPct: number): void {
  state.circuitBreakerThresholdPct = thresholdPct;
  console.log(`[Agent] Circuit Breaker threshold updated to ${thresholdPct}%.`);
  
  const savedPositions = state.positions.map(p => ({
    symbol: p.symbol,
    side: p.side as "long" | "short",
    size: p.size,
    entryPrice: p.entryPrice
  }));
  saveBalanceState({
    initialCash: config.initialCash,
    startCash: state.startEquity,
    cash: state.portfolio.cash,
    accumulatedRealizedPnL: state.portfolio.totalPnL,
    positions: savedPositions,
    totalTrades: state.portfolio.totalTrades,
    winRate: state.portfolio.winRate,
    circuitBreakerTripped: state.circuitBreakerTripped,
    circuitBreakerThresholdPct: thresholdPct,
    peakEquity: state.peakEquity,
  });
}

export async function runAgentCycle(onToken?: OnTokenCallback): Promise<{ decision: TradingDecision; signals: Signal[]; tickerPrice: number }> {
  if (state.circuitBreakerTripped) {
    state.status = "stopped";
    return { decision: { action: "hold", strength: 0, confidence: 0, reason: "Circuit Breaker Tripped" } as any, signals: [], tickerPrice: 0 };
  }
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

  // Setup LLM progress tracking for this cycle
  llmProgress = { text: "", tokensReceived: 0 };

  for (const [symbol, ticker] of priceMap) {
    console.log(`[Agent] ${symbol}: $${ticker.lastPrice.toLocaleString()} (${ticker.change24hPercent > 0 ? "+" : ""}${ticker.change24hPercent}% 24h)`);
  }

  const multiResult: MultiPairResult = await evaluateMultiPair(priceMap, state.positions, (token: string) => {
    if (!llmProgress) llmProgress = { text: "", tokensReceived: 0 };
    llmProgress.text += token;
    llmProgress.tokensReceived += 1;
    // Also update state for polling
    state.llmProgress = llmProgress;
  });
  
  const validatedDecisions: Record<string, TradingDecision> = {};
  let bestDecision: TradingDecision | null = null;

  for (const [symbol, decision] of Object.entries(multiResult.decisions)) {
    const ticker = priceMap.get(symbol);

    if (decision.action !== "hold" && (decision.size === undefined || decision.size === 0)) {
      if (ticker && ticker.lastPrice > 0) {
        const totalEquity = state.portfolio.equity;
        const strengthFactor = Math.abs(decision.strength);
        const allocationPct = config.orderSizePct * strengthFactor;
        decision.size = (totalEquity * allocationPct) / ticker.lastPrice;
      }
    }

    const validation = riskManager.validateDecision(decision, state.portfolio, ticker);

    let record: DecisionRecord = {
      id: `DEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date(),
      symbol,
      decision: decision,
      riskStatus: validation.isAllowed ? (validation.adjustedDecision ? "adjusted" : "approved") : "blocked",
      riskReason: validation.reason,
      originalSize: decision.size ?? 0,
      adjustedSize: validation.adjustedDecision?.size ?? 0,
      marketContext: ticker ? {
        lastPrice: ticker.lastPrice,
        change24hPercent: ticker.change24hPercent
      } : undefined,
    };

    if (validation.isAllowed) {
      const finalDecision = validation.adjustedDecision ?? decision;
      validatedDecisions[symbol] = finalDecision;
      
      if (!bestDecision || Math.abs(finalDecision.strength) > Math.abs(bestDecision.strength)) {
        bestDecision = finalDecision;
      }
    } else {
      state.executionReason = `Blocked (${symbol}): ${validation.reason}`;
    }

    // Persist the decision record
    await historyService.saveDecision(record);
  }

  state.decision = bestDecision ?? { action: "hold", strength: 0, confidence: 0, reason: "" };
  state.signals = multiResult.allSignals;

  // Execute using the helper function
  executeTrades(state, validatedDecisions, priceMap, displayTicker);

  // Check circuit breaker status after execution
  checkCircuitBreaker();

  return { decision: state.decision!, signals: state.signals, tickerPrice: displayTicker.lastPrice };
}

export function getAgentState(): AgentState {
  return { ...state };
}

export async function setAgentStatus(s: "running" | "stopped" | "paused"): Promise<{ closed?: number; realizedPnl?: number }> {
  console.log(`[Agent] Status changed to: ${s}`);
  
  if (s === "running" && state.circuitBreakerTripped) {
    throw new Error("Circuit Breaker is TRIPPED. Reset the breaker before resuming trading.");
  }
  
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

// ─── Graceful Shutdown & Crash Handlers ─────────────────

async function handleGracefulShutdown(signal: string) {
  console.log(`\n[Agent] Process received ${signal}. Clean shutdown initialized...`);
  if (state.status === "running") {
    try {
      console.log(`[Agent] Emergency flattening open positions...`);
      await setAgentStatus("stopped");
    } catch (err) {
      console.error("[Agent] Error during shutdown flattening:", err);
    }
  } else {
    marketWS.disconnect();
  }
  console.log("[Agent] Shutdown complete. Exiting.");
  process.exit(0);
}

process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));

process.on("uncaughtException", async (err) => {
  console.error("\n[Agent] CRITICAL: Uncaught Exception crash:", err);
  if (state.status === "running") {
    try {
      console.log(`[Agent] Emergency flattening open positions before crash exit...`);
      await setAgentStatus("stopped");
    } catch (flatErr) {
      console.error("[Agent] Failed to flatten during crash:", flatErr);
    }
  } else {
    marketWS.disconnect();
  }
  process.exit(1);
});
