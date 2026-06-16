import { config } from "../agent-engine";
import { getAgentState } from "../agent-engine";

/**
 * Manages the agent cycle timer — runs agentCycleHandler periodically
 * with warmup delay, timeout protection, and skip-on-inflight logic.
 */
export class CycleScheduler {
  private cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private cycleInFlight = false;
  private agentCycleHandler: (() => Promise<void>) | null = null;

  setAgentCycleHandler(handler: () => Promise<void>): void {
    this.agentCycleHandler = handler;
    if (!this.cycleTimer) {
      const warmupMs = 20_000;
      const intervalMs = config.cycleIntervalMs;
      console.log(`[WS] Agent cycle timer started (warmup ${warmupMs / 1000}s, every ${(intervalMs / 1000).toFixed(0)}s)`);
      this.scheduleNextCycle(warmupMs);
    }
  }

  stopAgentCycles(): void {
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.cycleInFlight = false;
    this.agentCycleHandler = null;
    console.log("[WS] Agent cycle timer stopped");
  }

  private scheduleNextCycle(delayMs: number): void {
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
    this.cycleTimer = setTimeout(() => {
      this.cycleTimer = null;
      this.runCycle();
    }, delayMs);
  }

  private async runCycle(): Promise<void> {
    if (this.cycleInFlight) {
      console.warn("[WS] Cycle still in flight — skipping this tick");
      this.scheduleNextCycle(config.cycleIntervalMs);
      return;
    }
    if (!this.agentCycleHandler) return;

    this.cycleInFlight = true;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        this.agentCycleHandler(),
        new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => reject(new Error("Cycle timed out after 90s")), 90_000);
        }),
      ]);
    } catch (err) {
      console.error("[AGENT CYCLE] Cycle failed or timed out:", err instanceof Error ? err.message : String(err));
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      this.cycleInFlight = false;
    }

    const intervalMs = config.cycleIntervalMs;
    const nextDelay = Math.max(intervalMs, 1000);
    this.scheduleNextCycle(nextDelay);
  }
}
