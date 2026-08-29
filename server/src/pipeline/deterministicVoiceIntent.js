// Deterministic, bounded keyword/phrase classifier for the voice channel — the ONLY fallback
// used when the Gemini intent classifier can't be used (missing key, timeout, HTTP error,
// unusable/invalid output — see ai/gemini/voiceClassifier.js).
//
// It is intentionally NOT NLP: a short, transparent, ordered list of high-signal phrases in
// BOTH Roman/Hinglish and Devanagari Hindi, each mapped to an EXISTING value in
// ai/schema.js's VOICE_INTENTS. Any transcript that doesn't clearly match one of those
// phrases stays UNCLEAR — the classifier never guesses, so a genuinely ambiguous request
// still falls through to the "please repeat" clarification (and, when Gemini is healthy, to
// Gemini, which stays the primary classifier).
//
// This changes only WHICH intent the fallback reports. Everything downstream is unchanged and
// still has the final say: pipeline/voiceIntentMapper.js deterministically derives the
// candidate action from the intent, and the shared Eligibility/Policy Engine
// (policy/policyPrecedence.js) still gates every candidate action before anything executes
// (RECOVERY_POLICY.md § Policy precedence). This module cannot approve, escalate, stop, or
// execute a recovery on its own — it only names an intent.

import { SAFE_FALLBACK_VOICE_INTENT } from "../ai/schema.js";
import { mapVoiceIntentToCandidateAction } from "./voiceIntentMapper.js";

// Ordered — the FIRST rule that matches wins. Negation / deferral / inability intents are
// listed before PAY_NOW so "payment nahi karna" / "पेमेंट नहीं करना है" / "baad me karunga"
// is never misread as "pay now" just because it also contains the word "payment".
const RULES = [
  // Declining / wants contact to stop.
  {
    intent: "REFUSE",
    any: [
      // Roman / Hinglish
      "nahi karna", "nahi karni", "nahi karunga", "nahi karvana", "nahi chahiye",
      "cancel kar", "cancel karo", "cancel karna", "rehne do", "rehne dijiye", "rehne de",
      "mat karo", "mat bhej", "band karo", "band kar", "call mat", "pareshan mat",
      "dont want", "do not want", "not interested", "no thanks", "refuse", "stop calling",
      // Devanagari
      "नहीं करना", "नहीं करनी", "नहीं करूंगा", "नहीं करूँगा", "नहीं करवाना", "नहीं चाहिए",
      "नहीं करना है", "कैंसिल कर", "कैंसिल करो", "कैंसिल करना", "रहने दो", "रहने दीजिए",
      "मत करो", "मत भेज", "बंद करो", "बंद कर दो", "कॉल मत", "परेशान मत",
    ],
  },
  // Says they cannot pay at all.
  {
    intent: "CANNOT_PAY",
    any: [
      "paisa nahi hai", "paise nahi hai", "paise nahi h", "paise nahin", "itne paise nahi",
      "abhi paise nahi", "cannot afford", "cant afford", "can not afford", "afford nahi",
      "budget nahi", "paise khatam", "account me paise nahi",
      "पैसे नहीं है", "पैसे नहीं हैं", "पैसा नहीं है", "इतने पैसे नहीं", "अभी पैसे नहीं",
      "पैसे खत्म", "बैलेंस नहीं", "अकाउंट में पैसे नहीं",
    ],
  },
  // Wants to pay, but later.
  {
    intent: "PAY_LATER",
    any: [
      "baad me", "baad mein", "kal kar", "kal karunga", "kal karta", "kal de", "next week",
      "agle hafte", "agle mahine", "thodi der baad", "thode din", "kuch din baad", "later",
      "salary aane ke baad", "salary ke baad", "abhi nahi kar paunga",
      "बाद में", "बाद मे", "कल करूंगा", "कल करूँगा", "कल कर दूंगा", "अगले हफ्ते",
      "अगले महीने", "थोड़ी देर बाद", "कुछ दिन बाद", "सैलरी आने के बाद", "सैलरी के बाद",
      "अभी नहीं कर पाऊंगा",
    ],
  },
  // Wants a human.
  {
    intent: "HUMAN_ESCALATION",
    any: [
      "manager se", "agent se", "kisi insaan", "insaan se", "human se", "senior se",
      "customer care", "kisi aadmi se", "kisi aur se baat", "team se baat",
      "मैनेजर से", "एजेंट से", "किसी इंसान", "इंसान से", "इन्सान से", "सीनियर से",
      "किसी और से बात", "कस्टमर केयर", "किसी आदमी से",
    ],
  },
  // Payment-method problem / wants a link / a different method. (Same downstream candidate
  // action as PAY_NOW — CREATE_PAYMENT_LINK — but a distinct existing intent.)
  {
    intent: "PAYMENT_METHOD_PROBLEM",
    any: [
      "payment link", "link bhej", "link bhejo", "link bhejiye", "link send", "send link",
      "send me the link", "naya card", "naya kaard", "dusra card", "dusre card", "dusri card",
      "doosra card", "doosre card", "another card", "different card", "alag card",
      "card change", "card badal", "upi se karunga", "google pay", "gpay", "phonepe",
      "paytm se", "card decline", "card fail ho",
      "पेमेंट लिंक", "लिंक भेज", "लिंक भेजो", "लिंक भेज दो", "लिंक भेजिए", "दूसरे कार्ड",
      "दूसरा कार्ड", "दुसरे कार्ड", "नया कार्ड", "अलग कार्ड", "कार्ड बदल", "यूपीआई से",
      "गूगल पे", "फोन पे", "पेटीएम से", "कार्ड से पेमेंट",
    ],
  },
  // Wants to pay now / retry the failed payment.
  {
    intent: "PAY_NOW",
    any: [
      "phir try", "phir se try", "dobara try", "dubara try", "dobara koshish", "try karwa",
      "try karva", "try again", "retry", "ek baar phir", "ek bar phir", "ek baar aur",
      "ek bar aur", "firse karwa", "phir se karwa", "phir payment", "dobara payment",
      "phir se payment", "abhi pay", "pay now", "pay karna hai", "pay karunga",
      "pay kar dunga", "payment karna hai", "payment karni hai", "payment kar do",
      "payment kara do", "payment karwa do", "payment karwa", "payment complete",
      "complete payment", "payment ho jaye", "payment karwaiye", "abhi karna hai",
      "abhi kar do", "abhi kar dete", "payment fail ho gaya", "payment fail ho gya",
      "payment nahi hua", "payment nahin hua",
      "एक बार फिर", "एक बार और", "फिर से ट्राई", "फिर ट्राई", "दोबारा ट्राई", "दुबारा ट्राई",
      "ट्राई करवा", "ट्राई करा दो", "ट्राई कर दो", "दोबारा कोशिश", "फिर से करवा",
      "फिर से पेमेंट", "दोबारा पेमेंट", "अभी पेमेंट", "पेमेंट करना है", "पेमेंट करनी है",
      "पेमेंट कर दो", "पेमेंट करवा दो", "पेमेंट करवा", "पेमेंट करा दो", "पेमेंट कम्पलीट",
      "पेमेंट हो जाए", "पेमेंट फेल हो गया", "पेमेंट फ़ेल हो गया", "पेमेंट नहीं हुआ", "रिट्राई",
      "अभी करना है", "अभी कर दो",
    ],
  },
];

function normalize(transcript) {
  return String(transcript || "")
    .normalize("NFC") // fold e.g. फ + ़ into फ़ so Devanagari substring matching is stable
    .toLowerCase() // no-op for Devanagari; lowercases the Roman parts
    .replace(/[।॥]/g, " ") // Devanagari danda -> separator
    .replace(/[^a-z0-9ऀ-ॿ\s]/g, " ") // keep Roman letters/digits + the Devanagari block
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
