import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

import type { NextRequest } from "next/server";
import { agentEvents, type EquityEvent, type PositionEvent, type PositionClosedEvent, type PriceEvent, type TradeEvent } from "@/features/trading-agent/services/agent-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 15_000;

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const write = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (err) {
          // Stream closed mid-flight — silently bail
          console.warn("[SSE] Write failed:", err instanceof Error ? err.message : String(err));
        }
      };

      // Initial hello so the client knows we're connected
      write("hello", { timestamp: Date.now() });

      const onEquity = (e: EquityEvent) => write("equity", e);
      const onPosition = (e: PositionEvent) => write("position", e);
      const onPositionClosed = (e: PositionClosedEvent) => write("position_closed", e);
      const onPrice = (e: PriceEvent) => write("price", e);
      const onTrade = (e: TradeEvent) => write("trade", e);

      agentEvents.on("equity", onEquity);
      agentEvents.on("position", onPosition);
      agentEvents.on("position_closed", onPositionClosed);
      agentEvents.on("price", onPrice);
      agentEvents.on("trade", onTrade);

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
        } catch {
          // Stream closed — heartbeat will be cleared in cancel()
        }
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        agentEvents.off("equity", onEquity);
        agentEvents.off("position", onPosition);
        agentEvents.off("position_closed", onPositionClosed);
        agentEvents.off("price", onPrice);
        agentEvents.off("trade", onTrade);
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
        try { controller.close(); } catch { /* already closed */ }
      };

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
