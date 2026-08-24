// The AIProvider boundary. Business logic (the Recovery Engine and, as of Day 5, the voice
// routes — see AGENT_DESIGN.md § Agent architecture / § Voice pipeline) depends on this
// module, never on `./gemini/*` directly, so swapping the runtime AI provider later is a
// change confined to this file.
//
//   AIProvider
//       ↓
//   GeminiProvider   (the only implementation today)
//
// @typedef {Object} AIProvider
// @property {string} name
// @property {(context: object, deps?: object) => Promise<{recommendedAction: string, reason: string, confidence: number, fallback: boolean}>} planRecoveryDecision
// @property {(context: object, deps?: object) => Promise<{intent: string, recommendedAction: string, confidence: number, reasonCodes: string[], requiresHumanReview: boolean, fallback: boolean}>} classifyVoiceIntent
// @property {(decisionContext: object, deps?: object) => Promise<{responseText: string, fallback: boolean}>} generateVoiceResponse
// @property {() => {responseText: string, fallback: boolean}} clarificationResponse fixed "please repeat" template, no AI call

import { planRecoveryDecision } from "./gemini/planner.js";
import { classifyVoiceIntent } from "./gemini/voiceClassifier.js";
import { generateVoiceResponse, clarificationResponse } from "./gemini/responseGenerator.js";

const GEMINI_PROVIDER = Object.freeze({
  name: "gemini",
  planRecoveryDecision,
  classifyVoiceIntent,
  generateVoiceResponse,
  clarificationResponse,
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
