import express from "express";
import cors from "cors";
import http from "node:http";
import dotenv from "dotenv";
import path from "node:path";

// Load local environment variables
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

import { runAgentCycle, getAgentState, setAgentStatus, resetInMemoryState, llmProgress, resetCircuitBreaker, updateCircuitBreakerThreshold } from "./agent-engine";
import { priceStore } from "./price-store";
import { marketWS } from "./market-ws.service";
import { WS_STALENESS_THRESHOLD_MS } from "../constants/config.constants";
import { sentimentService } from "./sentiment.service";
import { DEFAULT_SYMBOLS } from "../constants/symbols.constants";
import { strategyService } from "./strategy.service";
import { newsService } from "./news.service";
import { resetBalanceState } from "./balance-store";
import { historyService } from "./history-service";
import { backtestService } from "./backtest-service";
import { agentEvents } from "./agent-events";

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[Backend REST] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms) (Origin: ${req.headers.origin || "none"})`);
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(express.json());

// Bearer Token Middleware
const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || "wyrm-hackathon-demo-2026";
app.use((req, res, next) => {
  // Allow browser preflight OPTIONS requests to bypass Bearer check
  if (req.method === "OPTIONS") {
    return next();
  }

  if (AUTH_TOKEN) {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string;
    
    let token = "";
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (queryToken) {
      token = queryToken;
    }

    if (!token || token !== AUTH_TOKEN) {
      return res.status(401).json({ status: "error", message: "Unauthorized: Invalid or missing token" });
    }
  }
  next();
});

// GET /api/agent/config
app.get("/api/agent/config", (req, res) => {
  const INITIAL_CASH = Number(process.env.SIM_INITIAL_CASH) || 1000;
  res.json({ initialCash: INITIAL_CASH });
});

// POST /api/agent/cycle
app.post("/api/agent/cycle", async (req, res) => {
  try {
    const currentState = getAgentState();
    if (currentState.status !== "running") {
      return res.json({ 
        status: "info", 
        message: "Agent is not in running state. Call PUT /api/agent/cycle?status=running first.", 
        currentStatus: currentState.status 
      });
    }

    const result = await runAgentCycle();
    marketWS.syncSubscriptionsForPositions();

    const allSnapshots = priceStore.getAll();
    const tickersMap: Record<string, any> = {};
    for (const [symbol, snapshot] of allSnapshots) {
      const obj = priceStore.buildTickerObj(snapshot);
      if (obj) tickersMap[symbol] = obj;
    }

    let wsStatus: "connected" | "connecting" | "reconnecting" = "connected";
    const ci = marketWS.getConnectionInfo();
    if (ci.type === "fallback") {
      wsStatus = "reconnecting";
    } else if (allSnapshots.size === 0) {
      wsStatus = "reconnecting";
    } else {
      const activeSymbols = new Set([
        ...currentState.watchlist,
        ...currentState.positions.map(p => p.symbol),
      ]);
      const anyActiveStale = activeSymbols.size > 0 && [...allSnapshots.entries()]
        .filter(([symbol]) => activeSymbols.has(symbol))
        .some(([, s]) => Date.now() - s.updatedAt.getTime() > WS_STALENESS_THRESHOLD_MS);
      if (anyActiveStale) wsStatus = "reconnecting";
    }

    res.json({
      status: "success",
      ticker: result.tickerPrice,
      tickers: Object.keys(tickersMap).length > 0 ? tickersMap : null,
      wsStatus,
      wsConnection: marketWS.getConnectionInfo(),
      decision: currentState.decision,
      signals: currentState.signals.map(s => ({ name: s.name, source: s.source, direction: s.direction, strength: s.strength })),
      watchlist: currentState.watchlist || [],
      equityHistory: (currentState.equityHistory || []).map(e => ({
        timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
        equity: e.equity,
      })),
    });
  } catch (error: any) {
    console.error("[Backend REST] POST /api/agent/cycle error:", error);
    res.status(500).json({ status: "error", message: error.message || "Internal Server Error" });
  }
});

// GET /api/agent/cycle
app.get("/api/agent/cycle", (req, res) => {
  const currentState = getAgentState();

  const allSnapshots = priceStore.getAll();
  const tickersMap: Record<string, any> = {};
  for (const [symbol, snapshot] of allSnapshots) {
    const obj = priceStore.buildTickerObj(snapshot);
    if (obj) tickersMap[symbol] = obj;
  }

  let wsStatus: "connected" | "connecting" | "reconnecting" = "connected";
  const ci = marketWS.getConnectionInfo();
  if (ci.type === "fallback") {
    wsStatus = "reconnecting";
  } else if (allSnapshots.size === 0) {
    wsStatus = currentState.lastCycleAt ? "reconnecting" : "connecting";
  } else {
    const activeSymbols = new Set([
      ...currentState.watchlist,
      ...currentState.positions.map(p => p.symbol),
    ]);
    const anyActiveStale = activeSymbols.size > 0 && [...allSnapshots.entries()]
      .filter(([symbol]) => activeSymbols.has(symbol))
      .some(([, s]) => Date.now() - s.updatedAt.getTime() > WS_STALENESS_THRESHOLD_MS);
    if (anyActiveStale) wsStatus = "reconnecting";
  }

  const livePositions = currentState.positions.map((p) => {
    const symSnapshot = allSnapshots.get(p.symbol);
    const livePrice = symSnapshot?.lastPrice ?? tickersMap[p.symbol]?.lastPrice;
    let unrealizedPnL = livePrice && p.entryPrice > 0 ? (livePrice - p.entryPrice) * p.size : p.unrealizedPnL;
    return {
      symbol: p.symbol,
      side: p.side,
      size: p.size,
      entryPrice: p.entryPrice,
      unrealizedPnL,
    };
  });

  let tickerObj = null;
  if (currentState.ticker) {
    tickerObj = priceStore.buildTickerObj({
      symbol: currentState.ticker.symbol,
      lastPrice: currentState.ticker.lastPrice,
      high24h: currentState.ticker.high24h,
      low24h: currentState.ticker.low24h,
      baseVolume: 0,
      quoteVolume: 0,
      changePercent: currentState.ticker.change24hPercent ?? 0,
      updatedAt: new Date(),
    });
  }

  const liveEquity = currentState.portfolio.cash +
    livePositions.reduce((sum, p) => sum + p.size * p.entryPrice + p.unrealizedPnL, 0);

  res.json({
    status: currentState.status,
    lastCycleAt: currentState.lastCycleAt?.toISOString() ?? null,
    ticker: tickerObj,
    tickers: Object.keys(tickersMap).length > 0 ? tickersMap : null,
    wsStatus,
    wsConnection: marketWS.getConnectionInfo(),
    decision: currentState.decision ? {
      action: currentState.decision.action,
      strength: currentState.decision.strength,
      confidence: currentState.decision.confidence,
      reason: currentState.decision.reason,
      riskStatus: currentState.decision.riskStatus || "approved",
    } : null,
    signals: currentState.signals.map((s) => ({
      name: s.name, source: s.source, direction: s.direction, strength: s.strength,
    })),
    portfolio: {
      cash: currentState.portfolio.cash,
      equity: liveEquity,
      initialCash: currentState.portfolio.initialCash,
      totalTrades: currentState.portfolio.totalTrades,
      winRate: currentState.portfolio.winRate,
      totalPnL: currentState.portfolio.totalPnL,
    },
    positions: livePositions,
    trades: currentState.trades.map((t) => ({
      id: t.id, timestamp: t.timestamp.toISOString(), symbol: t.symbol, side: t.side,
      action: t.action, size: t.size, price: t.price, pnl: t.pnl ?? null,
    })),
    llmProgress: llmProgress || currentState.llmProgress || null,
    circuitBreakerTripped: currentState.circuitBreakerTripped,
    circuitBreakerThresholdPct: currentState.circuitBreakerThresholdPct,
    peakEquity: currentState.peakEquity,
    modelName: currentState.modelName,
    watchlist: currentState.watchlist || [],
    logs: (currentState.logs || []).map(l => ({
      timestamp: l.timestamp instanceof Date ? l.timestamp.toISOString() : l.timestamp,
      level: l.level,
      message: l.message,
    })),
  });
});

// PUT /api/agent/cycle
app.put("/api/agent/cycle", async (req, res) => {
  const statusParam = req.query.status as string;
  if (!["running", "stopped", "paused"].includes(statusParam)) {
    return res.status(400).json({ status: "error", message: "Invalid status parameter" });
  }

  const result = await setAgentStatus(statusParam as "running" | "stopped" | "paused");

  if (statusParam === "running") {
    await marketWS.initialize();
    
    marketWS.setAgentCycleHandler(async () => {
      if (getAgentState().status === "running") {
        try {
          const initResult = await runAgentCycle();
          marketWS.syncSubscriptionsForPositions();
          console.log("[AGENT CYCLE] Standalone Done — ticker price:", initResult.tickerPrice,
            "signals:", getAgentState().signals.length);
        } catch (err) {
          console.error("[AGENT CYCLE] Standalone Cycle failed:", err instanceof Error ? err.message : String(err));
        }
      }
    });

    console.log("[AGENT CYCLE] Standalone Warmup — first cycle in 20s");
    setTimeout(async () => {
      if (getAgentState().status !== "running") return;
      const initResult = await runAgentCycle();
      marketWS.syncSubscriptionsForPositions();
      console.log("[PUT /api/agent/cycle] Initial cycle done, ticker:", initResult.tickerPrice);
    }, 20_000);
  } else {
    marketWS.stopAgentCycles();
  }

  const current = getAgentState();
  res.json({
    status: "ok",
    currentStatus: current.status,
    ...(result.closed ? { closed: result.closed, realizedPnl: result.realizedPnl } : {}),
  });
});

// POST /api/agent/reset
app.post("/api/agent/reset", async (req, res) => {
  try {
    const initialCash = Number(process.env.SIM_INITIAL_CASH) || 1000;
    await setAgentStatus("stopped");
    resetBalanceState(initialCash);
    resetInMemoryState();
    res.json({ ok: true, message: "Balance and in-memory state reset completed." });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset balance", details: String(err) });
  }
});

// POST /api/agent/breaker
app.post("/api/agent/breaker", async (req, res) => {
  const { action, thresholdPct } = req.body;
  if (action === "reset") {
    resetCircuitBreaker();
    return res.json({ status: "success", message: "Circuit breaker reset successfully" });
  }
  if (action === "updateThreshold") {
    if (typeof thresholdPct !== "number" || thresholdPct <= 0 || thresholdPct > 100) {
      return res.status(400).json({ status: "error", message: "Invalid threshold percentage" });
    }
    updateCircuitBreakerThreshold(thresholdPct);
    return res.json({ status: "success", message: "Circuit breaker threshold updated successfully" });
  }
  res.status(400).json({ status: "error", message: "Invalid action" });
});

// GET /api/agent/sentiment
app.get("/api/agent/sentiment", async (req, res) => {
  const symbolParam = req.query.symbol as string;
  const symbols = symbolParam ? [symbolParam.toUpperCase()] : Array.from(DEFAULT_SYMBOLS);
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const sentiment = await sentimentService.getSentiment(symbol);
        return { symbol, sentiment };
      } catch (err) {
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
  res.json({ status: "success", data: results, timestamp: new Date().toISOString() });
});

// GET /api/agent/strategy & POST /api/agent/strategy
app.route("/api/agent/strategy")
  .get((req, res) => {
    res.json(strategyService.getStrategy());
  })
  .post(async (req, res) => {
    const { persona, customInstructions, circuitBreakerThresholdPct } = req.body;
    if (!persona || !customInstructions) {
      return res.status(400).json({ status: "error", message: "Persona and Custom Instructions are required" });
    }
    strategyService.saveStrategy({
      persona,
      customInstructions,
      circuitBreakerThresholdPct: circuitBreakerThresholdPct ?? 10,
    });
    res.json({ status: "success", message: "Strategy updated successfully" });
  });

// GET /api/agent/news
app.get("/api/agent/news", async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const news = await newsService.getLatestNews(limit);
  res.json({ status: "success", data: news, timestamp: new Date().toISOString() });
});

// GET /api/agent/history
app.get("/api/agent/history", async (req, res) => {
  const symbol = req.query.symbol as string;
  let history = symbol ? await historyService.getHistoryBySymbol(symbol) : await historyService.getHistory();
  res.json(history);
});

// POST /api/agent/backtest
app.post("/api/agent/backtest", async (req, res) => {
  const { initialEquity } = req.body;
  const result = await backtestService.runBacktest(initialEquity);
  res.json(result);
});

// GET /api/agent/stream (SSE)
app.get("/api/agent/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(`event: hello\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

  const onPrice = (payload: any) => {
    res.write(`event: price\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  agentEvents.onPrice(onPrice);

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    agentEvents.offPrice(onPrice);
  });
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[WYRM Backend] Standalone server listening on port ${PORT}`);
});
