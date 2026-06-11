import { NextRequest, NextResponse } from "next/server";
import { resetBalanceState, type PortfolioState } from "@/features/trading-agent/services/balance-store";
import { setAgentStatus } from "@/features/trading-agent/services/agent-engine";

export async function POST(_request: NextRequest) { // eslint-disable-line @typescript-eslint/no-unused-vars
  try {
    const initialCash = Number(process.env.SIM_INITIAL_CASH) || 1000;

    // Stop agent first if running
    await setAgentStatus("stopped");

    // Reset state from scratch
    resetBalanceState(initialCash);

    const fresh: PortfolioState = {
      initialCash,
      startCash: initialCash,
      cash: initialCash,
      accumulatedRealizedPnL: 0,
      positions: [],
      pendingOrders: [],
      trades: [],
      totalTrades: 0,
      winRate: 0,
    };

    return NextResponse.json({ ok: true, state: fresh });
  } catch (err) {
    console.error("[Reset] Failed:", err);
    return NextResponse.json(
      { error: "Failed to reset balance", details: String(err) },
      { status: 500 }
    );
  }
}
