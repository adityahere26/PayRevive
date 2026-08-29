// Deterministic, bounded keyword/phrase classifier for the voice channel — the ONLY fallback
// used when the Gemini intent classifier can't be used (missing key, timeout, HTTP error,
// unusable/invalid output — see ai/gemini/voiceClassifier.js).
//
// It is intentionally NOT NLP: a short, transparent, ordered list of high-signal Hinglish
// phrases, each mapped to an EXISTING value in ai/schema.js's VOICE_INTENTS. Any transcript
// that doesn't clearly match one of those phrases stays UNCLEAR — the classifier never
// guesses, so a genuinely ambiguous request still falls through to the "please repeat"
// clarification (and, when a key is present, to Gemini).
//
// This changes only WHICH intent the fallback reports. Everything downstream is unchanged and
// still has the final say: pipeline/voiceIntentMapper.js deterministically derives the
// candidate action from the intent, and the shared Eligibility/Policy Engine
// (policy/policyPrecedence.js) still gates every candidate action before anything executes
// (RECOVERY_POLICY.md § Policy precedence). This module cannot approve, escalate, stop, or
// execute a recovery on its own — it only names an intent.

import { SAFE_FALLBACK_VOICE_INTENT } from "../ai/schema.js";
import { mapVoiceIntentToCandidateAction } from "./voiceIntentMapper.js";

// Ordered — the first rule that matches wins. Negative/deferral intents are listed before
// PAY_NOW so a sentence like "payment nahi karna" or "baad me karunga" is never misread as
// "pay now" just because it also contains the word "payment".
const RULES = [
  // Declining / wants contact to stop.
  {
    intent: "REFUSE",
    any: [
      "nahi karna", "nahi karunga", "nahi karni", "nahi chahiye", "nahi karvana",
      "cancel kar", "cancel karo", "cancel karna", "rehne do", "rehne dijiye", "rehne de",
      "mat karo", "mat bhej", "band karo", "band kar", "call mat", "pareshan mat",
      "dont want", "do not want", "not interested", "no thanks", "refuse", "stop calling",
    ],
  },
  // Says they cannot pay at all.
  {
    intent: "CANNOT_PAY",
    any: [
      "paisa nahi hai", "paise nahi hai", "paise nahi h", "paise nahin", "itne paise nahi",
      "abhi paise nahi", "cannot afford", "cant afford", "can not afford", "afford nahi",
      "budget nahi", "paise khatam", "account me paise nahi",
    ],
  },
  // Wants to pay, but later.
  {
    intent: "PAY_LATER",
    any: [
      "baad me", "baad mein", "kal kar", "kal karunga", "kal karta", "kal de", "next week",
      "agle hafte", "agle mahine", "thodi der baad", "thode din", "kuch din baad", "later",
      "salary aane ke baad", "salary ke baad", "abhi nahi kar paunga",
    ],
  },
  // Wants a human.
  {
    intent: "HUMAN_ESCALATION",
    any: [
      "manager se", "agent se", "kisi insaan", "insaan se", "human se", "senior se",
      "customer care", "kisi aadmi se", "kisi aur se baat", "team se baat",
    ],
  },
  // Payment-method problem / wants a link / a different method.
  {
    intent: "PAYMENT_METHOD_PROBLEM",
    any: [
      "payment link", "link bhej", "link bhejo", "link bhejiye", "link send", "send link",
      "send me the link", "naya card", "naya kaard", "dusra card", "doosra card",
      "another card", "different card", "card change", "card badal", "upi se karunga",
      "google pay", "gpay", "phonepe", "paytm se", "card decline", "card fail ho",
    ],
  },
  // Wants to pay now / retry the failed payment.
  {
    intent: "PAY_NOW",
    any: [
      "phir try", "phir se try", "dobara try", "dubara try", "dobara koshish", "try karwa",
      "try karva", "try again", "retry", "ek baar phir", "ek bar phir", "ek baar aur",
      "firse karwa", "phir se karwa", "abhi pay", "pay now", "pay karna hai", "pay karunga",
      "pay kar dunga", "payment karna hai", "payment karni hai", "payment kar do",
      "payment kara do", "payment karwa do", "payment complete", "complete payment",
      "payment ho jaye", "payment karwaiye", "abhi karna hai", "abhi kar dete",
      "payment fail ho gaya", "payment fail ho gya", "payment nahi hua", "payment nahin hua",
      "phir se payment", "dobara payment",
    ],
  },
];

function normalize(transcript) {
  return String(transcript || "")
    .toLowerCase()
    // keep latin letters, digits, whitespace and the Devanagari block; drop punctuation.
    .replace(/[^a-z0-9ऀ-ॿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} transcript
 * @returns {string|null} one of VOICE_INTENTS, or null when nothing matches clearly enough.
 */
export function classifyVoiceIntentByKeyword(transcript) {
  const text = normalize(transcript);
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.any.some((phrase) => text.includes(phrase))) return rule.intent;
  }
  return null;
}

/**
 * The full intent object ai/gemini/voiceClassifier.js returns when Gemini can't be used: a
 * keyword-matched intent when the transcript is unambiguous, otherwise the unchanged
 * SAFE_FALLBACK_VOICE_INTENT (UNCLEAR). Always `fallback: true` — it is never a Gemini result,
 * and the caller/audit records it as a deterministic fallback, not an AI classification.
 *
 * @param {string} transcript
 * @returns {{intent: string, recommendedAction: string, confidence: number, reasonCodes: string[], requiresHumanReview: boolean, fallback: true}}
 */
export function deterministicVoiceIntent(transcript) {
  const intent = classifyVoiceIntentByKeyword(transcript);
  if (!intent) return { ...SAFE_FALLBACK_VOICE_INTENT, fallback: true };
  return {
    intent,
    // Advisory only — pipeline/voiceIntentMapper.js re-derives the real candidate action from
    // `intent`, so this value never reaches the Policy Engine.
    recommendedAction: mapVoiceIntentToCandidateAction(intent) || "ASK_CLARIFICATION",
    confidence: 0.6,
    reasonCodes: ["DETERMINISTIC_KEYWORD_MATCH"],
    requiresHumanReview: false,
    fallback: true,
  };
}
