# WebSocket + Multi-Pair Trading Plan

> Status: **Planned** — not implemented yet.
> Created: 2025-06-08

---

## Current State

The agent uses a single pair (BTCUSDT) and polls Bitget REST API every ~60s:
1. `fetch()` → get ticker price from `/api/v2/spot/market/tickers`
2. Send OHLCV candles via REST to Python script for technical analysis
3. LLM analyzes one symbol at a time
4. Trade execution (simulated spot — no leverage, no perps)

Limitation: doesn't scale to multiple symbols. Polling N pairs = N API calls and high latency.

---

## Goal

Replace REST polling with WebSocket for real-time multi-pair price monitoring, while keeping REST as a reliable fallback for historical candle data needed by technical analysis.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐
│ Bitget WS API   │────▶│ WS Service   │────▶│ Price Store  │
│ (tickers,       │     │ (connection, │     │ (in-memory   │
│  candles)       │     │  heartbeat,  │     │  snapshot)   │
└─────────────────┘     │  re-connect) │     └──────┬───────┘
                        └──────────────┘            │
                                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│              Agent Engine (modified)                               │
│                                                                     │
│  Cycle:                                                        │
│  1. Read live prices from Price Store (WS, instant)             │
│  2. Fetch candles via REST only when needed (TA cache)          │
│  3. LLM evaluates ALL active pairs in ONE prompt                │
│  4. Execute highest-conviction trades first                     │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │ Dashboard       │
              │ (real-time)     │
              └─────────────────┘
```

---

## Protocol Details (from Bitget docs)

### Endpoints
| Endpoint | Purpose | Auth |
|---|---|---|
| `wss://ws.bitget.com/v2/ws/public` | Market data: tickers, candles, orderbook | None |
| `wss://ws.bitget.com/v2/ws/private` | Account data, trading | HMAC-SHA256 login required |

**Only `/public` is needed** for current scope (price monitoring + simulation). Private requires API key auth via:
```
HMAC-SHA256(timestamp + "GET" + "/user/verify", secretKey) → Base64 encode
→ send { op: "login", args: { apiKey, passphrase, timestamp, sign } }
```

### Connection Constraints
- Max 300 connection requests/IP/5min, max 100 connections/IP
- Max 240 subscription requests/hour/connection
- Max 1000 channel subscriptions per connection (but recommended: < 50)
- Server accepts up to **10 messages/sec** total (ping + JSON) — exceeding disconnects you
- Server auto-disconnects if no `ping` received in **2 minutes**

### Heartbeat
- Client sends plain string `"ping"` every **30 seconds**
- Expect back `"pong"`
- If no pong → reconnect with exponential backoff

### Subscription Format
```json
{
  "op": "subscribe",
  "args": [
    { "instType": "SPOT", "channel": "ticker", "instId": "BTCUSDT" },
    { "instType": "SPOT", "channel": "candle1h", "instId": "BTCUSDT" }
  ]
}
```

### Incoming Message Formats

**Ticker channel:**
```json
{
  "action": "snapshot",
  "arg": { "instType": "SPOT", "channel": "ticker", "instId": "BTCUSDT" },
  "data": [{
    "instId": "BTCUSDT",
    "lastPr": "67820.5",
    "high24h": "68500.0",
    "low24h": "66100.2",
    "baseVol": "12345.67",
    "quoteVol": "837M",
    "priceRate": "1.2",
    "ts": "1709xxx"
  }]
}
```

**Candle channel:**
```json
{
  "arg": { "instType": "SPOT", "channel": "candle1h", "instId": "BTCUSDT" },
  "data": [["1709xxx","67500.0","68200.0","66800.0","67820.0","12345.6"]]
}
```

**Login response (private channel only):**
```json
{ "event": "login", "code": "0", "msg": "" }  // success
{ "event": "error", "code": "30005", "msg": "..." } // failure
```

---

## Implementation Phases

### Phase 1: WebSocket Connection Layer
**File:** `src/features/trading-agent/services/market-ws.service.ts` (new)

Responsibilities:
- Create WebSocket connection to `wss://ws.bitget.com/v2/ws/public`
- Send subscription message on connect with all configured symbols/channels
- Handle incoming messages: parse ticker/candle data → push to Price Store
- 30-second heartbeat: send `"ping"`, expect `"pong"` within 5s
- Auto-reconnect on disconnect/close/error with exponential backoff (1s → 2s → 4s → max 30s)
- Log `reconnectCount` — alert if > 5 consecutive reconnects

Key behaviors:
- No auth needed for public channels
- On reconnect, must **resubscribe** to all channels (Bitget doesn't persist subscriptions)
- Max recommended: < 50 channel subscriptions per connection

### Phase 2: Price Store
**File:** `src/features/trading-agent/services/price-store.ts` (new)

In-memory cache replacing REST polling as primary data source.

```typescript
interface PriceSnapshot {
  symbol: string;
  lastPrice: number;
  high24h: number;
  low24h: number;
  baseVolume: number;      // coin volume (not USDT)
  quoteVolume: number;     // USDT volume
  changePercent: number;
  updatedAt: Date;
}

class PriceStore {
  private cache = new Map<string, PriceSnapshot>();

  updateTicker(symbol: string, raw: Record<string, any>): void;
  getCached(symbol: string): PriceSnapshot | undefined;
  getAll(): Map<string, PriceSnapshot>;
  isStale(symbol: string, thresholdMs = 60_000): boolean;
}
```

WS service calls `store.updateTicker()` on every incoming ticker message.
Agent engine calls `store.getCached("BTCUSDT")` per cycle (zero latency).
Stale check: if a symbol hasn't received a WS tick in 60s, trigger REST fallback for that symbol only.

### Phase 3: Multi-Pair Configuration
**File:** `.env.local` additions

```env
TRADING_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT   # Active — agent trades these
MONITOR_SYMBOLS=XRPUSDT,ADAUSDT                    # Watchlist — shown on dashboard only
MAX_ACTIVE_POSITIONS=3                             # Prevent over-allocation
```

Two lists keep LLM costs manageable:
- **Active** set (2–4 pairs) gets full LLM analysis each cycle
- **Watchlist** set is monitored via WS, surfaces interesting moves without triggering LLM calls

### Phase 4: Modified Agent Engine — Multi-Pair Cycle

**File:** `src/features/trading-agent/services/agent-engine.ts` (modify)

New cycle flow (60s interval):
1. Read prices from Price Store — instant, WS-backed
2. Stale check — REST fallback fetch for any symbol with no WS update in 60s
3. Fetch candles — still REST, but cache by `${symbol}_${timeframe}` with 5-min TTL
4. Multi-pair LLM prompt — one request sends all active pair data:

```
Analyze these pairs and return a decision for EACH:

BTCUSDT: $67,820 | 24h +1.2% | RSI(14): 62 | MACD HIST: +85
ETHUSDT: $3,450  | 24h -0.8% | RSI(14): 28 | MACD HIST: -42
SOLUSDT: $142    | 24h +3.5% | RSI(14): 72 | MACD HIST: +120

Return JSON:
{
  "BTCUSDT": {"action":"hold","strength":0.1,"confidence":0.6,"reason":"..."},
  "ETHUSDT": {"action":"buy","strength":0.65,"confidence":0.8,"reason":"..."},
  "SOLUSDT": {"action":"sell","strength":-0.5,"confidence":0.7,"reason":"..."}
}
```

5. Execute trades — sort by conviction (`abs(strength)`), respect per-pair capital limits (max 20% equity per position)

**Why one LLM call:** Analyzing multiple pairs in a single prompt saves cost and latency vs. one call per pair.

### Phase 5: Types & Dashboard Updates

**New types:**
```typescript
interface WSChannel {
  instType: "SPOT" | "USDT-FUTURES";
  channel: "ticker" | "candle1h" | "candle5m" | ...;
  instId: string;
}

type WSMessage =
  | { event: "subscribe"; arg: WSChannel }
  | { error?: string; code?: number }
  | { action: "snapshot" | "incremental"; arg: WSChannel; data: any[] }
  | { ping?: never; pong?: "pong" };
```

**Dashboard additions:**
- "Market Watch" panel — all subscribed symbols with live prices, color-coded on tick (green flash up, red flash down)
- WebSocket status indicator in header: "● Connected" / "● Connecting..." / "⚠ Reconnecting"

---

## File Changes Summary

| File | Action | Purpose |
|---|---|---|
| `services/market-ws.service.ts` | **New** | WS connection, subscribe, heartbeat, reconnect, message parsing |
| `services/price-store.ts` | **New** | In-memory ticker cache written by WS, read by engine |
| `services/market-data.service.ts` | Modify | Keep REST as fallback only; mark getTickerPrice() deprecated for normal cycles |
| `services/decision-engine.service.ts` | Modify | buildAnalysisPrompt → multi-pair input; parseDecisionResponse → per-symbol decisions |
| `services/agent-engine.ts` | Modify | Read from PriceStore instead of REST, process multi-pair LLM response |
| `types/market.types.ts` / `signal.types.ts` | Add | WSChannel, WSMessage types |
| `hooks/use-agent.ts` | Modify | Subscribe to price updates from WS for real-time dashboard |
| `components/dashboard.tsx` | Modify | New Market Watch panel + WS status indicator |
| `.env.local` | Add vars | TRADING_SYMBOLS, MONITOR_SYMBOLS, MAX_ACTIVE_POSITIONS |

---

## Risks & Mitigations

1. **WS connection reliability** — Public endpoint may disconnect unexpectedly. Mitigated by auto-reconnect with backoff and REST fallback for stale data.
2. **Candle data latency** — WS candle updates are incremental (one bar at a time), not full 50-bar history needed for RSI/MACD. Still need REST to fetch historical candles, cached with 5-min TTL.
3. **LLM cost per cycle** — Multi-pair prompt costs slightly more than single-pair, but it's still one API call vs N separate calls. Net savings.
4. **Python TA bottleneck** — ~30s for candle fetch + analysis is still the slowest step. Cached with TTL to avoid re-fetching same symbol on every cycle.
5. **Multi-pair capital allocation** — Must ensure portfolio isn't over-allocated across too many pairs simultaneously. Per-pair max position size rule (e.g., 20% of equity).

---

## Out of Scope (Future)

- **Private WS channel** (`/private`) — needed for real trading (order placement, account balance sync). Would require API key setup in `.env.local`.
- **Event-driven emergency cycles** — trigger LLM immediately on flash crash or spike detected via WS. Currently all decisions happen on 60s interval.
- **WebSocket orderbook depth** — currently not subscribed but available via `channel: "bbo-tbt"`. Could enhance TA with real-time spread analysis.
