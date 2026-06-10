# 🐉 WYRM Trader

Autonomous trading agent for the **Bitget AI Base Camp Hackathon S1 (Track 1 — Trading Agent)**. Two-stage screening → deep TA/sentiment analysis → LLM-driven decisions → simulated execution, all surfaced through a real-time Next.js dashboard.

---

## 🚀 Key Features

- **Two-Stage Screening** — Stage 1 scans all Bitget USDT pairs via bulk REST, selects 2 candidates per cycle. Stage 2 runs multi-timeframe TA (5m/1h/1d) + sentiment enrichment on selected coins plus existing positions.
- **LLM-Powered Decisions** — Single multi-pair prompt evaluates all targets simultaneously. Returns per-symbol buy/sell/hold with confidence and reasoning. Falls back to heuristic analysis on LLM failure.
- **Dynamic Watchlist** — Accumulates screened picks across cycles. Prunes closed positions. Resets on agent stop. The agent can trade **any coin** discovered through screening, not just the default symbols.
- **Paper Trading Engine** — Simulates spot trades with configurable order size, fee %, and max concurrent positions. Tracks average entry price, unrealized PnL, and portfolio equity in real-time.
- **Autonomous Risk Breaker** — Monitors trailing drawdown against peak equity. Trips a halt state on threshold breach, flattens all positions, and requires manual re-arm. Uses `Math.abs(strength)` for bi-directional conviction checking.
- **Strategy Customizer** — Hot-reload agent persona, trading instructions, and drawdown limits via the Config tab. Conservative / Balanced / Aggressive presets with single-click selection.
- **Real-Time Dashboard** — 12-column bento grid with glass-panel panels: Portfolio equity chart with timeframe selector (1m–1w), positions table, decision signals with 5-stage pipeline, market intelligence with Fear & Greed index, live WebSocket watchlist, and scrollable log console (Execution / Decisions / Console tabs).
- **Bearer Token Auth** — All `/api/agent/*` routes protected by `src/proxy.ts`. Frontend auto-attaches token via shared `apiFetch` helper. API-controllable from anywhere.
- **Sentiment & News** — Global Fear & Greed Index from alternative.me. Per-symbol Long/Short ratio, funding rate, and open interest for BTC/ETH. Macro news injected into LLM prompt context.
- **Persistent State** — Portfolio state saved to disk on lifecycle changes. Survives restarts.

---

## 🛠️ Architecture

```
 ┌──────────────────────────────────┐
 │        React Dashboard           │  ← Polls agent state (3s/10s)
 │     (Next.js App Router)         │  ← Glass-panel bento grid
 └──────────────┬───────────────────┘
                │ apiFetch + Bearer token
                ▼
 ┌──────────────────────────────────┐
 │        src/proxy.ts              │  ← Auth middleware
 │   /api/agent/*  (401 on bad key) │
 └──────────────┬───────────────────┘
                │
                ▼
 ┌──────────────────────────────────┐
 │        Agent Engine              │
 │  ┌─────────────────────────────┐ │
 │  │ Stage 1: Screening          │ │  ← Bulk Bitget REST → LLM picks 2
 │  │ Stage 2: TA + Sentiment     │ │  ← Multi-timeframe RSI/MACD/BB
 │  │ Stage 3: LLM Evaluation     │ │  ← Single multi-pair prompt
 │  │ Stage 4: Risk Validation    │ │  ← Conviction + position limits
 │  │ Stage 5: Trade Execution    │ │  ← Paper order matching
 │  └─────────────────────────────┘ │
 │  • WebSocket (price-store)       │  ← Bitget Spot WS
 │  • Sentiment Service             │  ← F&G + Bitget futures data
 │  • News Service                  │  ← Google News RSS
 └──────────────┬───────────────────┘
                │
                ▼
 ┌──────────────────────────────────┐
 │       Bitget REST API v2         │
 │       LM Studio / Ollama         │
 └──────────────────────────────────┘
```

---

## ⚙️ Configuration

### `.env.local`

```env
# ─── Authentication ───
NEXT_PUBLIC_AUTH_TOKEN=wyrm-hackathon-demo-2026   # Bearer token for /api/agent/* routes

# ─── Bitget API ───
BITGET_API_KEY=your-api-key
BITGET_SECRET_KEY=your-secret-key
BITGET_PASSPHRASE=your-passphrase

# ─── LLM Engine ───
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_API_KEY=sk-local
LLM_MODEL=gemma-4-e2b-it-qat         # Primary model
LLM_MODEL_FAST=gemma-4-e2b-it-qat    # Fallback on timeout
LLM_PLUS_TIMEOUT_MS=30000            # 30s before switching to fast
LLM_FALLBACK=true                    # Enable cloud fallback

# ─── Trading ───
SIM_INITIAL_CASH=1000                # Starting portfolio in USDT
SIM_ORDER_SIZE_PCT=0.05              # 5% of equity per trade
SIM_FEE_PCT=0.001                    # 0.1% taker fee
TRADING_SYMBOLS=BTCUSDT,ETHUSDT      # Default WebSocket subscriptions
MAX_ACTIVE_POSITIONS=5               # Max concurrent positions
AGENT_CYCLE_INTERVAL_MS=30000        # 30s between automatic cycles

# ─── Optional Proxy ───
# BITGET_PROXY=http://user:pass@host:port
```

### Installation

```bash
npm install
pip3 install -r src/features/trading-agent/analysis/requirements.txt
npm run dev
```

---

## 🏃 Controlling the Agent

All agent control is via API (no UI buttons — intended for hackathon/public deployment).

```bash
# Start (opens WebSocket, begins cycles after 20s warmup)
curl -X PUT "localhost:3000/api/agent/cycle?status=running" \
  -H "Authorization: Bearer wyrm-hackathon-demo-2026"

# Pause (halts cycles, keeps positions open)
curl -X PUT "localhost:3000/api/agent/cycle?status=paused" \
  -H "Authorization: Bearer wyrm-hackathon-demo-2026"

# Stop (flattens all positions at market, clears watchlist)
curl -X PUT "localhost:3000/api/agent/cycle?status=stopped" \
  -H "Authorization: Bearer wyrm-hackathon-demo-2026"

# Read current state
curl "localhost:3000/api/agent/cycle" \
  -H "Authorization: Bearer wyrm-hackathon-demo-2026"

# Update strategy
curl -X POST "localhost:3000/api/agent/strategy" \
  -H "Authorization: Bearer wyrm-hackathon-demo-2026" \
  -H "Content-Type: application/json" \
  -d '{"persona":"Aggressive scalper","customInstructions":"...","circuitBreakerThresholdPct":10}'

# Reset circuit breaker
curl -X POST "localhost:3000/api/agent/breaker" \
  -H "Authorization: Bearer wyrm-hackathon-demo-2026" \
  -H "Content-Type: application/json" \
  -d '{"action":"reset"}'

# Run backtest
curl -X POST "localhost:3000/api/agent/backtest" \
  -H "Authorization: Bearer wyrm-hackathon-demo-2026" \
  -H "Content-Type: application/json" \
  -d '{"initialEquity":1000}'

# Reset all state
curl -X POST "localhost:3000/api/agent/reset" \
  -H "Authorization: Bearer wyrm-hackathon-demo-2026"
```

### API Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/agent/cycle` | Full agent state |
| `POST` | `/api/agent/cycle` | Run one manual cycle |
| `PUT` | `/api/agent/cycle?status=running\|paused\|stopped` | Change agent status |
| `GET` | `/api/agent/sentiment` | Market sentiment data |
| `GET` | `/api/agent/news?limit=N` | Macro news headlines |
| `GET` | `/api/agent/history` | Decision history |
| `GET/POST` | `/api/agent/strategy` | Get/update strategy config |
| `POST` | `/api/agent/breaker` | Reset/update circuit breaker |
| `POST` | `/api/agent/backtest` | Run historical simulation |
| `POST` | `/api/agent/reset` | Full reset (stop + clear state) |

---

## 🧠 How It Works

### Cycle Flow

1. **Entry Guards** — Checks circuit breaker and running status
2. **Screening** — Fetches all Bitget USDT pairs, sends top 30 by volume to LLM, picks 2 most promising
3. **Price Fetching** — Gets live prices for position symbols + screened picks
4. **Technical Analysis** — Runs RSI, MACD, Bollinger Bands, EMA across 5m/1h/1d timeframes (Python via subprocess)
5. **Sentiment Enrichment** — F&G index (global) + per-symbol data (BTC/ETH only)
6. **LLM Evaluation** — Single multi-pair prompt to local LLM. Returns per-symbol buy/sell/hold with confidence
7. **Risk Validation** — Checks conviction threshold (0.3), max positions, min trade value, position size limits
8. **Trade Execution** — Opens/closes positions via paper engine. Syncs WebSocket subscriptions
9. **State Update** — Records equity snapshot, pushes log entries, updates watchlist

### Data Model

- **PortfolioSnapshot** — `{ cash, equity, initialCash, totalTrades, winRate, totalPnL }` (no positions duplication)
- **AgentState** — Full in-memory state including positions, trades, equity history (capped 500), logs (capped 100), watchlist
- **Persisted** → `portfolio-state.json` on disk on lifecycle changes

---

## 📂 Project Structure

```
src/
├── app/
│   ├── api/agent/           # Route handlers
│   │   ├── cycle/           # GET/POST/PUT — main agent control
│   │   ├── backtest/        # Historical simulation
│   │   ├── breaker/         # Circuit breaker reset
│   │   ├── news/            # RSS news feed
│   │   ├── sentiment/       # F&G + funding data
│   │   ├── strategy/        # Agent persona CRUD
│   │   ├── history/         # Decision history
│   │   └── reset/           # Full state reset
│   ├── globals.css          # Obsidian theme + glass-panel utils
│   └── layout.tsx
├── proxy.ts                 # Bearer token auth middleware
├── features/trading-agent/
│   ├── components/          # React UI components
│   │   ├── dashboard.tsx    # 12-col bento grid layout
│   │   ├── equity-chart.tsx # Portfolio chart (1m–1w)
│   │   ├── signal-panel.tsx # Decision pipeline + strength
│   │   ├── sentiment-panel.tsx # Market intelligence
│   │   ├── positions-panel.tsx  # Spot holdings table
│   │   ├── watchlist.tsx    # WS ticker chips
│   │   ├── status-header.tsx    # Model name + status dot
│   │   ├── bottom-status-bar.tsx # Fixed terminal footer
│   │   ├── trade-log.tsx    # Execution log
│   │   ├── decision-pipeline.tsx # 5-stage flow viz
│   │   ├── decision-history.tsx  # Past decisions log
│   │   ├── backtest-panel.tsx    # Simulation sandbox
│   │   ├── circuit-breaker-panel.tsx
│   │   ├── strategy-panel.tsx    # Agent customizer
│   │   ├── news-panel.tsx        # Macro news feed
│   │   ├── terminal-log.tsx      # Agent console
│   │   └── trade-toast.tsx       # Floating trade notifications
│   ├── hooks/use-agent.ts       # State polling + API calls
│   ├── services/
│   │   ├── agent-engine.ts      # Core cycle orchestration
│   │   ├── llm.service.ts       # OpenAI-compatible chat
│   │   ├── screening.service.ts # Bulk pair screening
│   │   ├── decision-helper.ts   # Prompt building + parsing
│   │   ├── risk-manager.service.ts # Trade validation
│   │   ├── sentiment.service.ts # F&G + Bitget futures data
│   │   ├── news.service.ts      # RSS scraping
│   │   ├── price-store.ts       # WS ticker cache
│   │   ├── sim-order-executor.ts # Paper trading engine
│   │   ├── strategy.service.ts  # Persona/config store
│   │   ├── backtest-service.ts  # Historical simulation
│   │   └── proxy-client.ts      # Residential proxy rotation
│   ├── analysis/                # Python TA scripts
│   ├── constants/
│   ├── types/
│   └── utils/
└── shared/
    ├── ui/                      # Card, Badge, Button, Tabs, Progress
    └── utils/api-fetch.ts       # Bearer token fetch wrapper
```

---

## 🎨 Design

- **Theme**: Obsidian (`#0a0a0f`) with white accents. No amber, no cyan.
- **Fonts**: Space Grotesk (display) + JetBrains Mono (data) + Inter (UI)
- **Glassmorphism**: `glass-panel` CSS — backdrop-blur, semi-transparent backgrounds, sharp 1px borders
- **Layout**: 12-col CSS grid, fixed bottom status bar, watchlist header strip
