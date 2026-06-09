import { historyService } from "@/features/trading-agent/services/history-service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    let history = await historyService.getHistory();
    if (symbol) {
      history = await historyService.getHistoryBySymbol(symbol);
    }
    return NextResponse.json(history);
  } catch (error) {
    console.error("[API] Error fetching history:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
