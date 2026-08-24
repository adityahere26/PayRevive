// AGENT_DESIGN.md § The ten modules, module 7 — Action Executor. "The only module with
// Razorpay credentials and MongoDB write access." In this phase there IS no Razorpay
// credential anywhere in this file or its callers — CLAUDE.md Day 3 scope explicitly
// forbids real Razorpay calls, so every branch below returns a `{status: "SIMULATED", ...}`
// result and nothing here can reach a network call even by accident (no razorpay import
// exists in this module).
//
// Outcomes are resolved with the seeded PRNG (lib/prng.js) against the case's own
// recoveryProbability, not Math.random() — deterministic and reproducible per case/attempt,
// matching EVALUATION.md's simulated outcome engine's approach at single-case scale.

import { transition } from "./transition.js";

/**
 * Requires recoveryCase.status === "POLICY_APPROVED" (checked by the caller/route). Mutates
 * and transitions recoveryCase; does not persist it.
 *
 * @param {{recoveryCase: object, action: string, rng: () => number}} args
 * @returns {{status: "SIMULATED", action: string, success: boolean|null, outcome: string}}
 */
export function executeAction({ recoveryCase, action, rng }) {
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
