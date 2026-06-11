import { NextResponse } from "next/server";
import { resetCircuitBreaker, updateCircuitBreakerThreshold } from "@/features/trading-agent/services/agent-engine";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, thresholdPct } = body;

    if (action === "reset") {
      resetCircuitBreaker();
      return NextResponse.json({ status: "success", message: "Circuit breaker reset successfully" });
    }

    if (action === "updateThreshold") {
      if (typeof thresholdPct !== "number" || thresholdPct <= 0 || thresholdPct > 100) {
        return NextResponse.json({ status: "error", message: "Invalid threshold percentage" }, { status: 400 });
      }
      updateCircuitBreakerThreshold(thresholdPct);
      return NextResponse.json({ status: "success", message: "Circuit breaker threshold updated successfully" });
    }

    return NextResponse.json({ status: "error", message: "Invalid action" }, { status: 400 });
  } catch (_error: unknown) {
    const error = _error as Error;
    return NextResponse.json(
      { status: "error", message: error.message || "Failed to process breaker action" },
      { status: 500 }
    );
  }
}
