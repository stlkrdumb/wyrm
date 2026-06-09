import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle, getAgentState, setAgentStatus } from "@/features/trading-agent/services/agent-engine";
import { priceStore } from "@/features/trading-agent/services/price-store";
import { marketWS } from "@/features/trading-agent/services/market-ws.service";
import { WS_STALENESS_THRESHOLD_MS } from "@/features/trading-agent/constants/config.constants";

const INITIAL_CASH = Number(process.env.SIM_INITIAL_CASH) || 1000;

export async function POST() {
  try {
    console.log(`[API] OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL}`);
    console.log(`[API] LLM_MODEL=${process.env.LLM_MODEL}`);
    console.log(`[API] API_KEY=${process.env.OPENAI_API_KEY ? '***' + process.env.OPENAI_API_KEY.slice(-4) : 'MISSING'}`);
    console.log("[API] POST /api/agent/cycle — running agent cycle");
    
    const result = await runAgentCycle();

    // Also return current tickers and WS status after the cycle completes
    const allSnapshots = priceStore.getAll();
    const tickersMap: Record<string, any> = {};
    for (const [symbol, snapshot] of allSnapshots) {
      const obj = priceStore.buildTickerObj(snapshot);
      if (obj) tickersMap[symbol] = obj;
    }

    let wsStatus: "connected" | "connecting" | "reconnecting" = "connected";
    if (allSnapshots.size === 0) wsStatus = "reconnecting";

    return NextResponse.json({
      status: "success",
      ticker: result.tickerPrice,
      tickers: Object.keys(tickersMap).length > 0 ? tickersMap : null,
      wsStatus,
      wsConnection: marketWS.getConnectionInfo(),
    });
  } catch (error: any) {
    console.error("[API] CRITICAL ERROR in POST /api/agent/cycle:", error);
    console.error("[API] Stack Trace:", error.stack);
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
    };
  });

  return NextResponse.json({
    status: currentState.status,
    lastCycleAt: currentState.lastCycleAt?.toISOString() ?? null,
    ticker: priceStore.buildTickerObj(currentState.ticker ?? undefined),
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
    executionReason: currentState.executionReason,
    signals: currentState.signals.map((s) => ({
      name: s.name, source: s.source, direction: s.direction, strength: s.strength,
    })),
    portfolio: {
      cash: currentState.portfolio.cash,
      equity: currentState.portfolio.equity,
      initialCash: currentState.portfolio.initialCash,
      totalTrades: currentState.portfolio.totalTrades,
      winRate: currentState.portfolio.winRate,
      totalPnL: currentState.portfolio.totalPnL,
    },
    positions: livePositions,
    trades: currentState.trades.map((t) => ({
      id: t.id, timestamp: t.timestamp.toISOString(), symbol: t.symbol, side: t.side,
      action: t.action, size: t.size, price: t.price, pnl: t.pnl ?? null,
    })),
  });
}

export async function PUT(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const statusParam = searchParams.get("status");
  console.log(`[API] PUT /api/agent/cycle?status=${statusParam}`);

  if (!["running", "stopped", "paused"].includes(statusParam as string)) {
    return NextResponse.json({ status: "error", message: "Invalid status" }, { status: 400 });
  }

  const result = await setAgentStatus(statusParam as "running" | "stopped" | "paused");
  const current = getAgentState();

  return NextResponse.json({
    status: "ok",
    currentStatus: current.status,
    ...(result.closed ? { closed: result.closed, realizedPnl: result.realizedPnl } : {}),
  });
}
