# 🐉 WYRM Trader

Autonomous trading agent for the **Bitget AI Base Camp Hackathon S1 (Track 1 — Trading Agent)**. Uses two-stage market screening, multi-timeframe technical/sentiment analysis, and LLM-driven decision-making, all managed on an Obsidian-themed real-time dashboard.

---

## 🏆 Hackathon Submission Details

- **Track**: Track 1 — Trading Agent
- **Project Name**: WYRM Trader
- **Live Demo URL**: [https://wyrm.byrai.xyz](https://wyrm.byrai.xyz) (Hosted on a local ThinkPad via Cloudflare Tunnel)
- **Video Demo**: *[Add Video Link here]*
- **Key Bitget Tooling**: 
  - Bitget REST API v2 (Bulk pairs, multi-timeframe candles, futures sentiment data)
  - Bitget WebSocket (Real-time price feed & ticker updates)
  - Qwen 3.6+ Model (via Hackathon Endpoint for autonomous trade orchestration)

---

## 💡 1. Idea (Strategy Core Logic)

### Core Hypothesis
Crypto markets exhibit short-term momentum anomalies and rapid mean-reversion cycles driven by retail leverage shifts. WYRM Trader exploits these inefficiencies by filtering the entire Bitget USDT-pair universe down to high-velocity assets, confirming directional strength using multi-timeframe technical parameters, enriching decision context with real-time derivatives market sentiment, and executing LLM-adjudicated trades.

### The Five-Stage Cycle Pipeline
WYRM Trader runs a structured, atomic execution cycle (configured for 30s–60s intervals):

1. **Stage 1: Broad Screening**
   - Fetches all active Bitget USDT pairs via bulk REST.
   - Filters the top 30 assets by 24h volume.
   - Performs a lightweight pre-screen ranking (e.g., momentum RSI outliers or reversal setups).
   - Dynamic Watchlist: Selects the top 2 candidates + any active positions to pass to the next stage.
2. **Stage 2: Deep Analysis (Technical & Sentiment)**
   - Computes multi-timeframe technical indicators (5m, 1h, 1d) via a native Python subsystem:
     - **RSI (14)**: Identifies overbought/oversold levels.
     - **MACD**: Measures trend momentum and crossovers.
     - **Bollinger Bands**: Captures volatility bands and price-stretch.
     - **ATR & EMA**: Configures volatility range and base-trend bias.
   - Enriches with Derivatives Sentiment:
     - **Long/Short Ratios** & **Funding Rates**: Identifies retail crowdedness or institutional bias.
     - **Open Interest (OI)**: Signals whether moves are backed by fresh capital or short-squeezes.
     - **Fear & Greed Index**: Establishes global macro sentiment bias.
3. **Stage 3: LLM Evaluation**
   - Combines the structured technical data, sentiment metrics, active positions, and macro news headlines (via RSS) into a single, comprehensive multi-pair prompt.
   - A single LLM call evaluates all target symbols simultaneously to optimize latency and cost.
   - The LLM outputs structured JSON containing `action` (buy/sell/hold), `strength` (conviction), `confidence`, custom `slPct`/`tpPct` (Stop-Loss/Take-Profit based on ATR), and a concise markdown-free `reason`.
4. **Stage 4: Risk Validation**
   - Executes validation via the `RiskManager` service:
     - Filters out low conviction signals (`abs(strength) < 0.3`).
     - Enforces limits: Maximum 5 concurrent active positions.
     - Standardizes order sizing (allocates a configurable % of total equity per trade).
     - Implements dynamic cooling windows to prevent re-entering a symbol immediately after a stop-loss/take-profit exit.
5. **Stage 5: Trade Execution & Price WS Sync**
   - Executes simulated spot trades via the paper engine.
   - Opens long/short positions, tracking entry price, fees (0.1% taker fee), and unrealized PnL.
   - Automatically synchronizes the WebSocket ticker subscriptions for newly entered assets to track tick-by-tick PnL.

### Risk Management & Safety
- **Autonomous Bracket Exits**: Positions are constantly monitored on every live WS ticker tick. Exits (Stop-Loss & Take-Profit) trigger immediately in memory to bypass LLM latency.
- **Equity Trailing Circuit Breaker**: If total portfolio equity drops below a configured threshold (e.g., 5% trailing drawdown from peak equity), the system triggers a circuit breaker, immediately flattens all active positions at market, halts trading, and requires manual operator re-arming.

---

## 🛠️ 2. Progress & Tech Stack

### Key Challenges & Solutions
1. **Multi-Pair Scaling vs API Rate Limits**: Initially, polling technical data for 10+ symbols created rate-limit bottlenecks. **Solution**: Built a hybrid data model using REST for initial historical candles (cached for 5m) and a public WebSocket client to feed real-time ticker prices to an in-memory `PriceStore`.
2. **LLM Delays and Out-of-Order Execution**: During fast market moves, waiting 15s+ for LLM responses risked executing on stale prices. **Solution**: Decoupled trade execution from stop-loss/take-profit tracking. Exits are monitored on a 1-second WebSocket tick-loop, while entries and position-rebalancing are routed through the LLM on a slower cycle.
3. **LLM Output Formatting Failures**: Non-JSON formatting or incomplete answers from the model broke parsing loops. **Solution**: Developed a robust regex-based JSON repair engine (`decision-helper.ts`) that strips leading/trailing markdown conversational tokens and repairs common syntax bugs (missing commas, trailing commas, unescaped quotes).

### Completed Features
- [x] **Two-Stage Multi-Pair Screener**: Auto-refreshing watchlist based on 24h volume.
- [x] **Technical Analysis Subprocess**: Native Python bridge running official Bitget indicator math.
- [x] **Derivatives Sentiment & RSS News Feeds**: Contextual enrichment for LLM prompts.
- [x] **WebSocket price monitoring**: Real-time tick updates for active portfolio items.
- [x] **Autonomous Risk Controls**: Dynamic bracket exits & Trailing drawdown circuit breaker.
- [x] **Bento Grid Dashboard**: 12-column dark-mode dashboard (Obsidian `#0a0a0f`) with real-time logging, PnL charts, and active position metrics.
- [x] **Portfolio State Persistence**: Auto-saves state to disk (`portfolio-state.json`) to survive restarts.

### 🛡️ Security & Edge Authentication
- **Public-Facing with Private Controls**: Built for secure public demonstration (e.g., via Cloudflare Tunnels). Next.js Edge Middleware natively protects all configuration panels and state-changing actions.
- **Single-Admin Passcode**: Guests see a beautiful, real-time read-only trading terminal. Using the configured `ADMIN_PASSWORD` at `/login` yields a signed JWT `wyrm_session` cookie, unlocking the Start/Pause/Stop and Parameter Customization controls.
- **Programmatic API Tokens**: CLI and script interfaces use a static Bearer token (`NEXT_PUBLIC_AUTH_TOKEN`) allowing flexible external control without browser cookies.

### 🎨 UI Design System & Terminal UX
- **Theme**: Obsidian (`#0a0a0f`) with pure white accents. Avoids distracting color palettes.
- **Dynamic Grid Expansion**: 12-column bento grid strictly bounded to viewport height (`min-h-screen` and flexbox wrapping). Overflowing content (like large Spot Holdings or Backtest Ledgers) scrolls internally with sticky headers.
- **Cognitive Context Highlighting**: Streaming raw JSON from the LLM is parsed in real-time. Native reasoning tags (`<think>...</think>`) are visually extracted into an italicized "Cognitive Context Thread" sidebar, separating the model's inner thoughts from the final executed JSON payload.

### ⚙️ Backtesting Engine Accuracy
- **Precision Simulation**: The native backtester computes step-by-step state changes. Technical indicator caching is bypassed during backtests to ensure RSI, MACD, and Bollinger Bands are strictly recalculated per historical step.
- **Metrics Integrity**: Win Rate and PnL calculations are executed specifically against realized sell/exit events, avoiding diluted metrics caused by open portfolio positions.

---

## 🛠️ Progress & Tech Stack

### `.env.local`

```env
# ─── Authentication ───
NEXT_PUBLIC_AUTH_TOKEN=example-bearer-token   # Bearer token for /api/agent/* routes

# ─── Bitget API ───
BITGET_API_KEY=your-api-key
BITGET_SECRET_KEY=your-secret-key
BITGET_PASSPHRASE=your-passphrase

# ─── LLM Engine ───
OPENAI_BASE_URL=https://hackathon-endpoint/v1 # Or local endpoint
OPENAI_API_KEY=your-key
LLM_MODEL=qwen3.6-plus               # Primary model
LLM_MODEL_FAST=qwen3.6-flash         # Fallback on timeout
LLM_PLUS_TIMEOUT_MS=30000            # 30s before switching to fast
LLM_FALLBACK=true                    # Enable cloud fallback

# ─── Trading ───
SIM_INITIAL_CASH=1000                # Starting portfolio in USDT
SIM_ORDER_SIZE_PCT=0.05              # 5% of equity per trade
SIM_FEE_PCT=0.001                    # 0.1% taker fee
TRADING_SYMBOLS=BTCUSDT,ETHUSDT      # Default WebSocket subscriptions
BACKTEST_TRADING_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,DOGEUSDT,PEPEUSDT # Assets for historical simulator
MAX_ACTIVE_POSITIONS=5               # Max concurrent positions
AGENT_CYCLE_INTERVAL_MS=30000        # 30s between automatic cycles
```

### Installation & Running

#### Development Mode
```bash
# Install Node dependencies
npm install

# Install Python dependencies for the TA subsystem
pip3 install -r src/features/trading-agent/analysis/requirements.txt

# Run development server
npm run dev

# Build for production and run with PM2
npm run build
pm2 start npm --name "wyrm-trader" -- start
```

#### Production Mode (PM2)
We use **PM2** for process management, auto-restarting on failures, and log management.
```bash
# 1. Build the application
npm run build

# 2. Start using PM2
npm run start:pm2
```

Useful PM2 management scripts:
```bash
npm run status:pm2    # Check status
npm run logs:pm2      # View real-time logs
npm run restart:pm2   # Restart the app
npm run stop:pm2      # Stop the app
npm run delete:pm2    # Delete process from list
```

---

## 🏃 Controlling the Agent (API Controls)

Use the included `wyrmctl` CLI so you don't have to remember `curl` incantations.

```bash
# Start / pause / stop
npm run wyrmctl start
npm run wyrmctl pause
npm run wyrmctl stop

# Read current state
npm run wyrmctl status

# Run one manual cycle
npm run wyrmctl cycle

# Update strategy from a JSON file
npm run wyrmctl strategy-set -f strategy.json

# Or update strategy inline
npm run wyrmctl strategy-set \
  --persona "Aggressive scalper" \
  --instructions "Only enter on confirmed breakouts..." \
  --pct 10

# Reset circuit breaker
npm run wyrmctl breaker-reset

# Run backtest
npm run wyrmctl backtest -e 1000

# Reset all state
npm run wyrmctl reset
```

`wyrmctl` reads `NEXT_PUBLIC_AUTH_TOKEN` and `AGENT_BASE_URL` from `.env.local`.
Override with `--token` or `--base-url`.

<details>
<summary>Equivalent curl commands</summary>

```bash
# Start (opens WebSockets, begins agent cycles)
curl -X PUT "https://wyrm.byrai.xyz/api/agent/cycle?status=running" \
  -H "Authorization: Bearer example-bearer-token"

# Pause (halts active cycles, keeps current positions open)
curl -X PUT "https://wyrm.byrai.xyz/api/agent/cycle?status=paused" \
  -H "Authorization: Bearer example-bearer-token"

# Stop (flattens all active positions at market, clears watchlist)
curl -X PUT "https://wyrm.byrai.xyz/api/agent/cycle?status=stopped" \
  -H "Authorization: Bearer example-bearer-token"

# Get current agent state
curl "https://wyrm.byrai.xyz/api/agent/cycle" \
  -H "Authorization: Bearer example-bearer-token"

# Update strategy profile
curl -X POST "https://wyrm.byrai.xyz/api/agent/strategy" \
  -H "Authorization: Bearer example-bearer-token" \
  -H "Content-Type: application/json" \
  -d '{"persona":"Aggressive Scalper","customInstructions":"Target short-term RSI breakouts.","circuitBreakerThresholdPct":8}'

# Reset Circuit Breaker
curl -X POST "https://wyrm.byrai.xyz/api/agent/breaker" \
  -H "Authorization: Bearer example-bearer-token" \
  -H "Content-Type: application/json" \
  -d '{"action":"reset"}'
```
</details>

---

## 📂 Project Structure

```
src/
├── app/                          # Next.js pages and API routing
│   ├── api/agent/                # REST endpoints (cycle control, resets, strategy)
│   ├── api/auth/                 # Edge authentication logic (login/logout/status)
│   ├── config/                   # Protected parameter tuner and backtester
│   ├── login/                    # Single-admin passcode gate
│   └── page.tsx                  # Obsidian Dashboard landing page
├── proxy.ts                      # Edge Middleware (JWT Session & Bearer Token guard)
├── features/trading-agent/
│   ├── components/            # React UI components
│   │   ├── dashboard.tsx      # 12-col bento grid layout
│   │   ├── equity-chart.tsx   # Portfolio chart (1m–1w)
│   │   ├── signal-panel.tsx   # Decision pipeline + strength
│   │   ├── sentiment-panel.tsx # Market intelligence
│   │   ├── positions-panel.tsx # Spot holdings table
│   │   ├── watchlist.tsx      # WS ticker chips
│   │   ├── status-header.tsx  # Auth-gated control buttons & Model status
│   │   ├── bottom-status-bar.tsx # Fixed terminal footer
│   │   ├── trade-log.tsx      # Execution log
│   │   ├── decision-pipeline.tsx # 5-stage flow viz
│   │   ├── decision-history.tsx  # Past decisions log
│   │   ├── backtest-panel.tsx  # Scrollable simulation sandbox
│   │   ├── circuit-breaker-panel.tsx
│   │   ├── strategy-panel.tsx  # Agent customizer forms
│   │   ├── strategy-sliders.tsx # Sliders for strategy parameters
│   │   ├── news-panel.tsx      # Macro news feed
│   │   ├── terminal-log.tsx    # Agent console
│   │   ├── brain-log.tsx       # Syntax-highlighted LLM streaming log
│   │   ├── trade-toast.tsx     # Floating trade notifications
│   │   └── radial-gauge.tsx    # Drawdown meter
│   ├── hooks/
│   │   ├── use-agent.ts        # State polling + API calls
│   │   ├── use-agent-selector.ts # Memoized state selectors
│   │   ├── use-performance-monitor.ts # Render performance tracker
│   │   ├── use-price-stream.ts # Live price WebSocket handler
│   │   └── use-animated-number.ts # Smooth UI transitions
│   ├── services/
│   │   ├── agent-engine.ts     # Core cycle orchestration
│   │   ├── llm.service.ts      # OpenAI-compatible chat
│   │   ├── screening.service.ts # Bulk pair screening
│   │   ├── decision-helper.ts  # Backward compatible barrel for prompts/
│   │   ├── decision-engine.service.ts # Barrel for decision-engine/
│   │   ├── backtest-service.ts # Barrel for backtest/
│   │   ├── market-ws.service.ts # Barrel for market-ws/
│   │   ├── order-executor.service.ts # Barrel for orders/
│   │   ├── risk-manager.service.ts # Trade validation
│   │   ├── sentiment.service.ts # F&G + Bitget futures data
│   │   ├── news.service.ts     # RSS scraping
│   │   ├── price-store.ts      # WS ticker cache
│   │   ├── proxy-client.ts     # Residential proxy rotation
│   │   ├── prompts/            # LLM Prompt generation & parsing
│   │   │   ├── fallback.ts     # Heuristic safety defaults
│   │   │   ├── json-utils.ts   # AI JSON cleaning & repairing
│   │   │   ├── response-parser.ts # Regex/JSON output parser
│   │   │   └── trading-prompt.ts # System & context builder
│   │   ├── backtest/           # Modular backtest engine
│   │   │   ├── simulator.ts    # Iterative historical run
│   │   │   ├── metrics.ts      # Sharpe, Drawdown, Win-rate calculators
│   │   │   └── data.ts         # Candle fetching & storage
│   │   ├── decision-engine/    # Multi-pair evaluation cycle
│   │   │   ├── screening.ts    # Volatility/Momentum filtering
│   │   │   ├── ta-runner.ts    # Technical indicator executor
│   │   │   └── ta-cache.ts     # In-memory indicator cache
│   │   ├── market-ws/          # WS connections manager
│   │   │   ├── connection.ts   # Reconnect & Socket lifecycle
│   │   │   ├── subscriptions.ts # Bitget symbol subscriptions
│   │   │   ├── message-processor.ts # Payload parser & store router
│   │   │   ├── heartbeat.ts    # Ping/Pong connection guard
│   │   │   └── cycle-scheduler.ts # WS status heartbeat to state
│   │   └── orders/             # Trade execution engine
│   │       ├── flatten.ts      # Emergency liquidator
│   │       └── price-resolver.ts # Executed price finder
│   ├── analysis/                # Python TA scripts
│   ├── constants/
│   ├── types/
│   └── utils/
└── shared/
    ├── ui/                      # Card, Badge, Button, Tabs, Progress
    └── utils/api-fetch.ts       # Bearer token fetch wrapper
```

---

### Frameworks, Models, and APIs Used
- **Frontend / Backend**: Next.js (App Router), Tailwind CSS, TypeScript, `jose`
- **Core Orchestrator**: Vercel AI SDK (`@ai-sdk/openai-compatible`)
- **Primary LLM**: `qwen3.6-plus` (falls back to `qwen3.6-flash` on high latency/timeout)
- **Technical Analysis**: Python (Pandas, Numpy) via Node `subprocess`
- **Deployment**: Hosted locally on an Intel-based ThinkPad, kept alive by PM2, and served securely via Cloudflare Tunnel at `https://wyrm.byrai.xyz`.

---

## ⚙️ Configuration
