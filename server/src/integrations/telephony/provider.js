// Outbound voice-call seam. This build has NO real telephony provider wired up (no Twilio /
// Exotel / Knowlarity credentials, no dialer) — a "voice recovery" conversation still happens
// through the interactive browser-mic session in routes/voice.js. What this module provides is
// the single place a real provider would plug in, and the guarantee that a call is only ever
// *initiated* from one place: the recovery-plan executor (server/src/pipeline/recoveryPlan.js),
// and only AFTER the merchant has confirmed the plan.
//
// It performs no network I/O today, so there is nothing to mock in tests — it returns a
// synthetic call reference. It still refuses, defensively, to be pointed at an opted-out
// customer (the Policy Engine is the authoritative gate; this is defense in depth).

export function isTelephonyConfigured() {
  // Flip to an env-backed check when a provider is integrated. Intentionally always false now
  // so callers/UI never imply a live outbound call is placed.
  return false;
}

/**
 * @param {{recoveryCase: object, customer: object|null}} args
 * @returns {Promise<{provider: string, callRef: string, status: string}>}
 */
export async function initiateVoiceCall({ recoveryCase, customer }) {
  if (customer?.optedOut) {
    throw new Error("Refusing to initiate a voice call to an opted-out customer");
  }
  return {
    provider: isTelephonyConfigured() ? "LIVE" : "PENDING_PROVIDER",
    callRef: `call_${recoveryCase._id}_${Date.now().toString(36)}`,
    status: "INITIATED",
  };
}
