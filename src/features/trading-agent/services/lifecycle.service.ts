import { marketWS } from "./market-ws.service";
import type { AgentState } from "@/features/trading-agent/services/state-store";

let intervalId: ReturnType<typeof setInterval> | null = null;

export function createTimer(onCycle: () => void): { getIntervalId: () => ReturnType<typeof setInterval> | null } {
  return {
    getIntervalId() { return intervalId; },
  };
}

function ensureInterval(onCycle: () => void) {
  if (intervalId) return;
  console.log("[Agent] Timer started — running cycle every 3 seconds");
  intervalId = setInterval(() => {
    onCycle();
  }, 3000);
}

function stopInterval() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log("[Agent] Timer manually stopped");
}

export async function handleGracefulShutdown(
  state: AgentState,
  onFlatten: () => Promise<number>,
  signal: string
): Promise<void> {
  console.log(`\n[Agent] Process received ${signal}. Clean shutdown initialized...`);
  
  if (state.status === "running") {
    try {
      console.log(`[Agent] Emergency flattening open positions...`);
      await marketWS.disconnect();
      await onFlatten();
    } catch (err) {
      console.error("[Agent] Error during shutdown flattening:", err);
    }
  } else {
    marketWS.disconnect();
  }
  console.log("[Agent] Shutdown complete. Exiting.");
  process.exit(0);
}

export function createCrashHandler(
  state: AgentState,
  onFlatten: () => Promise<number>,
  disconnect: () => void
): void {
  if (typeof process !== "undefined") {
    process.on("SIGINT", async () => handleGracefulShutdown(state, onFlatten, "SIGINT"));
    process.on("SIGTERM", async () => handleGracefulShutdown(state, onFlatten, "SIGTERM"));

    process.on("uncaughtException", async (err) => {
      console.error("\n[Agent] CRITICAL: Uncaught Exception crash:", err);
      if (state.status === "running") {
        try {
          console.log(`[Agent] Emergency flattening open positions before crash exit...`);
          await disconnect();
        } catch (flatErr) {
          console.error("[Agent] Failed to flatten during crash:", flatErr);
        }
      } else {
        disconnect();
      }
      process.exit(1);
    });
  }
}
