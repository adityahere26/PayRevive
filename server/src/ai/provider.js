// The AIProvider boundary. Business logic (the future Recovery Engine caller — see
// AGENT_DESIGN.md § Agent architecture) depends on this module, never on `./gemini/*`
// directly, so swapping the runtime AI provider later is a change confined to this file.
//
//   AIProvider
//       ↓
//   GeminiProvider   (the only implementation today)
//
// @typedef {Object} AIProvider
// @property {string} name
// @property {(context: object, deps?: object) => Promise<{recommendedAction: string, reason: string, confidence: number, fallback: boolean}>} planRecoveryDecision

import { planRecoveryDecision } from "./gemini/planner.js";

const GEMINI_PROVIDER = Object.freeze({
  name: "gemini",
  planRecoveryDecision,
});

/**
 * Returns the currently-configured AI provider. Always Gemini today — kept as a function
 * (not a bare export of the object) so a future provider switch changes one line here rather
 * than every call site.
 * @returns {AIProvider}
 */
export function getAIProvider() {
  return GEMINI_PROVIDER;
}
