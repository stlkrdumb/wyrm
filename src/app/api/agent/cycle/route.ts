import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle, getAgentState, setAgentStatus } from "@/features/trading-agent/services/agent-engine";

const INITIAL_CASH = Number(process.env.SIM_INITIAL_CASH) || 100000;

export async function POST() {
  try {
    console.log(`[API] OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL}`);
    console.log(`[API] LLM_MODEL=${process.env.LLM_MODEL}`);
    console.log(`[API] API_KEY=${process.env.OPENAI_API_KEY ? '***' + process.env.OPENAI_API_KEY.slice(-4) : 'MISSING'}`);
    console.log("[API] POST /api/agent/cycle — running agent cycle");
    const result = await runAgentCycle();
    return NextResponse.json({ status: "success", ticker: result.tickerPrice, decision: result.decision });
  } catch (error) {
    console.error("[API] POST error:", error);
    return NextResponse.json({ status: "error", message: String(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const currentState = getAgentState();
  console.log(`[API] GET /api/agent/cycle — status=${currentState.status} equity=$${Math.round(currentState.portfolio.equity).toLocaleString()}`);

  return NextResponse.json({
    status: currentState.status,
    lastCycleAt: currentState.lastCycleAt?.toISOString() ?? null,
    ticker: currentState.ticker ? {
      symbol: currentState.ticker.symbol,
      lastPrice: Math.round(currentState.ticker.lastPrice),
      high24h: Math.round(currentState.ticker.high24h),
      low24h: Math.round(currentState.ticker.low24h),
      volume24h: currentState.ticker.volume24h,
      change24hPercent: currentState.ticker.change24hPercent,
    } : null,
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
    positions: currentState.positions.map((p) => ({
      symbol: p.symbol, side: p.side, size: p.size,
      entryPrice: p.entryPrice, unrealizedPnL: p.unrealizedPnL,
    })),
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
