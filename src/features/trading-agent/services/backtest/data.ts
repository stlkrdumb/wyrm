import fs from "node:fs";
import path from "node:path";
import type { Candlestick } from "@/features/trading-agent/types";
import { config } from "../state-store";
import { getCandlesWithCache } from "../market-data.service";

const DATA_DIR = ".data/backtests";
const DATA_FILE = path.join(process.cwd(), ".data", "backtests", "backtest-data.json");

export type BacktestData = Record<string, { "5m": Candlestick[]; "1h": Candlestick[]; "1d": Candlestick[] }>;

/** Load or fetch historical backtest data from file/cache. */
export async function loadBacktestData(): Promise<BacktestData> {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as BacktestData;
  }

  console.log(`[Backtest] Data file not found. Fetching fresh historical candles...`);
  if (!fs.existsSync(path.join(process.cwd(), DATA_DIR))) {
    fs.mkdirSync(path.join(process.cwd(), DATA_DIR), { recursive: true });
  }

  const freshData: BacktestData = {};
  const envBacktestSymbols = process.env.BACKTEST_TRADING_SYMBOLS
    ? process.env.BACKTEST_TRADING_SYMBOLS.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
    : ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "PEPEUSDT"];
  const symbolsToFetch = [...new Set(["BTCUSDT", ...envBacktestSymbols])];

  for (const symbol of symbolsToFetch) {
    console.log(`[Backtest] Fetching candles for ${symbol}...`);
    try {
      const [candles5m, candles1h, candles1d] = await Promise.all([
        getCandlesWithCache(symbol, "5m", 1000),
        getCandlesWithCache(symbol, "1h", 200),
        getCandlesWithCache(symbol, "1d", 200),
      ]);
      freshData[symbol] = { "5m": candles5m, "1h": candles1h, "1d": candles1d };
    } catch (err) {
      console.error(`[Backtest] Failed to fetch candles for ${symbol}:`, err);
    }
  }

  if (Object.keys(freshData).length === 0 || !freshData["BTCUSDT"]) {
    throw new Error("Failed to fetch historical backtest data from public endpoints");
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(freshData, null, 2));
  console.log(`[Backtest] Saved historical candles to ${DATA_FILE}`);
  return freshData;
}

/** Get the number of steps to run for backtest (max 30). */
export function getBacktestStepRange(btc1h: Candlestick[], stepsToRun = 30): { startIdx: number; endIdx: number } {
  const endIdx = btc1h.length - 1;
  const startIdx = Math.max(0, endIdx - stepsToRun + 1);
  return { startIdx, endIdx };
}
