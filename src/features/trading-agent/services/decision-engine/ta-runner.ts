/**
 * Technical Analysis runner — runs Python TA script for one symbol+timeframe.
 * Includes request coalescing and TTL-based caching.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  fetchCandlesForTA,
  getCachedTA,
  getInflightTA,
  setInflightTA,
  clearInflightTA,
  setCachedTA,
} from "./ta-cache";

const exec = promisify(execFile);
const ANALYSIS_SCRIPT = path.join(
  process.cwd(),
  "src/features/trading-agent/analysis/cli.py"
);

const PYTHON_TIMEOUT_MS = 30_000;

/** Run Python TA script and extract key indicators. */
async function runPythonTA(symbol: string, candles: any[]): Promise<any> {
  const execResult = await exec("python3", [
    ANALYSIS_SCRIPT,
    JSON.stringify({
      symbol,
      ohlcvs: candles.map((c) => [c.timestamp, c.open, c.high, c.low, c.close, c.volume]),
      indicators: {
        MACD: { fast: 12, slow: 26, signal: 9 },
        RSI: { period: 14 },
        BOLL: { period: 20, std_dev: 2 },
        ATR: { period: 14 },
        EMA: { period: 20 },
      },
    }),
  ], { timeout: PYTHON_TIMEOUT_MS });

  return JSON.parse(execResult.stdout);
}

/** Extract the latest value from a Python TA series. */
function latestValue(series: number[] | undefined, fallback: number): number {
  if (!series || series.length === 0) return fallback;
  const value = series[series.length - 1];
  return value != null ? Number(value) : fallback;
}

/** Format Python TA output into a clean indicators object. */
function formatTAOutput(output: any, latestClose: number): any {
  const rsi = output.indicators?.RSI?.series?.RSI_14;
  const macd = output.indicators?.MACD;
  const boll = output.indicators?.BOLL;
  const atrObj = output.indicators?.ATR;
  const emaObj = output.indicators?.EMA;

  return {
    close: latestClose,
    rsi: latestValue(rsi, 50),
    macdDif: latestValue(macd?.series?.DIF, 0),
    macdHist: latestValue(macd?.series?.HIST, 0),
    bollUpper: latestValue(boll?.series?.UPPER, 0),
    bollMiddle: latestValue(boll?.series?.MIDDLE, 0),
    bollLower: latestValue(boll?.series?.LOWER, 0),
    atr: latestValue(atrObj?.series?.ATR, 0),
    ema20: latestValue(emaObj?.series?.EMA_20, 0),
  };
}

/** Run TA for one symbol+timeframe, with cache and request coalescing. */
export async function runTAForTimeframe(symbol: string, interval: string): Promise<any> {
  // Cache hit
  const cached = getCachedTA(symbol, interval);
  if (cached) return cached;

  // Coalesce concurrent requests for the same key
  const inflight = getInflightTA(symbol, interval);
  if (inflight) return inflight;

  // Create the promise and store it for coalescing
  const promise = (async () => {
    const candles = await fetchCandlesForTA(symbol, interval);
    if (!candles || candles.length < 20) return null;

    try {
      const output = await runPythonTA(symbol, candles);
      const result = formatTAOutput(output, candles[candles.length - 1].close);
      setCachedTA(symbol, interval, result);
      return result;
    } catch (err) {
      console.error(`[TA] Python TA failed for ${symbol} (${interval}):`, err);
      return null;
    }
  })();

  setInflightTA(symbol, interval, promise);
  try {
    return await promise;
  } finally {
    clearInflightTA(symbol, interval);
  }
}
