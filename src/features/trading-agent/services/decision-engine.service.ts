/**
 * Decision Engine — barrel re-export for backward compatibility.
 * All logic is now in the ./decision-engine/ module.
 */
export {
  evaluateMultiPair,
  evaluateSignals,
  evaluateDecision,
  type MultiPairResult,
} from "./decision-engine/decision-engine.service";
export { calculateRsi } from "./decision-engine/screening";
