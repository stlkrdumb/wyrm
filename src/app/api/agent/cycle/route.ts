import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle, getAgentState, setAgentStatus, llmProgress } from "@/features/trading-agent/services/agent-engine";
import { priceStore } from "@/features/trading-agent/services/price-store";
import { marketWS } from "@/features/trading-agent/services/market-ws.service";
import { WS_STALENESS_THRESHOLD_MS } from "@/features/trading-agent/constants/config.constants";

const INITIAL_CASH = Number(process.env.SIM_INITIAL_CASH) || 1000;

export async function POST() {
  try {
    const currentState = getAgentState();

    if (currentState.status !== "running") {
      return NextResponse.json({ 
        status: "info", 
        message: "Agent is not in running state. Call PUT /api/agent/cycle?status=running first.", 
        currentStatus: currentState.status 
      });
    }

    console.log(`[API] POST /api/agent/cycle — MODEL=${process.env.LLM_MODEL} API_KEY=${process.env.OPENAI_API_KEY ? 'configured' : 'MISSING'}`);

    const result = await runAgentCycle();
    marketWS.syncSubscriptionsForPositions();

    const allSnapshots = priceStore.getAll();
    const tickersMap: Record<string, any> = {};
    for (const [symbol, snapshot] of allSnapshots) {
      const obj = priceStore.buildTickerObj(snapshot);
      if (obj) tickersMap[symbol] = obj;
    }

    let wsStatus: "connected" | "connecting" | "reconnecting" = "connected";
    if (allSnapshots.size === 0) wsStatus = "reconnecting";

    console.log("[POST /api/agent/cycle] Cycle complete — decision:", currentState.decision?.action, "signals:", currentState.signals.length);

    return NextResponse.json({
      status: "success",
      ticker: result.tickerPrice,
      tickers: Object.keys(tickersMap).length > 0 ? tickersMap : null,
      wsStatus,
      wsConnection: marketWS.getConnectionInfo(),
      decision: currentState.decision,
      signals: currentState.signals.map(s => ({ name: s.name, source: s.source, direction: s.direction, strength: s.strength })),
    watchlist: currentState.watchlist || [],
    equityHistory: (currentState.equityHistory || []).map(e => ({
      timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
      equity: e.equity,
    })),
    });
  } catch (error: any) {
    console.error("[API] CRITICAL ERROR in POST /api/agent/cycle:", error);
    return NextResponse.json({ 
      status: "error", 
      message: error.message || "Internal Server Error",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const currentState = getAgentState();

  // Build multi-pair ticker map from PriceStore (WS-backed)
  const allSnapshots = priceStore.getAll();
  const tickersMap: Record<string, any> = {};
  for (const [symbol, snapshot] of allSnapshots) {
    const obj = priceStore.buildTickerObj(snapshot);
    if (obj) tickersMap[symbol] = obj;
  }

  // Determine WS status from store freshness
  let wsStatus: "connected" | "connecting" | "reconnecting" = "connected";
  if (allSnapshots.size === 0) {
    wsStatus = currentState.lastCycleAt ? "reconnecting" : "connecting";
  } else {
    const isAnyStale = [...allSnapshots.values()].some(s =>
      Date.now() - s.updatedAt.getTime() > WS_STALENESS_THRESHOLD_MS
    );
    if (isAnyStale) wsStatus = "reconnecting";
  }

  console.log(`[API] GET /api/agent/cycle — status=${currentState.status} equity=$${Math.round(currentState.portfolio.equity).toLocaleString()} symbols=${Object.keys(tickersMap).join(",")}`);

  // Build positions with live unrealized PnL from PriceStore (most current data)
  const livePositions = currentState.positions.map((p) => {
    const symSnapshot = allSnapshots.get(p.symbol);
    const livePrice = symSnapshot?.lastPrice ?? tickersMap[p.symbol]?.lastPrice;

    let unrealizedPnL: number;
    if (livePrice && p.entryPrice > 0) {
      unrealizedPnL = (livePrice - p.entryPrice) * p.size;
    } else {
      // No live price — use stored value as fallback
      unrealizedPnL = p.unrealizedPnL;
    }

    return {
      symbol: p.symbol,
      side: p.side,
      size: p.size,
      entryPrice: p.entryPrice,
      unrealizedPnL,
      stopLossPct: p.stopLossPct,
      takeProfitPct: p.takeProfitPct,
    };
  });

  // Fix the ticker mapping to handle TickerData vs PriceSnapshot correctly
  let tickerObj = null;
  if (currentState.ticker) {
    tickerObj = priceStore.buildTickerObj({
      symbol: currentState.ticker.symbol,
      lastPrice: currentState.ticker.lastPrice,
      high24h: currentState.ticker.high24h,
      low24h: currentState.ticker.low24h,
      baseVolume: 0,
      quoteVolume: 0,
      changePercent: currentState.ticker.change24hPercent ?? 0,
      updatedAt: new Date(),
    });
  }

  // Recalculate equity live from positions × cached prices
  const liveEquity = currentState.portfolio.cash +
    livePositions.reduce((sum, p) => sum + p.size * p.entryPrice + p.unrealizedPnL, 0);

  return NextResponse.json({
    status: currentState.status,
    lastCycleAt: currentState.lastCycleAt?.toISOString() ?? null,
    ticker: tickerObj,
    tickers: Object.keys(tickersMap).length > 0 ? tickersMap : null,
    wsStatus,
    wsConnection: marketWS.getConnectionInfo(),
    decision: currentState.decision ? {
      action: currentState.decision.action,
      strength: currentState.decision.strength,
      confidence: currentState.decision.confidence,
      reason: currentState.decision.reason,
      riskStatus: currentState.decision.riskStatus || "approved",
    } : null,
    signals: currentState.signals.map((s) => ({
      name: s.name, source: s.source, direction: s.direction, strength: s.strength,
    })),
    portfolio: {
      cash: currentState.portfolio.cash,
      equity: liveEquity,
      initialCash: currentState.portfolio.initialCash,
      totalTrades: currentState.portfolio.totalTrades,
      winRate: currentState.portfolio.winRate,
      totalPnL: liveEquity - currentState.startEquity,
    },
    positions: livePositions,
    trades: currentState.trades.map((t) => ({
      id: t.id, timestamp: t.timestamp.toISOString(), symbol: t.symbol, side: t.side,
      action: t.action, size: t.size, price: t.price, pnl: t.pnl ?? null, fee: t.fee ?? null,
    })),
    llmProgress: llmProgress || currentState.llmProgress || null,
    circuitBreakerTripped: currentState.circuitBreakerTripped,
    circuitBreakerThresholdPct: currentState.circuitBreakerThresholdPct,
    peakEquity: currentState.peakEquity,
    modelName: currentState.modelName,
    decisionSource: currentState.decisionSource ?? null,
    watchlist: currentState.watchlist || [],
    logs: (currentState.logs || []).map(l => ({
      timestamp: l.timestamp instanceof Date ? l.timestamp.toISOString() : l.timestamp,
      level: l.level,
      message: l.message,
    })),
    equityHistory: (currentState.equityHistory || []).map(e => ({
      timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
      equity: e.equity,
    })),
  });
}

export async function PUT(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const statusParam = searchParams.get("status");

  // Reload .env.local to ensure fresh env vars for WS subscriptions
  dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

  console.log(`[API] PUT /api/agent/cycle?status=${statusParam}`);

  if (!["running", "stopped", "paused"].includes(statusParam as string)) {
    return NextResponse.json({ status: "error", message: "Invalid status" }, { status: 400 });
  }

  // Set agent status before lifecycle management
  const result = await setAgentStatus(statusParam as "running" | "stopped" | "paused");

  if (statusParam === "running") {
    // Initialize WS and start auto-cycling interval
    await marketWS.initialize();
    
    // Register the cycle handler for the periodic interval
    marketWS.setAgentCycleHandler(async () => {
      if (getAgentState().status === "running") {
        try {
          const initResult = await runAgentCycle();
          marketWS.syncSubscriptionsForPositions();
          console.log("[AGENT CYCLE] LLM analysis done — ticker price:", initResult.tickerPrice,
            "signals:", getAgentState().signals.length);
        } catch (err) {
          console.error("[AGENT CYCLE] Cycle failed:", err instanceof Error ? err.message : String(err));
        }
      }
    });
    
    // Warmup delay before first cycle — let WS data settle
    console.log("[AGENT CYCLE] Warming up — first cycle in 20s");
    setTimeout(async () => {
      if (getAgentState().status !== "running") {
        console.log("[AGENT CYCLE] Warmup aborted — agent no longer running");
        return;
      }
      const initResult = await runAgentCycle();
      marketWS.syncSubscriptionsForPositions();
      console.log("[PUT /api/agent/cycle] Agent started — initial cycle done, ticker price:", initResult.tickerPrice);
    }, 20_000);
  } else {
    // Stop auto-cycling for stopped/paused states
    marketWS.stopAgentCycles();
    if (statusParam === "stopped") {
      console.log("[AGENT CYCLE] Auto-cycling stopped");
    }
    
    // Close positions on stop/pause
    if (result.closed) {
      console.log(`[AGENT CYCLE] ${statusParam} — closed ${result.closed} position(s), PnL: $${result.realizedPnl}`);
    }
  }

  const current = getAgentState();

  return NextResponse.json({
    status: "ok",
    currentStatus: current.status,
    ...(result.closed ? { closed: result.closed, realizedPnl: result.realizedPnl } : {}),
  });
}
