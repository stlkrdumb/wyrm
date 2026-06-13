import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { api } from "./api.mjs";
import { print } from "./output.mjs";

async function loadJsonFile(path) {
  const raw = await readFile(resolve(path), "utf-8");
  return JSON.parse(raw);
}

async function strategySet(ctx, flags) {
  let body;
  if (flags.file) {
    body = await loadJsonFile(flags.file);
  } else {
    if (!flags.persona || !flags.instructions) {
      throw new Error("strategy-set requires --file or both --persona and --instructions");
    }
    body = {
      persona: flags.persona,
      customInstructions: flags.instructions,
      circuitBreakerThresholdPct: Number(flags.circuitBreakerThresholdPct ?? flags.pct ?? 10),
      orderSizePct: Number(flags.orderSizePct ?? 0.05),
      stopLossPct: Number(flags.stopLossPct ?? 5),
      takeProfitPct: Number(flags.takeProfitPct ?? 10),
      cycleIntervalMs: Number(flags.cycleIntervalMs ?? 30000),
      maxActivePositions: Number(flags.maxActivePositions ?? 3),
      convictionThreshold: Number(flags.convictionThreshold ?? 0.3),
    };
  }
  print(await api(ctx, "POST", "/api/agent/strategy", body), flags.raw);
}

async function stream(ctx, flags) {
  const url = `${ctx.baseUrl}/api/agent/stream`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${ctx.token}`, Accept: "text/event-stream" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stream failed: HTTP ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  process.on("SIGINT", () => {
    reader.cancel().catch(() => {});
    process.exit(0);
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let event = null;
    let payload = "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        payload = line.slice(5).trim();
      } else if (line.trim() === "" && event) {
        if (flags.raw) {
          console.log(JSON.stringify({ event, data: payload }));
        } else {
          try {
            console.log(`[${event}]`, JSON.stringify(JSON.parse(payload), null, 2));
          } catch {
            console.log(`[${event}]`, payload);
          }
        }
        event = null;
        payload = "";
      }
    }
  }
}

export async function runCommand(ctx, command, flags) {
  switch (command) {
    case "status":
      print(await api(ctx, "GET", "/api/agent/cycle"), flags.raw);
      break;
    case "start":
      print(await api(ctx, "PUT", "/api/agent/cycle?status=running"), flags.raw);
      break;
    case "pause":
      print(await api(ctx, "PUT", "/api/agent/cycle?status=paused"), flags.raw);
      break;
    case "stop":
      print(await api(ctx, "PUT", "/api/agent/cycle?status=stopped"), flags.raw);
      break;
    case "cycle":
      print(await api(ctx, "POST", "/api/agent/cycle"), flags.raw);
      break;
    case "ws-start":
      print(await api(ctx, "POST", "/api/agent/start"), flags.raw);
      break;
    case "stream":
      await stream(ctx, flags);
      break;
    case "config":
      print(await api(ctx, "GET", "/api/agent/config"), flags.raw);
      break;
    case "sentiment": {
      const symbol = flags.symbol ? `?symbol=${encodeURIComponent(flags.symbol)}` : "";
      print(await api(ctx, "GET", `/api/agent/sentiment${symbol}`), flags.raw);
      break;
    }
    case "history": {
      const symbol = flags.symbol ? `?symbol=${encodeURIComponent(flags.symbol)}` : "";
      print(await api(ctx, "GET", `/api/agent/history${symbol}`), flags.raw);
      break;
    }
    case "news": {
      const limit = flags.limit ? `?limit=${Number(flags.limit)}` : "";
      print(await api(ctx, "GET", `/api/agent/news${limit}`), flags.raw);
      break;
    }
    case "strategy":
      print(await api(ctx, "GET", "/api/agent/strategy"), flags.raw);
      break;
    case "strategy-set":
      await strategySet(ctx, flags);
      break;
    case "breaker-reset":
      print(await api(ctx, "POST", "/api/agent/breaker", { action: "reset" }), flags.raw);
      break;
    case "breaker-threshold": {
      const pct = Number(flags.pct);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        throw new Error("breaker-threshold requires -p/--pct between 1 and 100");
      }
      print(await api(ctx, "POST", "/api/agent/breaker", { action: "updateThreshold", thresholdPct: pct }), flags.raw);
      break;
    }
    case "backtest": {
      const equity = Number(flags.equity ?? 1000);
      print(await api(ctx, "POST", "/api/agent/backtest", { initialEquity: equity }), flags.raw);
      break;
    }
    case "reset":
      print(await api(ctx, "POST", "/api/agent/reset"), flags.raw);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
