import readline from "node:readline";
import dotenv from "dotenv";
import path from "node:path";

// Load environment config
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || "wyrm-hackathon-demo-2026";
const PORT = process.env.BACKEND_PORT || 3001;
const BACKEND_URL = `http://localhost:${PORT}`;

// Colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const GRAY = "\x1b[90m";

async function apiCall(endpoint: string, method: string = "GET", body: any = null): Promise<any> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${AUTH_TOKEN}`,
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function clearScreen() {
  process.stdout.write("\x1bc");
}

let activeMessage = "";
let refreshing = false;
let lastState: any = null;

async function fetchState() {
  try {
    lastState = await apiCall("/api/agent/cycle");
  } catch (err: any) {
    activeMessage = `${RED}Connection failed to backend: ${err.message}${RESET}`;
    lastState = null;
  }
}

function renderUI() {
  clearScreen();
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}                    WYRM TERMINAL CONTROL CENTER                       ${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);

  if (!lastState) {
    console.log(`\n  ${RED}❌ BACKEND OFFLINE or UNREACHABLE${RESET}`);
    console.log(`  Backend URL: ${YELLOW}${BACKEND_URL}${RESET}`);
    if (activeMessage) console.log(`\n  ${activeMessage}`);
    renderMenu(null);
    return;
  }

  const { status, modelName, portfolio, positions, trades, wsStatus, logs } = lastState;

  // Status & Model Row
  const statusStr = status === "running" ? `${GREEN}${BOLD}RUNNING${RESET}` : status === "paused" ? `${YELLOW}${BOLD}PAUSED${RESET}` : `${RED}${BOLD}STOPPED${RESET}`;
  const wsStatusStr = wsStatus === "connected" ? `${GREEN}CONNECTED${RESET}` : `${RED}DISCONNECTED${RESET}`;
  console.log(`  Status: [${statusStr}]  |  Model: ${YELLOW}${modelName}${RESET}  |  WS Feed: [${wsStatusStr}]`);
  console.log(`${GRAY}------------------------------------------------------------------------${RESET}`);

  // Portfolio metrics
  const cash = portfolio.cash ?? 0;
  const equity = portfolio.equity ?? 0;
  const totalPnL = portfolio.totalPnL ?? 0;
  const pnlColor = totalPnL >= 0 ? GREEN : RED;
  console.log(`  Cash:   ${CYAN}$${cash.toFixed(2)}${RESET}`);
  console.log(`  Equity: ${CYAN}$${equity.toFixed(2)}${RESET}`);
  console.log(`  PnL:    ${pnlColor}${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}${RESET} (${portfolio.winRate?.toFixed(1)}% Win Rate, ${portfolio.totalTrades} Trades)`);
  console.log(`${GRAY}------------------------------------------------------------------------${RESET}`);

  // Open Positions
  console.log(`${BOLD}  ACTIVE POSITIONS:${RESET}`);
  if (!positions || positions.length === 0) {
    console.log(`    ${GRAY}(no active positions)${RESET}`);
  } else {
    positions.forEach((p: any) => {
      const posPnL = p.unrealizedPnL ?? 0;
      const posPnLColor = posPnL >= 0 ? GREEN : RED;
      console.log(`    • ${BOLD}${p.symbol}${RESET} | ${p.side.toUpperCase()} | Size: ${p.size} | Entry: $${p.entryPrice.toFixed(2)} | PnL: ${posPnLColor}${posPnL >= 0 ? "+" : ""}$${posPnL.toFixed(2)}${RESET}`);
    });
  }
  console.log(`${GRAY}------------------------------------------------------------------------${RESET}`);

  // Recent Trades
  console.log(`${BOLD}  RECENT TRADES:${RESET}`);
  const recentTrades = trades ? trades.slice(-3) : [];
  if (recentTrades.length === 0) {
    console.log(`    ${GRAY}(no trades logged yet)${RESET}`);
  } else {
    recentTrades.reverse().forEach((t: any) => {
      const pnlStr = t.pnl !== null ? ` | PnL: ${t.pnl >= 0 ? GREEN : RED}${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}${RESET}` : "";
      console.log(`    • [${t.action.toUpperCase()}] ${t.symbol} ${t.side.toUpperCase()} at $${t.price.toFixed(2)}${pnlStr}`);
    });
  }
  console.log(`${GRAY}------------------------------------------------------------------------${RESET}`);

  // Recent Logs
  console.log(`${BOLD}  AGENT LOGS:${RESET}`);
  const recentLogs = logs ? logs.slice(-3) : [];
  if (recentLogs.length === 0) {
    console.log(`    ${GRAY}(no logs logged yet)${RESET}`);
  } else {
    recentLogs.reverse().forEach((l: any) => {
      const lvlColor = l.level === "error" ? RED : l.level === "warning" ? YELLOW : l.level === "action" ? GREEN : CYAN;
      console.log(`    [${lvlColor}${l.level.toUpperCase()}${RESET}] ${l.message}`);
    });
  }
  console.log(`${GRAY}------------------------------------------------------------------------${RESET}`);

  if (activeMessage) {
    console.log(`\n  ${activeMessage}`);
  }

  renderMenu(status);
}

function renderMenu(status: string | null) {
  console.log(`\n${BOLD}  OPTIONS:${RESET}`);
  if (status === null) {
    console.log(`  [R] Retry connection to backend`);
    console.log(`  [Q] Exit controller`);
    return;
  }
  
  if (status !== "running") {
    console.log(`  [1] ${GREEN}Start Agent (Resume cycle / trades)${RESET}`);
  }
  if (status === "running") {
    console.log(`  [2] ${YELLOW}Pause Agent (Keep positions, pause trade scans)${RESET}`);
  }
  if (status !== "stopped") {
    console.log(`  [3] ${RED}Stop Agent (Flatten all positions at market price)${RESET}`);
  }
  
  console.log(`  [T] Trigger manual evaluation cycle (must be in RUNNING status)`);
  console.log(`  [X] Reset entire agent state (Flat positions + initial cash fallback)`);
  console.log(`  [R] Force refresh dashboard data`);
  console.log(`  [Q] Exit controller`);
  process.stdout.write(`\n${BOLD}Choose an option: ${RESET}`);
}

async function handleInput(key: string) {
  if (refreshing) return;
  const choice = key.trim().toLowerCase();

  if (choice === "q") {
    clearScreen();
    console.log(`\n  ${GREEN}Goodbye!${RESET}\n`);
    process.exit(0);
  }

  if (choice === "r") {
    activeMessage = `${CYAN}Refreshing state...${RESET}`;
    renderUI();
    await fetchState();
    activeMessage = `${GREEN}State refreshed ✓${RESET}`;
    renderUI();
    return;
  }

  if (!lastState) {
    activeMessage = `${RED}No backend connection. Type 'R' to retry.${RESET}`;
    renderUI();
    return;
  }

  refreshing = true;
  try {
    if (choice === "1") {
      activeMessage = `${CYAN}Starting agent...${RESET}`;
      renderUI();
      await apiCall(`/api/agent/cycle?status=running`, "PUT");
      activeMessage = `${GREEN}Agent status updated to: RUNNING ✓${RESET}`;
    } else if (choice === "2") {
      activeMessage = `${CYAN}Pausing agent...${RESET}`;
      renderUI();
      await apiCall(`/api/agent/cycle?status=paused`, "PUT");
      activeMessage = `${YELLOW}Agent status updated to: PAUSED ✓${RESET}`;
    } else if (choice === "3") {
      activeMessage = `${CYAN}Stopping and flattening positions...${RESET}`;
      renderUI();
      const res = await apiCall(`/api/agent/cycle?status=stopped`, "PUT");
      activeMessage = `${RED}Agent status updated to: STOPPED (Closed: ${res.closed} positions, realized PnL: $${res.realizedPnl?.toFixed(2) || 0}) ✓${RESET}`;
    } else if (choice === "t") {
      if (lastState.status !== "running") {
        activeMessage = `${RED}Cannot run cycle: Agent is not in RUNNING status.${RESET}`;
      } else {
        activeMessage = `${CYAN}Triggering manual perception cycle (takes ~15-20s)...${RESET}`;
        renderUI();
        await apiCall(`/api/agent/cycle`, "POST");
        activeMessage = `${GREEN}Manual cycle finished successfully! ✓${RESET}`;
      }
    } else if (choice === "x") {
      activeMessage = `${RED}Confirm Reset? Type 'YES' to clear cash/positions or any other key to cancel:${RESET} `;
      renderUI();
      
      const confirm = await new Promise<string>((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question("", (answer) => {
          rl.close();
          resolve(answer.trim().toUpperCase());
        });
      });

      if (confirm === "YES") {
        activeMessage = `${CYAN}Resetting backend balance and positions...${RESET}`;
        renderUI();
        await apiCall(`/api/agent/reset`, "POST");
        activeMessage = `${GREEN}Reset successful (portfolio returned to initialCash) ✓${RESET}`;
      } else {
        activeMessage = `${YELLOW}Reset cancelled.${RESET}`;
      }
    } else {
      activeMessage = `${RED}Invalid choice: ${key}${RESET}`;
    }
  } catch (err: any) {
    activeMessage = `${RED}Action failed: ${err.message}${RESET}`;
  } finally {
    refreshing = false;
    await fetchState();
    renderUI();
  }
}

async function startController() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  // Initial load
  activeMessage = `${CYAN}Connecting to standalone backend server...${RESET}`;
  renderUI();
  await fetchState();
  renderUI();

  // Polling loop to refresh UI every 5s silently
  setInterval(async () => {
    if (!refreshing) {
      await fetchState();
      renderUI();
    }
  }, 5000);

  process.stdin.on("keypress", (str, key) => {
    // ctrl-c handles SIGINT
    if (key.ctrl && key.name === "c") {
      clearScreen();
      process.exit(0);
    }
    // Only process alphanumeric keypresses if not in prompt dialog
    if (str && !refreshing) {
      handleInput(str);
    }
  });
}

startController();
