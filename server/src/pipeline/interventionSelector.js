// AGENT_DESIGN.md § The ten modules, module 5 — Intervention Selector. Runs only for cases
// already ELIGIBLE (RECOVERY_POLICY.md § Intervention selection). Picks among already-eligible
// interventions by root cause + recoveryProbability — it does NOT re-check opt-out, amount,
// window, or attempts; that is exclusively Eligibility Engine / Policy Engine territory (see
// AGENT_DESIGN.md § HIGH_VALUE ownership). Whatever this returns is a *candidate* — the
// Policy Engine has final say before anything executes.
//
// voiceEnabled defaults to false: CLAUDE.md's Day 3 scope explicitly excludes voice
// ("Do NOT implement voice yet"), so the >=0.75 band falls through to CREATE_PAYMENT_LINK
// for now rather than ever proposing START_VOICE_RECOVERY, which nothing can execute yet.
// This keeps the decision table's shape intact for when voice is added.

const STOP_ROOT_CAUSES = new Set(["NON_RETRYABLE_PAYMENT_FAILURE", "CUSTOMER_DECLINED"]);

export function selectIntervention(recoveryCase, { voiceEnabled = false } = {}) {
  if (STOP_ROOT_CAUSES.has(recoveryCase.rootCause)) {
    return "STOP";
  }

  const probability = recoveryCase.recoveryProbability ?? 0;

  if (probability >= 0.75 && voiceEnabled) {
    return "START_VOICE_RECOVERY";
  }

  // RECOVERY_POLICY.md's 0.40-0.74 and 0.15-0.39 bands are both CREATE_PAYMENT_LINK (only
  // priority/expectation differs, which this phase doesn't surface) — collapses to one check.
  if (probability >= 0.15) {
    return "CREATE_PAYMENT_LINK";
  }

  return "STOP";
}
