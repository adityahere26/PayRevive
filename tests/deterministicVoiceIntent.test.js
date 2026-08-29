// The deterministic keyword fallback for voice intent classification
// (server/src/pipeline/deterministicVoiceIntent.js). Pure function, no server — it only ever
// names an existing VOICE_INTENTS value or leaves the turn UNCLEAR. It cannot approve,
// escalate, stop, or execute anything: voiceIntentMapper.js + the Policy Engine still gate
// everything downstream.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyVoiceIntentByKeyword,
  deterministicVoiceIntent,
} from "../server/src/pipeline/deterministicVoiceIntent.js";
import { VOICE_INTENTS, SAFE_FALLBACK_VOICE_INTENT } from "../server/src/ai/schema.js";
import { mapVoiceIntentToCandidateAction } from "../server/src/pipeline/voiceIntentMapper.js";

test("clear Hinglish payment-retry requests classify to PAY_NOW", () => {
  for (const t of [
    "Bhai payment fail ho gaya tha, ek baar phir try karwa do",
    "bhai payment fail ho gaya tha dobara try karwa do",
    "ek baar phir payment try karwa do",
    "abhi pay karna hai",
    "retry payment please",
    "phir se try karo",
  ]) {
    assert.equal(classifyVoiceIntentByKeyword(t), "PAY_NOW", t);
  }
});

test("clear Devanagari payment-retry requests classify to PAY_NOW", () => {
  for (const t of [
    "भाई पेमेंट फेल हो गया था एक बार फिर ट्राई करवा दो",
    "पेमेंट फेल हो गया, दोबारा पेमेंट करवा do",
    "एक बार फिर पेमेंट ट्राई करवा दो",
    "अभी पेमेंट करना है",
  ]) {
    assert.equal(classifyVoiceIntentByKeyword(t), "PAY_NOW", t);
  }
});

test("clear Hinglish payment-link / method requests classify to PAYMENT_METHOD_PROBLEM", () => {
  for (const t of [
    "Customer ko payment link bhej do",
    "mujhe link bhejo",
    "dusre card se payment karni hai",
    "dusra card use karunga",
  ]) {
    assert.equal(classifyVoiceIntentByKeyword(t), "PAYMENT_METHOD_PROBLEM", t);
  }
});

test("clear Devanagari payment-link / method requests classify to PAYMENT_METHOD_PROBLEM", () => {
  for (const t of ["पेमेंट लिंक भेज दो", "दूसरे कार्ड से पेमेंट करना है"]) {
    assert.equal(classifyVoiceIntentByKeyword(t), "PAYMENT_METHOD_PROBLEM", t);
  }
});

test("negation wins over positive payment keywords, in both scripts", () => {
  for (const t of [
    "payment nahi karna",
    "abhi payment nahi karna",
    "पेमेंट नहीं करना है",
    "अभी पेमेंट नहीं करना है",
  ]) {
    assert.equal(classifyVoiceIntentByKeyword(t), "REFUSE", t);
    assert.notEqual(classifyVoiceIntentByKeyword(t), "PAY_NOW", t);
  }
});

test("both PAY_NOW and PAYMENT_METHOD_PROBLEM map to the CREATE_PAYMENT_LINK candidate action", () => {
  assert.equal(mapVoiceIntentToCandidateAction("PAY_NOW"), "CREATE_PAYMENT_LINK");
  assert.equal(mapVoiceIntentToCandidateAction("PAYMENT_METHOD_PROBLEM"), "CREATE_PAYMENT_LINK");
});

test("deferral, inability, refusal and human-ask are recognised (and not misread as PAY_NOW)", () => {
  assert.equal(classifyVoiceIntentByKeyword("abhi nahi, kal karunga"), "PAY_LATER");
  assert.equal(classifyVoiceIntentByKeyword("mere paas abhi paise nahi hai"), "CANNOT_PAY");
  assert.equal(classifyVoiceIntentByKeyword("mujhe payment nahi karna, cancel karo"), "REFUSE");
  assert.equal(classifyVoiceIntentByKeyword("kisi insaan se baat karwao"), "HUMAN_ESCALATION");
});

test("a negation is not misclassified as a pay request even though it contains 'payment'", () => {
  assert.equal(classifyVoiceIntentByKeyword("payment nahi karna hai mujhe"), "REFUSE");
  assert.notEqual(classifyVoiceIntentByKeyword("payment nahi karna hai mujhe"), "PAY_NOW");
});

test("genuinely ambiguous or unsupported transcripts stay unclassified (null)", () => {
  for (const t of [
    "haan theek hai",
    "okay",
    "mujhe pizza chahiye",
    "aaj mausam accha hai",
    "hmm pata nahi",
    "kya haal hai",
    "",
    "   ",
    null,
  ]) {
    assert.equal(classifyVoiceIntentByKeyword(t), null, JSON.stringify(t));
  }
});

test("every intent the keyword classifier can emit is a real VOICE_INTENTS value", () => {
  for (const t of [
    "phir try karwa do",
    "payment link bhej do",
    "kal karunga",
    "paise nahi hai",
    "cancel karo",
    "manager se baat",
  ]) {
    const intent = classifyVoiceIntentByKeyword(t);
    assert.ok(VOICE_INTENTS.includes(intent), `${intent} not in VOICE_INTENTS`);
  }
});

test("deterministicVoiceIntent(): a match returns a fallback-flagged intent object with a bounded confidence", () => {
  const out = deterministicVoiceIntent("ek baar phir try karwa do");
  assert.equal(out.intent, "PAY_NOW");
  assert.equal(out.recommendedAction, "CREATE_PAYMENT_LINK");
  assert.equal(out.fallback, true);
  assert.equal(out.requiresHumanReview, false);
  assert.ok(out.confidence > 0 && out.confidence < 1);
  assert.deepEqual(out.reasonCodes, ["DETERMINISTIC_KEYWORD_MATCH"]);
});

test("deterministicVoiceIntent(): no match returns exactly the unchanged SAFE_FALLBACK (UNCLEAR)", () => {
  assert.deepEqual(deterministicVoiceIntent("hmm pata nahi"), { ...SAFE_FALLBACK_VOICE_INTENT, fallback: true });
  assert.deepEqual(deterministicVoiceIntent(""), { ...SAFE_FALLBACK_VOICE_INTENT, fallback: true });
});
