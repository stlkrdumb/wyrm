# Project Code Review, Suggestions & Feedback Report

**Project Name:** WYRM Trader  
**Target Submission:** Bitget AI Base Camp Hackathon S1 (Track 1: Trading Agent)  
**Date:** June 13, 2026  
**Auditor:** Code Review Agent  

---

## 1. Executive Summary

WYRM Trader is an autonomous multi-pair paper trading agent featuring a professional Next.js React dashboard and technical analysis driven by a Python subprocess model. The architecture is highly modular and adheres to a feature-based organization (`src/features/trading-agent`). Key strengths include real-time WebSocket price updates, automated bracket orders (take-profit/stop-loss), persistent portfolio balance recovery across crashes/restarts, and auto-fallback to heuristic strategies on LLM API failures.

However, several critical structural issues, security concerns, performance bottlenecks, and validation gaps must be addressed to ensure production stability, accurate simulations, and a seamless developer experience during deployment.

---

## 2. Code Architecture & Guidelines Compliance

### 2.1 File Size & Responsibility Limits
* **Compliance Status:** Mostly Compliant.
* **Findings:**
  * Component and helper files are well-sized, staying mostly under the 300-line hard limit defined in `AGENTS.md`.
  * **Violations/Risks:** `decision-helper.ts` (697 lines) and `agent-engine.ts` (509 lines) exceed the repository limit of 300 lines. These should be split. For example, `agent-engine.ts` can extract its lifecycle state transitions (`buildInitialState`, `setAgentStatus`, `resetInMemoryState`) to a separate `state-manager.ts` or `lifecycle-service.ts`.

### 2.2 Feature-Based Organization
* **Compliance Status:** Fully Compliant.
* **Findings:**
  * Components, services, hooks, types, and constants are correctly contained inside `src/features/trading-agent/`.
  * Shared UI primitives are appropriately located in `src/shared/ui/`.

---

## 3. Detailed Component Review & Technical Risks

### 3.1 `agent-engine.ts`: State Persistence & Divergence
* **Critical Issue:** Inside `setAgentStatus("stopped")`, multiple asynchronous operations (such as fetching live prices via `getLivePrice`) are called *before* the in-memory state is finalized and written to disk. If the Node process crashes or a request times out mid-execution, the in-memory state will diverge from `.data/portfolio-state.json`.
* **Fix Applied in Code:** A snapshot is now taken immediately, and the final state is written to disk inside a `try/catch` block once the memory updates are finished, preventing state divergence.

### 3.2 `order-executor.service.ts`: Execution Price Latency & Slippage
* **Critical Issue:** Live trading systems must separate *decision-making data* from *execution-fill data*. The agent must never execute simulated trades on stale REST candlestick snapshots.
* **Findings:** The code now correctly utilizes `resolveWsPrice()` to pull real-time prices directly from the live WS cache (`priceStore`) and verifies that updates are not stale (>60s). It falls back to skipping the trade if live price data is unavailable.

### 3.3 `decision-engine.service.ts`: Subprocess Safety & Cache Poisoning
* **Technical Risk:** Calling `exec("python3", [ANALYSIS_SCRIPT, JSON.stringify(ohlcvs)])` involves invoking a subprocess.
  1. **Subprocess Spawning Overhead:** In high-frequency configurations, spawning `python3` every cycle creates significant CPU overhead.
  2. **Cache Growth Risk:** `taCache` stores calculated technical indicators. Without size limits, it would cause slow memory leaks during long-running backtests. The cache now correctly enforces a limit of 200 entries (`TA_CACHE_MAX_ENTRIES`) and evicts the oldest items.

### 3.4 `market-ws.service.ts`: SSL Certificate Mismatch
* **Critical Error in Production Logs:**
  ```
  [WS] Socket error: Hostname/IP does not match certificate's altnames: Host: ws.bitget.com. is not in the cert's altnames: DNS:*.myrepublic.co.id
  ```
  This is a critical network certificate hijacking/filtering issue, likely caused by an ISP redirection page or proxy.
  * **Recommendation:** Implement proxy support or configure WebSocket connection options to handle custom CAs/agent proxies if the server runs in restricted environments.

---

## 4. Key Security & Operational Recommendations

1. **Decouple Python Execution (Optional but Recommended):**  
   Convert the Python CLI script (`cli.py`) into a lightweight FastAPI service running locally. Communicate over HTTP REST or IPC instead of spawning a new process shell via `execFile` every 30 seconds. This reduces execution latency from ~800ms to <50ms.

2. **Zod Validation in API Handlers:**  
   Ensure Zod schemas (`src/features/trading-agent/schemas/order.schema.ts`) validate all configurations sent to `POST /api/agent/breaker` or strategy overrides to prevent runtime crashes caused by malformed input values.

3. **Multi-Pair Scalability (Watchlist Handling):**  
   Limit the number of concurrent active symbols passed to a single Qwen prompt. The current implementation correctly pre-screens and caps evaluated pairs using `EVAL_MAX_PAIRS` (defaulting to 2) to avoid token context inflation and API latency spikes.

---

## 5. Summary Matrix & Action Items

| Component / File | Issue Severity | Description | Suggested Action |
| :--- | :--- | :--- | :--- |
| `decision-helper.ts` | **Medium** | Too large (697 lines) | Split helper prompts and parsers. |
| `agent-engine.ts` | **Medium** | Too large (509 lines) | Move start/stop lifecycle functions out. |
| `market-ws.service.ts` | **High** | SSL Handshake failure due to local ISP DNS redirection | Configure proxy fallback or custom agent headers. |
| `analysis/cli.py` | **Low** | High process startup latency | Migrating to microservices or warming process pools. |
