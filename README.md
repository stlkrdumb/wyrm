# 🐉 WYRM Trader

WYRM Trader is a state-of-the-art autonomous trading agent developed for the **Bitget AI Base Camp Hackathon S1 (Track 1 — Trading Agent)**. It features a fully operational perception-decision-execution cycle backed by a real-time React web dashboard.

---

## 🚀 Key Features

* **Multi-Pair WebSocket Data**: Ingests real-time Spot ticker streams for `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, and `BNBUSDT` directly from the Bitget WS server, with automatic REST fallback polling through residential proxies if direct connections are restricted.
* **Official Bitget Formula TA**: Runs high-fidelity technical indicator calculations (RSI, MACD, Bollinger Bands) using official Bitget formulas written in Python.
* **LLM Decision Engine**: Evaluates TA signals and price trends via OpenAI-compatible endpoints (supporting Qwen 3.6+) with an automatic timeout and model-fallback mechanism (`qwen3.6-plus` ⇄ `qwen3.6-flash`).
* **Paper Trading Execution**: Simulates trades using a real-time order matching engine. Supports long position tracking, average entry price recalculations, and reactive unrealized PnL updates.
* **Auditability & Log Trails**: Maintains persistent portfolio state on disk (`.data/portfolio-state.json`) with start/pause/stop lifecycle controls that automatically flatten active positions at current market rates upon stopping.
* **Premium React Dashboard**: Visualizes agent status, signal feeds, active positions, a scrollable trade log, and a dynamic equity curve powered by Recharts.

---

## 🛠️ Architecture Overview

```
 ┌──────────────────────────────┐
 │     React Web Dashboard      │  ← Start/Pause/Stop Lifecycle
 │    (Next.js App Router)      │  ← Live equity chart & trades
 └──────────────┬───────────────┘
                │ fetches state
                ▼
 ┌──────────────────────────────┐
 │    Next.js API Endpoints     │
 │  /api/agent/cycle (GET/POST) │
 └──────────────┬───────────────┘
                │ orchestrates
                ▼
 ┌──────────────────────────────┐
 │   Trading Agent Core Engine  │
 │  - ws-helpers / price-store  │  ← Real-time WS Tickers
 │  - decision-engine.service   │  ← Ingests TA & triggers LLM
 │  - agent-helpers / executor  │  ← Paper order matching
 └──────────────┬───────────────┘
                │ fallback REST
                ▼
 ┌──────────────────────────────┐
 │      Bitget REST API v2      │
 └──────────────────────────────┘
```

---

## ⚙️ Setup & Configuration

Configure the agent via a `.env.local` file at the root of the project:

```env
# Server Config
PORT=3000

# Bitget API (Read-only for Market Data)
BITGET_API_KEY="your-api-key"
BITGET_SECRET_KEY="your-secret-key"
BITGET_PASSPHRASE="your-passphrase"


# LLM Engine Config
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_API_KEY="your-llm-api-key"
LLM_MODEL="qwen3.6-plus"
LLM_MODEL_FAST="qwen3.6-flash"
LLM_PLUS_TIMEOUT_MS=15000

# Trading Settings
SIM_INITIAL_CASH=1000
TRADING_SYMBOLS="BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT"
MAX_ACTIVE_POSITIONS=3
```

### 📦 Installation

1. Install Node.js dependencies:
   ```bash
   npm install
   ```
2. Install Python requirements for technical analysis:
   ```bash
   pip3 install -r src/features/trading-agent/analysis/requirements.txt
   ```

---

## 🏃 Run the Agent

### Development Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run start
```

### Control the Agent Loop
The agent runs an automatic perception → decision → execution cycle every 3 seconds while in `running` state.
* **Trigger a cycle manually**:
  ```bash
  curl -X POST http://localhost:3000/api/agent/cycle
  ```
* **Toggle state (running/paused/stopped)**:
  ```bash
  curl -X PUT "http://localhost:3000/api/agent/cycle?status=running"
  ```
