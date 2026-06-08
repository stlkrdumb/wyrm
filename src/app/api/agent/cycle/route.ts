import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle, getAgentState, setAgentStatus } from "@/features/trading-agent/services/agent-engine";
import { priceStore } from "@/features/trading-agent/services/price-store";

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
    const tickersMap: Record<string, ReturnType<typeof buildTickerObj>> = {};
    for (const [symbol, snapshot] of allSnapshots) {
      const obj = buildTickerObj(snapshot);
      if (obj) tickersMap[symbol] = obj;
    }

    let wsStatus: "connected" | "connecting" | "reconnecting" = "connected";
    if (allSnapshots.size === 0) wsStatus = "reconnecting";

    return NextResponse.json({
      status: "success",
      ticker: result.tickerPrice,
      tickers: Object.keys(tickersMap).length > 0 ? tickersMap : null,
      wsStatus,
    });
  } catch (error) {
    console.error("[API] POST error:", error);
    return NextResponse.json({ status: "error", message: String(error) }, { status: 500 });
  }
}

function buildTickerObj(snapshot: { lastPrice?: number; high24h?: number; low24h?: number; quoteVolume?: number; changePercent?: number; symbol: string; updatedAt?: Date } | undefined) {
  if (!snapshot || !snapshot.lastPrice) return null;
  return {
    symbol: snapshot.symbol,
    lastPrice: Math.round(snapshot.lastPrice),
    high24h: Math.round(snapshot.high24h ?? snapshot.lastPrice),
    low24h: Math.round(snapshot.low24h ?? snapshot.lastPrice),
    volume24h: snapshot.quoteVolume ?? 0,
    change24hPercent: snapshot.changePercent ?? 0,
  };
}

export async function GET(request: NextRequest) {
  const currentState = getAgentState();

  // Build multi-pair ticker map from PriceStore (WS-backed)
  const allSnapshots = priceStore.getAll();
  const tickersMap: Record<string, ReturnType<typeof buildTickerObj>> = {};
  for (const [symbol, snapshot] of allSnapshots) {
    const obj = buildTickerObj(snapshot);
    if (obj) tickersMap[symbol] = obj;
  }

  // Determine WS status from store freshness
  let wsStatus: "connected" | "connecting" | "reconnecting" = "connected";
  if (allSnapshots.size === 0) {
    wsStatus = currentState.lastCycleAt ? "reconnecting" : "connecting";
  } else {
    const isAnyStale = [...allSnapshots.values()].some(s =>
      Date.now() - s.updatedAt.getTime() > 65_000
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
      if (p.side === "long") {
        unrealizedPnL = Math.round((livePrice - p.entryPrice) * p.size);
      } else {
        unrealizedPnL = Math.round((p.entryPrice - livePrice) * p.size);
      }
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
    ticker: buildTickerObj(currentState.ticker ?? undefined),
    tickers: Object.keys(tickersMap).length > 0 ? tickersMap : null,
    wsStatus,
    decision: currentState.decision ? {
      action: currentState.decision.action,
      strength: currentState.decision.strength,
      confidence: currentState.decision.confidence,
      reason: currentState.decision.reason,
    } : null,
    executionReason: currentState.executionReason,
    signals: currentState.signals.map((s) => ({
      name: s.name, source: s.source, direction: s.direction, strength: s.strength,
    })),
    portfolio: {
      cash: Math.round(currentState.portfolio.cash),
      equity: Math.round(currentState.portfolio.equity),
      initialCash: currentState.portfolio.initialCash,
      totalTrades: currentState.portfolio.totalTrades,
      winRate: currentState.portfolio.winRate,
      totalPnL: Math.round(currentState.portfolio.totalPnL),
    },
    positions: livePositions,
    trades: currentState.trades.map((t) => ({
      id: t.id, timestamp: t.timestamp.toISOString(), symbol: t.symbol, side: t.side,
      action: t.action, size: t.size, price: Math.round(t.price), pnl: t.pnl ?? null,
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
