import { NextResponse } from "next/server";
import { newsService } from "@/features/trading-agent/services/news.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 10;
    
    const news = await newsService.getLatestNews(limit);
    return NextResponse.json({
      status: "success",
      data: news,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Failed to load news" },
      { status: 500 }
    );
  }
}
