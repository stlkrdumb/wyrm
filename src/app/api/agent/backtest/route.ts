import { backtestService } from "@/features/trading-agent/services/backtest-service";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { initialEquity } = await req.json();
    
    // Run backtest with user-specified initial equity
    const result = await backtestService.runBacktest(initialEquity);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Error running backtest:", error);
    return NextResponse.json({ error: "Failed to run backtest" }, { status: 500 });
  }
}
