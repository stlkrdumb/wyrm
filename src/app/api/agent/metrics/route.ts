import { NextResponse } from "next/server";
import { getAgentState } from "@/features/trading-agent/services/agent-engine";
import { metricsService } from "@/features/trading-agent/services/metrics.service";

export async function GET(): Promise<NextResponse> {
  try {
    const state = getAgentState();
    const metrics = metricsService.getMetrics(state);
    return NextResponse.json({ status: "success", data: metrics });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Metrics API] Error: ${errMsg}`);
    return NextResponse.json(
      { status: "error", message: "Failed to collect metrics" },
      { status: 500 }
    );
  }
}