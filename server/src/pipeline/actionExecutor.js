// AGENT_DESIGN.md § The ten modules, module 7 — Action Executor. "The only module with
// Razorpay credentials and MongoDB write access." Through Day 5, there was no Razorpay
// credential anywhere in this file or its callers — every branch returned a
// `{status: "SIMULATED", ...}` result resolved via the seeded PRNG (lib/prng.js), not
// Math.random(), matching EVALUATION.md's simulated outcome engine's approach at single-case
// scale. That simulated path is UNCHANGED as of Day 6 (CLAUDE.md § Day 6 requirement 1) — every
// existing caller (evaluation, /simulate-action, voice without live Razorpay configured) omits
// the new `live` param and gets byte-identical behavior.
//
// Day 6 adds exactly one new branch: when `live: true` is passed for CREATE_PAYMENT_LINK, the
// case moves to WAITING_OUTCOME but its outcome is left unresolved — a real Razorpay Test Mode
// payment link has already been created by the caller (pipeline/tools.js's
// createLivePaymentLink, which itself calls integrations/razorpay/), and the true outcome is
// only known once routes/webhooks.js verifies a payment_link.paid/expired/cancelled event
// (pipeline/outcomeEvaluator.js). This executor never fabricates a live success/failure —
// RECOVERY_POLICY.md § Failure safety.

import { transition } from "./transition.js";

/**
 * Requires recoveryCase.status === "POLICY_APPROVED" (checked by the caller/route). Mutates
 * and transitions recoveryCase; does not persist it. Does not call Razorpay itself — for the
 * live path, the caller has already created the payment link and sets
 * recoveryCase.razorpayPaymentLinkId/razorpayPaymentLinkShortUrl before calling this.
 *
 * @param {{recoveryCase: object, action: string, rng?: () => number, live?: boolean}} args
 * @returns {{status: "SIMULATED"|"LIVE_TEST_MODE", action: string, success: boolean|null, outcome: string}}
 */
export function executeAction({ recoveryCase, action, rng, live = false }) {
  transition(recoveryCase, "ACTION_EXECUTED");

  if (action === "STOP") {
    transition(recoveryCase, "STOPPED");
    return { status: "SIMULATED", action, success: null, outcome: recoveryCase.status };
  }

  if (action === "ESCALATE") {
    transition(recoveryCase, "ESCALATED");
    return { status: "SIMULATED", action, success: null, outcome: recoveryCase.status };
  }

  if (action === "CREATE_PAYMENT_LINK") {
    transition(recoveryCase, "WAITING_OUTCOME");
    recoveryCase.attempts += 1;

    if (live) {
      // Real Razorpay Test Mode link already exists (caller's responsibility) — the outcome
      // is unknown until a verified webhook resolves it. recoveredAmount is NEVER set here.
      return { status: "LIVE_TEST_MODE", action, success: null, outcome: recoveryCase.status };
    }

    const success = rng() < (recoveryCase.recoveryProbability ?? 0.5);
    if (success) {
      transition(recoveryCase, "RECOVERED");
      recoveryCase.recoveredAmount = recoveryCase.amount;
    } else {
      transition(recoveryCase, "FAILED");
    }
    return { status: "SIMULATED", action, success, outcome: recoveryCase.status };
  }

  // START_VOICE_RECOVERY / RECORD_PROMISE_TO_PAY are allowlisted actions but not
  // executable in this phase — voice isn't implemented yet (CLAUDE.md Day 3 scope) and the
  // Intervention Selector never proposes them while voiceEnabled defaults to false, so this
  // is a defensive guard against ever silently no-opping an unsupported action.
  throw new Error(`Action Executor does not support "${action}" in this phase`);
}
