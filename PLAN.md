# Bitget AI Base Camp Hackathon S1 — Full Execution Plan

**Track:** Track 1 – Trading Agent  
**Goal:** Build an autonomous trading agent with a polished React web demo  
**Strategy type:** Sim trading / backtesting (no real capital)  
**Deadline:** June 25, 2026

---

## Current Progress — June 8, 2026

### ✅ Completed Features

#### Core Agent Engine
| Feature | Status | Details |
|---------|--------|--------|
| Real Bitget market data | ✅ | Direct REST API v2: tickers, candlesticks (BTCUSDT live) |
| Python technical analysis | ✅ | RSI, MACD, Bollinger Bands via `kline_indicators.py` with official Bitget formulas |
| LLM decision engine | ✅ | `@ai-sdk/openai-compatible` + Qwen 3.6+ on hackathon endpoint (`qwen3.6-plus`) |
| Sim order engine | ✅ | Paper trading: buy/sell, position tracking, PnL calculation |
| Agent lifecycle (Start/Pause/Stop) | ✅ | Stop auto-flattens positions; Pause preserves them |
| Trade logging | ✅ | Entry, add, reduce, exit actions with timestamp + PnL per trade |

#### Dashboard UI
| Component | Status | Details |
|-----------|--------|--------|
| StatusHeader | ✅ | Live status badge, Start/Pause/Stop controls, last cycle time |
| SignalPanel | ✅ | Color-coded bullish/bearish/neutral signals from TA + LLM |
| EquityChart | ✅ | Recharts area chart, flat line when no trades, responsive |
| PositionsPanel | ✅ | Open positions with entry price, current price, unrealized PnL |
| TradeLog | ✅ | Reverse chronological trades, action badges, color-coded PnL, portfolio summary |
| Dashboard layout | ✅ | 2-column grid, dark theme, Tailwind CSS |

#### API Layer
| Endpoint | Status | Details |
|----------|--------|--------|
| `POST /api/agent/cycle` | ✅ | Triggers one perception→decision→execution loop |
| `GET /api/agent/cycle` | ✅ | Returns full agent state (portfolio, ticker, signals, trades, positions) |
| `PUT /api/agent/cycle?status=` | ✅ | Start/Pause/Stop with auto-flatten on stop |
| `GET /api/agent/config` | ✅ | Returns `initialCash` from `.env.local` for client initialization |

#### Client State Management
| Feature | Status | Details |
|---------|--------|--------|
| use-agent hook | ✅ | Polling every 3s, status-aware fetch, lastKnownState persistence |
| Config loading | ✅ | Fetches `initialCash` from server on mount, updates portfolio defaults |

### 🟡 In Progress / Known Issues
- Agent LLM decisions are conservative (frequently returns "hold") — needs signal threshold tuning for demo visibility
- Polling interval is 3s; some cycles take ~40s due to LLM inference latency
- `llm.service.ts` has a hardcoded `.env.local` path that may fail on other machines

### ⬜ Remaining (Hackathon Deliverables)
| Item | Target Date |
|------|-------------|
| Demo video (3 min) | June 22 |
| README.md complete | June 23 |
| Community posts (3+) | June 23 |
| Vercel deployment | June 24 |
| Final review checklist | June 24 |

---

## Project Overview

Build **WYRM Trader** — an autonomous trading agent that:
- Ingests multi-signal market data via Bitget Agent Hub MCP + Skill Hub
- Processes signals through a decision engine with risk management rules
- Executes trades via a simulated order engine (paper trading)
- Visualizes everything on a dark-themed React dashboard
- Logs every decision for full auditability

---

## Phase 0 — Setup & Registration (Deadline: June 10)

### Tasks

| # | Task | Effort | Status |
|---|------|--------|--------|
| 0.1 | Register on official Bitget hackathon form | 5 min | ⬜ |
| 0.2 | Join Telegram community & claim credits (Qwen + MuleRun) | 15 min | ⬜ |
| 0.3 | Create Bitget API key (Read + Trade permissions) | 10 min | ⬜ |
| 0.4 | Set environment variables for Agent Hub | 5 min | ⬜ |
| 0.5 | Initialize Next.js project with proper structure | 2 min | ⬜ |
| 0.6 | Clone/fork agent_hub repo or note `bitget-mcp-server` package | 1 min | ⬜ |

### Setup Commands

```bash
# API credentials
export BITGET_API_KEY="your-api-key"
export BITGET_SECRET_KEY="your-secret-key"
export BITGET_PASSPHRASE="your-passphrase"

# Initialize project (already in project root)
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"

# Install packages
npm install bitget-mcp-server bitget-client bitget-skill-hub zod lucide-react recharts date-fns clsx tailwind-merge
```

---

## Phase 1 — Core Agent Backend (June 10–14)

### Goal: Working agent with one skill + Playbook integration + basic sim execution

#### Day 1 (June 10): Foundation

**1.1 Project scaffold (feature-based structure)**
```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx                  # Dashboard entry
│   └── api/                      # API routes for agent communication
├── features/
│   └── trading-agent/            # Main feature folder
│       ├── actions/              # Server actions
│       ├── components/           # UI components (dashboard focused)
│       ├── hooks/                # Custom hooks
│       ├── schemas/              # Zod validation schemas
│       ├── services/             # Business logic
│       │   ├── market-data.service.ts    # Wraps Agent Hub MCP calls
│       │   ├── decision-engine.service.ts # Core strategy logic
│       │   └── sim-order-engine.ts        # Paper trading execution
│       ├── types/                # TypeScript interfaces
│       └── index.ts              # Barrel export
├── shared/
│   └── ui/                       # Shared UI primitives (buttons, cards, etc.)
├── lib/
│   └── db/                       # Local sim state store (SQLite / JSON)
```

**1.2 Sim order engine — paper trading core**

`features/trading-agent/services/sim-order-engine.ts`

```typescript
export interface TradeRecord {
  id: string;
  timestamp: Date;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  price: number;
  size: number;
  executedPrice: number;
  filled: boolean;
  reason: string;       // decision reasoning
  signals: Signal[];    // which signals triggered this
}

export interface Position {
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  unrealizedPnL: number;
}

export interface PortfolioSnapshot {
  timestamp: Date;
  cash: number;
  equity: number;
  positions: Position[];
  totalTrades: number;
  winRate: number;
}

interface SimEngineConfig {
  initialCash: number;
  maxPositionSize: number;    // % of portfolio per trade
  maxDrawdown: number;        // % stop threshold
  dailyTradeLimit: number;    // prevent overtrading
}

export class SimOrderEngine {
  private portfolio: { cash: number };
  private positions: Map<string, Position>;
  private trades: TradeRecord[];
  private snapshots: PortfolioSnapshot[];
  private config: SimEngineConfig;

  constructor(config: SimEngineConfig) {
    this.config = config;
    this.portfolio = { cash: config.initialCash };
    this.positions = new Map();
    this.trades = [];
    this.snapshots = [];
  }

  // Mock market fill — use last traded price from agent_hub feed
  placeOrder(order: { symbol: string; side: "buy" | "sell"; size: number; price?: number; reason: string; signals: Signal[] }): SimExecutionResult {
    // Check risk rules
    this.checkMaxDrawdown();
    this.checkPositionLimits(order);
    this.checkDailyLimit();

    const filledPrice = order.price || this.getLastPrice(order.symbol);
    const cost = filledPrice * order.size;

    if (order.side === "buy" && cost > this.portfolio.cash) {
      return { success: false, reason: "Insufficient cash" };
    }

    // Record trade and update portfolio
    const trade: TradeRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      symbol: order.symbol,
      side: order.side,
      orderType: "market",
      price: filledPrice,
      size: order.size,
      executedPrice: filledPrice,
      filled: true,
      reason: order.reason,
      signals: order.signals,
    };

    this.trades.push(trade);
    // ... update positions and cash
    return { success: true, trade };
  }

  getPortfolioSnapshot(): PortfolioSnapshot {
    const equity = this.portfolio.cash + this.getTotalPositionValue();
    const wins = this.trades.filter(t => t.executedPrice > (t.side === "buy" ? t.price : t.price)).length;
    return {
      timestamp: new Date(),
      cash: this.portfolio.cash,
      equity,
      positions: Array.from(this.positions.values()),
      totalTrades: this.trades.length,
      winRate: this.trades.length > 0 ? wins / this.trades.length : 0,
    };
  }

  generateBacktestReport(strategy: StrategyConfig, range: DateRange): BacktestReport {
    // Replay historical ticker data through the strategy
    // Return equity curve, trades, max drawdown, Sharpe ratio
  }
}
```

**1.3 Market data service — Agent Hub integration**

`features/trading-agent/services/market-data.service.ts`

This wraps calls to `bitget-client` CLI or MCP server:

```typescript
// Wraps bitget-client (bgc) for market data fetching
export async function getTickerPrice(symbol: string): Promise<TickerData> {
  // Call: bgc spot spot_get_ticker --symbol BTCUSDT
  // Parse JSON output → typed response
}

export async function getOrderBook(symbol: string, depth: number = 20): Promise<OrderBook> {
  // Call: bgc spot spot_depth --symbol BTCUSDT --size ${depth}
}

export async function getCandlestickData(symbol: string, interval: string, limit: number): Promise<Candlestick[]> {
  // Call: bgc spot spot_kline --symbol BTCUSDT --interval ${interval} --limit ${limit}
}

// For Skill Hub analysis (technical, sentiment, macro)
export async function runTechnicalAnalysis(symbol: string): Promise<TechnicalAnalysisReport> {
  // Trigger the skill via Claude Code / Cursor MCP tool call
  // Or build a lightweight local analyzer using pandas/numpy for indicators
}
```

**1.4 Decision engine — core strategy logic**

`features/trading-agent/services/decision-engine.service.ts`

```typescript
export async function evaluateSignals(
  ticker: TickerData,
  orderBook: OrderBook,
  technicalReport: TechnicalAnalysisReport,
  sentimentScore: number,
): Promise<TradingDecision | null> {
  // 1. Run regime detection (bull/bear/range)
  const regime = detectRegime(ticker, technicalReport);

  // 2. Score signals against regime rules
  const signalScore = scoreSignals(technicalReport, sentimentScore, regime);

  // 3. Apply risk filters
  if (!passRiskFilter(signalScore, regime)) return null;

  // 4. Determine action: buy / sell / hold + size
  const decision = makeDecision(signalScore, regime);

  return { ...decision, timestamp: new Date() };
}
```

### Day 2-3 (June 11–12): Skill Integration

**2.1 Technical analysis skill setup**

The `technical-analysis` skill from `bitget-skill-hub` analyzes 23 indicators across 6 categories:
- Trend: MA, EMA, MACD, Parabolic SAR, ADX
- Momentum: RSI, CCI, Stochastic
- Volatility: Bollinger Bands, ATR, Keltner Channels, Donchian Channel
- Volume: OBV, VWAP, Money Flow Index
- Overlap: Support/Resistance, Pivot Points

Install Python dependencies for the skill:
```bash
pip install pandas numpy
```

**2.2 Sentiment analysis skill setup**

The `sentiment-analyst` skill covers:
- Fear & Greed index
- Long/short ratios
- Funding rates
- Open interest changes

**2.3 Market intel skill (optional but impressive)**

The `market-intel` skill adds on-chain and institutional data — ETF flows, whale activity, DeFi TVL. Showcasing this signals deep sponsor integration.

### Day 4 (June 13): First Complete Loop

- Agent fetches ticker → runs technical analysis → evaluates signals → generates trade decision → sim engine executes → logs result
- Verify end-to-end: data in, decision out, trade recorded
- Build a simple CLI or API route to trigger the full loop

### Day 5 (June 14): Backtesting Engine

- Replay historical candlestick data through the strategy
- Generate equity curve, win rate, max drawdown, Sharpe ratio
- Produce JSON report that the dashboard can render

**Deliverables at end of Phase 1:**
- [ ] Sim order engine working with portfolio tracking
- [ ] Market data service fetching live Bitget data via Agent Hub
- [ ] Technical + sentiment analysis integrated
- [ ] Decision engine with risk filters running
- [ ] Full perception → decision → sim execution → logging loop
- [ ] Backtesting producing equity curve data

---

## Phase 2 — React Dashboard (June 15–20)

### Goal: Professional dark-themed dashboard that showcases the agent live

#### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Header: WYRM Trader · Status Badge · Agent Controls       │
├──────────────────┬──────────────────────────────────────────┤
│                  │  Chart Area (8 cols)                     │
│  Signal Panel    │  ┌───────────────────────────────────┐   │
│  (6 cols)        │  │  Equity Curve + Portfolio Value   │   │
│                  │  └───────────────────────────────────┘   │
│  • Technical     │                                          │
│  • Sentiment     │  ┌──────────────┐  ┌────────────────┐   │
│  • Regime        │  │ Positions    │  │ Trade Log      │   │
│  • Score         │  │ Panel        │  │ (scrollable)   │   │
│                  │  └──────────────┘  └────────────────┘   │
├──────────────────┴──────────────────────────────────────────┤
│  Bottom Bar: Last Trade · Win Rate · Today's PnL            │
└─────────────────────────────────────────────────────────────┘
```

#### Components Breakdown (target ≤150 lines each)

**Dashboard Layout** (`features/trading-agent/components/dashboard.tsx`)

Main page component — orchestrates sub-components.

**Status Header** (`features/trading-agent/components/status-header.tsx`)

Agent status badge (running/stopped/paused), start/pause/stop controls, last cycle timestamp.

**Signal Panel** (`features/trading-agent/components/signal-panel.tsx`)

```tsx
// Real-time signal feed
interface SignalCard {
  type: "technical" | "sentiment" | "macro";
  name: string;
  value: number | string;
  direction: "bullish" | "bearish" | "neutral";
}

// Shows live signals from Agent Hub skills with color-coded indicators
```

**Equity Chart** (`features/trading-agent/components/equity-chart.tsx`)

Uses `recharts` to render the equity curve + portfolio value over time. Dark theme, smooth lines.

**Positions Panel** (`features/trading-agent/components/positions-panel.tsx`)

Active positions table: symbol, side, entry price, current price, unrealized PnL.

**Trade Log** (`features/trading-agent/components/trade-log.tsx`)

Scrollable table showing every trade with timestamp, symbol, side, price, reason, signals.

**Decision Replay** (`features/trading-agent/components/decision-replay.tsx`)

Shows the reasoning behind each decision — what signals were evaluated, what regime was detected, why the action was chosen.

#### State Management

Use URL search params + local state only:
- `?cycle=1` to view a specific agent cycle
- `?symbol=BTCUSDT` to filter by symbol
- No Redux/Zustand needed for hackathon scope

#### API Routes (Next.js App Router)

```typescript
// app/api/agent/cycle/route.ts — triggers one full perception→decision→exec loop
// app/api/agent/snapshot/route.ts — returns current portfolio snapshot
// app/api/agent/trades/route.ts — returns trade history
// app/api/agent/equity-curve/route.ts — returns equity curve data for chart
// app/api/agent/signals/route.ts — returns latest signals from all skills
```

### Deliverables at end of Phase 2:
- [ ] All dashboard components built and wired
- [ ] API routes returning live agent state
- [ ] Equity chart rendering from backtest/sim data
- [ ] Signal panel showing real-time data
- [ ] Trade log with full audit trail
- [ ] Decision replay showing reasoning
- [ ] Start/pause/stop controls functional
- [ ] Dashboard deployed to public URL (Vercel / Railway)

---

## Phase 3 — Polish & Submit (June 21–25)

### Day 1 (June 21): UI Polish

- Typography, spacing, visual hierarchy
- Loading states, empty states, error boundaries
- Smooth transitions and micro-interactions
- Mobile responsive check (even though judges will use desktop)

### Day 2 (June 22): Demo Video

**Requirements:** 3-minute demo video

Script outline:
1. **0:00–0:20** — Intro: what WYRM Trader is, problem it solves
2. **0:20–0:50** — Show the dashboard live, agent running
3. **0:50–1:30** — Walk through a signal → decision → trade flow
4. **1:30–2:10** — Show backtest results, equity curve
5. **2:10–2:40** — Highlight Agent Hub integration (Skills + Playbook)
6. **2:40–3:00** — Summary, why it stands out

Record with screen capture at 1920×1080 minimum.

### Day 3 (June 23): README & Community Posts

**README.md sections:**
- Project overview + architecture diagram
- Quick start instructions
- How Agent Hub MCP + Skills are integrated
- Sim trading engine explanation
- Screenshots of dashboard
- Backtest results summary
- Tradeoff / limitations section

**Community posts (3–4 total):**

Post 1: "Just joined the Bitget AI Base Camp Hackathon — building an autonomous trading agent with sim execution. Thread 🧵"

Post 2: Day-in-the-life dev update with screenshot of early dashboard or code

Post 3: Show the Agent Hub Skill integration in action (screenshot of technical analysis output)

Post 4: Final push video snippet or live demo GIF

All posts must include: `#BitgetHackathon` + `@BitgetAI`

### Day 4 (June 24): Final Review

- [ ] Demo link is live and publicly accessible
- [ ] Dashboard loads without errors
- [ ] Agent can run a full cycle start-to-finish
- [ ] Backtest report is present and renders correctly
- [ ] Trade log shows meaningful data
- [ ] Community posts are published (3+ minimum)
- [ ] README is clean and complete
- [ ] Video is recorded and uploaded
- [ ] All post links are collected for submission

### Day 5 (June 25): Submit

Submit form includes:
1. Project name + description
2. Public demo URL
3. Repository link
4. Demo video link
5. Community post links
6. How Bitget tools were used (Agent Hub MCP + Skills)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    WYRM TRADER — ARCHITECTURE                   │
│                                                                 │
│  ┌──────────────────────────────┐                              │
│  │   React Web Dashboard        │  ← Public demo URL           │
│  │   (Next.js App Router)       │                              │
│  │                              │                              │
│  │   • Status Header            │                              │
│  │   • Signal Panel             │                              │
│  │   • Equity Chart (recharts)  │                              │
│  │   • Positions Panel          │                              │
│  │   • Trade Log                │                              │
│  │   • Decision Replay          │                              │
│  └──────────┬───────────────────┘                              │
│             │ fetches from                                      │
│             ▼                                                   │
│  ┌──────────────────────────────┐                              │
│  │   Next.js API Routes         │                              │
│  │   /api/agent/cycle           │  ← triggers one loop         │
│  │   /api/agent/snapshot        │                              │
│  │   /api/agent/trades          │                              │
│  │   /api/agent/equity-curve    │                              │
│  └──────────┬───────────────────┘                              │
│             │ calls                                             │
│             ▼                                                   │
│  ┌──────────────────────────────┐                              │
│  │   Trading Agent (server)     │                              │
│  │                              │                              │
│  │  ┌──────────────┐           │                              │
│  │  │ Perception   │ ← Agent Hub MCP + Skill Hub             │
│  │  │ (market data,│    technical-analysis                   │
│  │  │  signals)    │    sentiment-analyst                    │
│  │  └──────┬───────┘    market-intel                        │
│  │         │                                               │
│  │  ┌──────▼───────┐           Risk Management              │
│  │  │ Decision     │ ← regime detection                     │
│  │  │ Engine       │ ← position sizing                      │
│  │  │              │ ← max drawdown checks                  │
│  │  └──────┬───────┘ ← daily trade limits                   │
│  │         │                                               │
│  │  ┌──────▼───────┐           Sim Engine (paper trading)   │
│  │  │ Execution    │ ← mock order matching                  │
│  │  │ (simulated)  │ ← portfolio tracking                   │
│  │  └──────┬───────┘ ← PnL calculation                     │
│  │         │                                               │
│  │  ┌──────▼───────┐           Audit Log                    │
│  │  │ Trade Log    │ ← every decision + reasoning          │
│  │  └──────────────┘     equity snapshots                   │
│  └──────────────────────────────┘                           │
│             │ calls                                           │
│             ▼                                                   │
│  ┌──────────────────────────────┐                              │
│  │   Bitget Exchange API        │  ← Read-only (market data)   │
│  │   via bitget-mcp-server      │     real prices used for    │
│  │   + bitget-client (bgc)      │     sim execution           │
│  └──────────────────────────────┘                              │
│                                                                 │
│   ⚠️ No real trading. All execution is simulated in local       │
│      order engine. Agent Hub used for market data feed only.    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scoring Levers Checklist

| Lever | How We Hit It | Status |
|-------|--------------|--------|
| Runnable demo | Live local URL with full agent loop (3 components: data→LLM→sim) | ✅ |
| Complete strategy loop | Perception → Decision → Sim Execution → Logging | ✅ |
| Sponsor tool integration | Bitget REST API v2 (live BTCUSDT data) + Python TA indicators | ✅ |
| Community posts | 3–4 X/Telegram posts with #BitgetHackathon @BitgetAI | ⬜ |
| Visual/UX quality | Professional dark dashboard, 6 components, Tailwind CSS | ✅ |
| LLM-powered decisions | Qwen 3.6+ via hackathon endpoint with TA citations | ✅ |

---

## Key Decisions Documented

1. **Sim trading only** — no real capital risk, better demo stability
2. **Track 1 (Trading Agent)** — plays to frontend strength, higher wow factor
3. **Bitget REST API v2 for market data** — direct endpoint calls (`/api/v2/spot/market/tickers`, `/api/v2/spot/market/candles`), no MCP CLI wrapper needed
4. **Python TA via subprocess** — `cli.py` wrapper calls `kline_indicators.py` for RSI/MACD/Bollinger Bands with Bitget's official formulas
5. **AI SDK (`@ai-sdk/openai-compatible`) + Qwen 3.6+** — hackathon endpoint compatible, avoids raw `openai` package issues
6. **Dotenv override for env loading** — `.env.local` loaded with `override: true` to bypass Next.js module cache
7. **Feature-based folder structure** — follows repo AGENTS.md rules
8. **Stop auto-flattens positions** — clear split between Stop (flatten at market) and Pause (preserve)
9. **Polling every 3s** — client-side `use-agent` hook with `lastKnownState` persistence
10. **No external state management** — React hooks + URL search params only

---

## Quick Commands Reference

```bash
# Start Next.js dev server
npm run dev

# Build production
npm run build

# Trigger one agent cycle via CLI (POST = manual trigger)
curl http://localhost:3000/api/agent/cycle -X POST

# Get current agent state
curl http://localhost:3000/api/agent/cycle

# Start/Pause/Stop agent
curl http://localhost:3000/api/agent/cycle?status=running  -X PUT
curl http://localhost:3000/api/agent/cycle?status=stopped  -X PUT

# Get server config (initialCash)
curl http://localhost:3000/api/agent/config

# Start Python TA CLI directly
python3 src/features/trading-agent/analysis/cli.py BTCUSDT 1h 50 --symbols BTCUSDT
```

## File Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout with globals.css
│   └── page.tsx                      # Dashboard entry point
│   └── api/
│       ├── agent/cycle/route.ts      # GET / POST / PUT agent lifecycle + state
│       └── agent/config/route.ts     # GET server config (initialCash)
├── features/trading-agent/
│   ├── components/
│   │   ├── dashboard.tsx             # Main 2-column grid layout
│   │   ├── status-header.tsx         # Agent controls + price ticker
│   │   ├── signal-panel.tsx          # Color-coded signal cards
│   │   ├── equity-chart.tsx          # Recharts area chart
│   │   ├── positions-panel.tsx       # Active positions table
│   │   └── trade-log.tsx             # Trade history + PnL summary
│   ├── hooks/
│   │   └── use-agent.ts              # Polling hook, state management
│   ├── services/
│   │   ├── agent-engine.ts           # Central agent orchestrator (state + timer)
│   │   ├── decision-engine.service.ts# TA evaluation → LLM → trading decision
│   │   ├── market-data.service.ts    # Bitget REST API v2 calls
│   │   ├── llm.service.ts            # AI SDK generateText wrapper
│   │   └── sim-order-engine.ts       # Paper trading execution engine
│   ├── analysis/
│   │   ├── cli.py                    # Node → Python subprocess bridge
│   │   ├── kline_indicators.py       # RSI, MACD, Bollinger Bands (480 lines)
│   │   ├── kline_indicator_utils.py  # Indicator utility functions (1401 lines)
│   │   └── requirements.txt          # pandas, numpy
│   ├── types/
│   │   ├── signal.types.ts           # Signal, Decision, Position, Trade interfaces
│   │   ├── market.types.ts           # TickerData, CandlestickData
│   │   ├── portfolio.types.ts        # PortfolioSnapshot, SimEngineConfig
│   │   └── index.ts                  # Barrel export
│   ├── schemas/
│   │   └── order.schema.ts           # Zod validation for orders
│   ├── constants/
│   │   └── symbols.constants.ts      # Default trading symbols
│   └── index.ts                      # Feature barrel export
└── shared/ui/
    ├── card.tsx                      # Card wrapper component
    ├── button.tsx                    # Styled button with variants
    ├── badge.tsx                     # Status badges
    ├── utils.ts                      # cn() utility
    └── index.ts                      # Barrel export
```

---

*Plan generated June 8, 2026 — ready to execute.*
