import { NextResponse } from "next/server";
import { strategyService } from "@/features/trading-agent/services/strategy.service";

export async function GET() {
  try {
    const strategy = strategyService.getStrategy();
    return NextResponse.json(strategy);
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Failed to load strategy" },
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
    });
    return NextResponse.json({ status: "success", message: "Strategy updated successfully" });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Failed to save strategy" },
      { status: 500 }
    );
  }
}
