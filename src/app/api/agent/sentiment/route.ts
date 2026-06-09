import { NextResponse } from "next/server";
import { sentimentService } from "@/features/trading-agent/services/sentiment.service";
import { DEFAULT_SYMBOLS } from "@/features/trading-agent/constants/symbols.constants";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolParam = searchParams.get("symbol");

    const symbols = symbolParam ? [symbolParam.toUpperCase()] : Array.from(DEFAULT_SYMBOLS);
    
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const sentiment = await sentimentService.getSentiment(symbol);
          return { symbol, sentiment };
        } catch (err) {
          console.warn(`[API sentiment] Error for ${symbol}:`, err);
          return {
            symbol,
            sentiment: {
              symbol,
              fearAndGreedValue: 50,
              fearAndGreedClassification: "Neutral (Fallback)",
              longShortRatio: 1.0,
              longRatio: 0.5,
              shortRatio: 0.5,
              fundingRate: 0.0,
              openInterest: 0.0,
              timestamp: new Date(),
            }
          };
        }
      })
    );

    return NextResponse.json({
      status: "success",
      data: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
