// AGENT_DESIGN.md § The ten modules, module 9 — Outcome Evaluator. Resolves WAITING_OUTCOME ->
// RECOVERED/FAILED from a TRUSTED, already-verified signal. Used by routes/webhooks.js after
// signature verification + case cross-checks have already passed — this module itself does no
// verification, it only applies an outcome that's already been established as trustworthy.
//
// Deliberately separate from the simulated Action Executor's RNG-based resolution
// (pipeline/actionExecutor.js) — that path stays completely unchanged (CLAUDE.md § Day 6
// requirement 1). This is new code for the live path only.
//
// Idempotent by construction: if the case is no longer WAITING_OUTCOME (e.g. a duplicate/
// out-of-order webhook delivery already resolved it), this is a safe no-op — recoveredAmount is
// never touched twice.

import { transition } from "./transition.js";

/**
 * @param {{recoveryCase: object, outcome: "RECOVERED"|"FAILED"}} args
 * @returns {{applied: boolean, status: string}}
 */
export function resolveRecoveryOutcome({ recoveryCase, outcome }) {
  if (recoveryCase.status !== "WAITING_OUTCOME") {
    return { applied: false, status: recoveryCase.status };
  }

  transition(recoveryCase, outcome);

  if (outcome === "RECOVERED") {
    // The ONLY place recoveredAmount is set on the live path — never at link-creation time,
    // never speculatively. CLAUDE.md § Day 6 requirement 10.
    recoveryCase.recoveredAmount = recoveryCase.amount;
  }

  return { applied: true, status: recoveryCase.status };
}
