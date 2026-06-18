import { NextResponse } from "next/server";
import { closePosition } from "@/features/trading-agent/services/agent-engine";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol } = body;

    if (!symbol) {
      return NextResponse.json({ status: "error", message: "Missing symbol parameter" }, { status: 400 });
    }

    const success = closePosition(symbol);
    if (!success) {
      return NextResponse.json({ status: "error", message: `No active position found for ${symbol}` }, { status: 404 });
    }

    return NextResponse.json({ status: "success", message: `Position for ${symbol} manually closed successfully` });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Failed to close position" },
      { status: 500 }
    );
  }
}
