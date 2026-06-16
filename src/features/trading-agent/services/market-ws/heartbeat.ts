import { WebSocket as WSClient } from "ws";

export class HeartbeatManager {
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  start(ws: WSClient | null): void {
    this.stop();
    this.pingTimer = setInterval(() => {
      if (ws?.readyState === WSClient.OPEN) {
        try { ws.send("ping"); } catch (err) { console.warn("[WS] Ping send failed:", err instanceof Error ? err.message : String(err)); }
      } else {
        this.stop();
      }
    }, 30_000);
  }

  stop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
