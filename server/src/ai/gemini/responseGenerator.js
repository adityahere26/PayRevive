// AGENT_DESIGN.md § Voice pipeline — generates the natural Hinglish sentence spoken back to
// the customer. This function NEVER decides anything: it receives the FINAL, already-computed
// decision (case status, policyDecision reason code, selectedIntervention, amount) and asks
// Gemini only to phrase that fact naturally in 1-2 short sentences. If the Gemini call fails,
// times out, or returns something unusable, a deterministic per-outcome template is used
// instead — this is the safety net that keeps a voice response from ever contradicting the
// trusted server-side decision (migration task § 11 — "the final response should be based on
// trusted server-side decision data," not something the model is free to improvise).
//
// `caseStatus` is the primary signal, not `selectedIntervention` alone: routes/voice.js calls
// the simulated executor synchronously within the same turn, so by the time a response is
// generated the case may already be RECOVERED or FAILED — a response that only said "sending
// a payment link" (the attempted intervention) would misrepresent a synchronous FAILED outcome
// as success. Phrasing is keyed off the actual outcome first.

import { generateStructuredContent } from "./client.js";
import { logger } from "../../lib/logger.js";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["responseText"],
  properties: {
    responseText: { type: "string", minLength: 1, maxLength: 400 },
  },
};

const CLARIFICATION_TEMPLATE = "Maaf kijiye, main samajh nahi paaya. Kya aap dobara bata sakte hain?";

// Reason-code-driven outcomes (policy blocked/escalated/expired the case) take precedence —
// these explain WHY nothing executed, which matters more than the case's raw status.
const FALLBACK_TEMPLATES_BY_REASON = {
  HIGH_VALUE_REQUIRES_REVIEW: (amount) =>
    `Ye ₹${amount} ka transaction high-value hai, isliye main ise directly retry nahi kar sakta. Isko manual review ke liye escalate kar raha hoon.`,
  OPT_OUT_BEHAVIOR: () => "Theek hai, main aapko dobara contact nahi karunga. Recovery process yahan stop kar diya gaya hai.",
  RETRY_LIMIT_REACHED: () => "Is case ke liye humne maximum attempts complete kar liye hain, isliye main isse abhi stop kar raha hoon.",
  RECOVERY_WINDOW_EXPIRED: () => "Is payment ka recovery window expire ho chuka hai.",
};

// Outcome-driven templates — what actually happened when an action DID execute.
const FALLBACK_TEMPLATES_BY_STATUS = {
  RECOVERED: (amount) => `Badhai ho! Aapka ₹${amount} ka payment successfully recover ho gaya hai.`,
  FAILED: (amount) => `Is baar ₹${amount} ka payment attempt successful nahi hua. Aap thodi der baad dobara try kar sakte hain.`,
  ESCALATED: () => "Main isko hamari team ke paas review ke liye bhej raha hoon.",
  STOPPED: () => "Theek hai, main is process ko yahan rok raha hoon.",
  WAITING_OUTCOME: (amount) => `Main aapke ₹${amount} ke payment ke liye ek secure payment link generate kar raha hoon.`,
  POLICY_APPROVED: (amount) => `Bilkul, main aapke ₹${amount} ke payment ko process kar raha hoon.`,
};

function fallbackResponse({ amount, policyDecision, selectedIntervention, caseStatus }) {
  if (policyDecision && FALLBACK_TEMPLATES_BY_REASON[policyDecision]) {
    return FALLBACK_TEMPLATES_BY_REASON[policyDecision](amount);
  }
  if (caseStatus && FALLBACK_TEMPLATES_BY_STATUS[caseStatus]) {
    return FALLBACK_TEMPLATES_BY_STATUS[caseStatus](amount);
  }
  if (selectedIntervention === "STOP") return FALLBACK_TEMPLATES_BY_STATUS.STOPPED();
  if (selectedIntervention === "ESCALATE") return FALLBACK_TEMPLATES_BY_STATUS.ESCALATED();
  return CLARIFICATION_TEMPLATE;
}

/**
 * @param {{amount: number, currency?: string, policyDecision: string|null, selectedIntervention: string|null, caseStatus: string}} decisionContext
 * @param {{generate?: typeof generateStructuredContent}} [deps]
 * @returns {Promise<{responseText: string, fallback: boolean}>}
 */
export async function generateVoiceResponse(decisionContext, { generate = generateStructuredContent } = {}) {
  const { amount, currency = "INR", policyDecision, selectedIntervention, caseStatus } = decisionContext;

  const prompt = [
    "You write short, warm, natural Hinglish sentences for a payments-recovery voice assistant.",
    "You never decide anything — you only phrase an ALREADY-DECIDED outcome naturally, in 1-2",
    "short sentences. Do not invent any amount, promise, date, or fact not given below. Do not",
    "contradict, soften, or hedge against the outcome below — state it plainly and kindly,",
    "including honestly saying so if an attempt did NOT succeed.",
    "",
    `Case status (the actual, final outcome — phrase THIS, not just what was attempted): ${caseStatus}`,
    `Action that was attempted or approved: ${selectedIntervention || "none"}`,
    `Policy reason code (why, if relevant): ${policyDecision || "n/a"}`,
    `Amount: ${amount} ${currency}`,
    "",
    "Return ONLY JSON matching the schema: {responseText}.",
  ].join("\n");

  try {
    const raw = await generate({ prompt, responseSchema: RESPONSE_SCHEMA });
    const parsed = JSON.parse(raw);
    if (typeof parsed.responseText === "string" && parsed.responseText.trim().length > 0 && parsed.responseText.length <= 400) {
      return { responseText: parsed.responseText, fallback: false };
    }
    logger.warn("Gemini voice response generation returned an unusable shape — using deterministic fallback");
  } catch (err) {
    logger.warn("Gemini voice response generation failed — using deterministic fallback template", {
      error: err?.message,
    });
  }
  return { responseText: fallbackResponse(decisionContext), fallback: true };
}

/** Fixed template for an UNCLEAR intent — no Gemini call needed for a "please repeat" ask. */
export function clarificationResponse() {
  return { responseText: CLARIFICATION_TEMPLATE, fallback: true };
}
