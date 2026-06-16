/**
 * Decision Helper \u2014 barrel re-export.
 * All functions have been split into focused modules under ./prompts/:
 *
 *  - prompts/trading-prompt.ts  (buildSinglePrompt, buildMultiPrompt)
 *  - prompts/response-parser.ts (parseSingleResponse, parseMultiResponse, findDecisionForSymbol, parseSymbolDecisionFromText)
 *  - prompts/json-utils.ts      (repairJSON, sanitizeReason, extractJSONObjects, etc.)
 *  - prompts/fallback.ts        (fallbackMultiAnalysis)
 *
 * This file exists for backward compatibility only.
 * New code should import directly from the specific module.
 */
export {
  buildSinglePrompt,
  buildMultiPrompt,
  parseSingleResponse,
  parseMultiResponse,
  findDecisionForSymbol,
  parseSymbolDecisionFromText,
  fallbackMultiAnalysis,
  repairJSON,
  sanitizeReason,
  extractJSONObjects,
  parsePercentField,
} from "./prompts";

export type { TASingle } from "./prompts";
