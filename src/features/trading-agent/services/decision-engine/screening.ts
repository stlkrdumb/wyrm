/**
 * Symbol screening — selects which symbols to evaluate with the LLM each cycle.
 * Uses 1h RSI pre-screening to pick the most actionable candidates.
 */
import type { Position } from "@/features/trading-agent/types";
import { getCandlesWithCache } from "../market-data.service";

const SCREENING_MODE = process.env.SCREENING_MODE || "momentum";
const EVAL_MAX_PAIRS = Number(process.env.EVAL_MAX_PAIRS) || 2;

interface SetupScore {
  symbol: string;
  rsi: number;
  score: number;
}

/** Calculate Wilder's RSI (14-period) in TypeScript */
export function calculateRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/** Score a symbol's setup for screening (higher score = more actionable). */
export async function scoreSymbolSetup(symbol: string): Promise<SetupScore> {
  try {
    const candles = await getCandlesWithCache(symbol, "1h", 50);
    if (candles && candles.length >= 20) {
      const closes = candles.map(c => c.close);
      const rsi = calculateRsi(closes);
      const score = SCREENING_MODE === "reversal" ? 100 - rsi : rsi;
      return { symbol, rsi, score };
    }
  } catch (err) {
    console.warn(`[Screening] Pre-screen failed for ${symbol}:`, err);
  }
  return { symbol, rsi: 50, score: 0 };
}

/**
 * Select symbols for LLM evaluation.
 * - Always includes active positions (up to EVAL_MAX_PAIRS)
 * - Fills remaining slots with top setup candidates by RSI score
 */
export function selectSymbolsForEvaluation(
  allSymbols: string[],
  activePositions: Position[] = []
): { selected: string[]; skipped: string[] } {
  const positionSymbols = new Set(activePositions.map(p => p.symbol.toUpperCase()));

  const held = allSymbols.filter(s => positionSymbols.has(s.toUpperCase()));
  const candidates = allSymbols.filter(s => !positionSymbols.has(s.toUpperCase()));

  // Always evaluate held positions first (up to the cap)
  const selected: string[] = held.slice(0, EVAL_MAX_PAIRS);

  if (candidates.length > 0) {
    const slotsToFill = Math.max(EVAL_MAX_PAIRS, EVAL_MAX_PAIRS - selected.length);
    // Use pre-computed candidateSetups from evaluateMultiPair
    return {
      selected: selected.slice(0, EVAL_MAX_PAIRS),
      skipped: allSymbols.filter(s => !selected.includes(s)),
    };
  }

  return { selected: allSymbols, skipped: [] };
}

/** Sort candidates by setup score (descending) and take the top N. */
export function sortCandidatesBySetup(candidates: SetupScore[], topN: number): string[] {
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, topN).map(c => c.symbol);
}
