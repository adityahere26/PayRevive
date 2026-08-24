// AGENT_DESIGN.md § Voice pipeline — generates the two text forms of the response spoken/shown
// to the customer. This function NEVER decides anything: it receives the FINAL, already-computed
// decision (case status, policyDecision reason code, selectedIntervention, amount) and asks
// Gemini only to phrase that fact naturally, in two forms:
//
//   - responseText: natural Hinglish (Roman script) — shown in the on-screen conversation transcript.
//   - speechText:   natural, conversational Devanagari Hindi — spoken via browser SpeechSynthesis.
//                   Chrome's hi-IN voices pronounce Devanagari script correctly; the same content
//                   transliterated into Roman letters ("Hum aapke...") is read letter-by-letter as
//                   broken English by most hi-IN synthesis voices, which is the pronunciation
//                   problem this field exists to fix. See client/src/pages/VoiceRecovery.jsx for
//                   the voice-selection logic that plays this field specifically.
//
// If the Gemini call fails, times out, or returns something unusable for EITHER field, a
// deterministic bilingual per-outcome template is used for BOTH fields together — never a mix
// of a Gemini-generated field with a fallback field, so the two always stay consistent with each
// other and with the trusted decision. This is the safety net that keeps a voice response from
// ever contradicting the trusted server-side decision (migration task § 11 — "the final response
// should be based on trusted server-side decision data," not something the model is free to
// improvise) — now enforced for both the displayed text and the spoken text.
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
  required: ["responseText", "speechText"],
  properties: {
    responseText: { type: "string", minLength: 1, maxLength: 400 },
    speechText: { type: "string", minLength: 1, maxLength: 400 },
  },
};

const CLARIFICATION_TEXT = "Maaf kijiye, main samajh nahi paaya. Kya aap dobara bata sakte hain?";
const CLARIFICATION_SPEECH = "माफ़ कीजिए, मैं समझ नहीं पाया। क्या आप दोबारा बता सकते हैं?";

function formatAmount(amount) {
  return Number(amount || 0).toLocaleString("en-IN");
}

// Reason-code-driven outcomes (policy blocked/escalated/expired the case) take precedence —
// these explain WHY nothing executed, which matters more than the case's raw status. Each entry
// returns BOTH text forms together so they can never drift out of sync with each other.
const FALLBACKS_BY_REASON = {
  HIGH_VALUE_REQUIRES_REVIEW: (amount) => ({
    responseText: `Ye ₹${formatAmount(amount)} ka transaction high-value hai, isliye main ise directly retry nahi kar sakta. Isko manual review ke liye escalate kar raha hoon.`,
    speechText: `यह ₹${formatAmount(amount)} का लेन-देन ज़्यादा रकम का है, इसलिए मैं इसे सीधे रिट्राई नहीं कर सकता। मैं इसे टीम के पास रिव्यू के लिए भेज रहा हूं।`,
  }),
  OPT_OUT_BEHAVIOR: () => ({
    responseText: "Theek hai, main aapko dobara contact nahi karunga. Recovery process yahan stop kar diya gaya hai.",
    speechText: "ठीक है, मैं आपको दोबारा संपर्क नहीं करूंगा। रिकवरी प्रोसेस यहीं रोक दिया गया है।",
  }),
  RETRY_LIMIT_REACHED: () => ({
    responseText: "Is case ke liye humne maximum attempts complete kar liye hain, isliye main isse abhi stop kar raha hoon.",
    speechText: "इस केस के लिए हमारी कोशिशें पूरी हो चुकी हैं, इसलिए मैं इसे अभी रोक रहा हूं।",
  }),
  RECOVERY_WINDOW_EXPIRED: () => ({
    responseText: "Is payment ka recovery window expire ho chuka hai.",
    speechText: "इस पेमेंट का रिकवरी विंडो खत्म हो चुका है।",
  }),
};

// Outcome-driven templates — what actually happened when an action DID execute. FAILED and
// RECOVERED are the two that must never be confused with each other (never claim success on a
// failed attempt, never hedge on an actual success) — see tests/voiceResponseGenerator.test.js.
const FALLBACKS_BY_STATUS = {
  RECOVERED: (amount) => ({
    responseText: `Badhai ho! Aapka ₹${formatAmount(amount)} ka payment successfully recover ho gaya hai.`,
    speechText: `बधाई हो! आपका ₹${formatAmount(amount)} का पेमेंट सफलतापूर्वक हो गया है। धन्यवाद।`,
  }),
  FAILED: (amount) => ({
    responseText: `Is baar ₹${formatAmount(amount)} ka payment attempt successful nahi hua. Aap thodi der baad dobara try kar sakte hain.`,
    speechText: `हम आपके ₹${formatAmount(amount)} का पेमेंट लिंक अभी बना नहीं पाए। कृपया थोड़ी देर बाद दोबारा कोशिश करें।`,
  }),
  ESCALATED: () => ({
    responseText: "Main isko hamari team ke paas review ke liye bhej raha hoon.",
    speechText: "मैं इसे हमारी टीम के पास रिव्यू के लिए भेज रहा हूं।",
  }),
  STOPPED: () => ({
    responseText: "Theek hai, main is process ko yahan rok raha hoon.",
    speechText: "ठीक है, मैं यह प्रोसेस यहीं रोक रहा हूं।",
  }),
  WAITING_OUTCOME: (amount) => ({
    responseText: `Main aapke ₹${formatAmount(amount)} ke payment ke liye ek secure payment link generate kar raha hoon.`,
    speechText: `पेमेंट लिंक तैयार है। आप इससे दोबारा पेमेंट कर सकते हैं।`,
  }),
  POLICY_APPROVED: (amount) => ({
    responseText: `Bilkul, main aapke ₹${formatAmount(amount)} ke payment ko process kar raha hoon.`,
    speechText: `बिल्कुल, मैं आपके ₹${formatAmount(amount)} के पेमेंट को प्रोसेस कर रहा हूं।`,
  }),
};

function fallbackResponse({ amount, policyDecision, selectedIntervention, caseStatus }) {
  if (policyDecision && FALLBACKS_BY_REASON[policyDecision]) {
    return FALLBACKS_BY_REASON[policyDecision](amount);
  }
  if (caseStatus && FALLBACKS_BY_STATUS[caseStatus]) {
    return FALLBACKS_BY_STATUS[caseStatus](amount);
  }
  if (selectedIntervention === "STOP") return FALLBACKS_BY_STATUS.STOPPED();
  if (selectedIntervention === "ESCALATE") return FALLBACKS_BY_STATUS.ESCALATED();
  return { responseText: CLARIFICATION_TEXT, speechText: CLARIFICATION_SPEECH };
}

/**
 * @param {{amount: number, currency?: string, policyDecision: string|null, selectedIntervention: string|null, caseStatus: string}} decisionContext
 * @param {{generate?: typeof generateStructuredContent}} [deps]
 * @returns {Promise<{responseText: string, speechText: string, fallback: boolean}>}
 */
export async function generateVoiceResponse(decisionContext, { generate = generateStructuredContent } = {}) {
  const { amount, currency = "INR", policyDecision, selectedIntervention, caseStatus } = decisionContext;

  const prompt = [
    "You write the customer-facing response for a payments-recovery voice assistant, in TWO forms.",
    "You never decide anything — you only phrase an ALREADY-DECIDED outcome, in 1-2 short",
    "sentences each. Do not invent any amount, promise, date, or fact not given below. Do not",
    "contradict, soften, or hedge against the outcome below — state it plainly and kindly,",
    "including honestly saying so if an attempt did NOT succeed. Both forms must convey the",
    "exact same outcome — they differ only in script/style, never in meaning.",
    "",
    "1. responseText: natural Hinglish written in Roman (Latin) script, for on-screen display.",
    "2. speechText: the SAME message in natural, conversational, spoken Devanagari Hindi — the",
    "   way an Indian call-center agent would actually say it out loud, not formal textbook",
    "   Hindi and not a Roman-script transliteration. Use Devanagari digits or numerals as",
    "   normally spoken (e.g. ₹2,999 as '₹2,999 रुपये'). This field is read aloud by",
    "   text-to-speech, so it must be pronounceable, natural spoken Hindi.",
    "",
    `Case status (the actual, final outcome — phrase THIS, not just what was attempted): ${caseStatus}`,
    `Action that was attempted or approved: ${selectedIntervention || "none"}`,
    `Policy reason code (why, if relevant): ${policyDecision || "n/a"}`,
    `Amount: ${amount} ${currency}`,
    "",
    "Return ONLY JSON matching the schema: {responseText, speechText}.",
  ].join("\n");

  try {
    const raw = await generate({ prompt, responseSchema: RESPONSE_SCHEMA });
    const parsed = JSON.parse(raw);
    const validText = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 400;
    if (validText(parsed.responseText) && validText(parsed.speechText)) {
      return { responseText: parsed.responseText, speechText: parsed.speechText, fallback: false };
    }
    logger.warn("Gemini voice response generation returned an unusable shape — using deterministic fallback");
  } catch (err) {
    logger.warn("Gemini voice response generation failed — using deterministic fallback template", {
      error: err?.message,
    });
  }
  return { ...fallbackResponse(decisionContext), fallback: true };
}

/** Fixed template for an UNCLEAR intent — no Gemini call needed for a "please repeat" ask. */
export function clarificationResponse() {
  return { responseText: CLARIFICATION_TEXT, speechText: CLARIFICATION_SPEECH, fallback: true };
}
