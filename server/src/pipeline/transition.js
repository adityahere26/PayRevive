// ARCHITECTURE.md § Payment state machine — the single source of truth for which
// recovery_case.status transitions are legal. "Transitions are validated by a single
// transition(case, toStatus) function ... any transition not in the table above throws and
// is rejected, so an invalid state change can never silently occur" (CLAUDE.md core
// principle #1: state transitions are controlled by deterministic code, never by accident).
//
// ACTION_SELECTED and ACTION_EXECUTED both branch to a terminal/near-terminal status directly
// (not just forward) because the Policy Engine's final-gate re-check (RECOVERY_POLICY.md §
// Policy precedence) can discover the window expired or the customer opted out *between* the
// Eligibility Engine's first pass and this final check — see ARCHITECTURE.md's diagram
// ("POLICY_APPROVED ├──► blocked/escalated/stopped ──► ESCALATED | STOPPED").

const ALLOWED_TRANSITIONS = {
  RISK_DETECTED: ["ANALYZING"],
  ANALYZING: ["ELIGIBLE", "STOPPED", "ESCALATED", "EXPIRED"],
  ELIGIBLE: ["ACTION_SELECTED"],
  ACTION_SELECTED: ["POLICY_APPROVED", "STOPPED", "ESCALATED", "EXPIRED"],
  POLICY_APPROVED: ["ACTION_EXECUTED"],
  // STOPPED/ESCALATED here cover a STOP/ESCALATE candidate action being "executed" (the
  // executor's job for those two actions IS the terminal transition — there is no external
  // outcome to wait for the way there is for a payment link).
  ACTION_EXECUTED: ["WAITING_OUTCOME", "STOPPED", "ESCALATED"],
  WAITING_OUTCOME: ["RECOVERED", "FAILED"],
  // FAILED is never terminal — it always re-enters ANALYZING so eligibility/policy re-run
  // against the incremented attempt count (RECOVERY_POLICY.md § Policy precedence, "Retry
  // re-entry"). It can never jump directly back to ACTION_SELECTED.
  FAILED: ["ANALYZING"],
  RECOVERED: [],
  STOPPED: [],
  ESCALATED: [],
  EXPIRED: [],
};

/**
 * Mutates recoveryCase.status to toStatus if the transition is legal; throws otherwise.
 * Pure/synchronous — callers are responsible for persisting (recoveryCase.save()).
 */
export function transition(recoveryCase, toStatus) {
  const from = recoveryCase.status;
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`Invalid recovery case transition: ${from} -> ${toStatus}`);
  }
  recoveryCase.status = toStatus;
  return recoveryCase;
}
