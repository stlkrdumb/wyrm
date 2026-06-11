import { NextResponse } from "next/server";
import { strategyService } from "@/features/trading-agent/services/strategy.service";

export async function GET() {
  try {
    const strategy = strategyService.getStrategy();
    return NextResponse.json(strategy);
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      { status: "error", message: err.message || "Failed to load strategy" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.persona || !body.customInstructions) {
      return NextResponse.json({ status: "error", message: "Persona and Custom Instructions are required" }, { status: 400 });
    }
    strategyService.saveStrategy({
      persona: body.persona,
      customInstructions: body.customInstructions,
      circuitBreakerThresholdPct: body.circuitBreakerThresholdPct ?? 10,
    });
    return NextResponse.json({ status: "success", message: "Strategy updated successfully" });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      { status: "error", message: err.message || "Failed to save strategy" },
      { status: 500 }
    );
  }
}
