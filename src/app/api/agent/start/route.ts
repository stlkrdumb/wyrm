import { NextResponse } from "next/server";
import { marketWS } from "@/features/trading-agent/services/market-ws.service";

export async function POST() {
  try {
    const initialized = await marketWS.initialize();
    return NextResponse.json({
      status: "ok",
      wsStatus: marketWS.getConnectionInfo().type,
    });
  } catch (err: any) {
    console.error("[Agent] WS initialization failed:", err.message);
    return NextResponse.json(
      { status: "error", message: err.message },
      { status: 500 }
    );
  }
}
