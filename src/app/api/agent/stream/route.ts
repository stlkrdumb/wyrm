import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

import type { NextRequest } from "next/server";
import { agentEvents, type PricePayload } from "@/features/trading-agent/services/agent-events";

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
        } catch {
          // Stream closed mid-flight — silently bail
        }
      };

      write("hello", { timestamp: Date.now() });

      const onPrice = (payload: PricePayload) => {
        write("price", payload);
      };

      agentEvents.onPrice(onPrice);

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
        agentEvents.offPrice(onPrice);
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
        try { controller.close(); } catch { /* already closed */ }
      };

      req.signal.addEventListener("abort", cleanup, { once: true });
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