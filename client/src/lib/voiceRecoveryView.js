// Single source of truth for what the Voice Recovery page (client/src/pages/VoiceRecovery.jsx)
// should show for a given case, under the approval-gated recovery-plan architecture
// (ARCHITECTURE.md § Recovery plans). Pure + framework-free so it can be unit-tested without a
// React harness — see tests/voiceRecoveryView.test.js.
//
// The rule the UI must obey: never offer an action the backend will reject. A voice call only
// ever starts via recovery-plan confirmation on the Payments page — this page reflects the
// plan's state, it does not host a second approval flow. The one exception is a genuine manual
// override for a case that has NOT yet been analysed into a plan decision (status still
// RISK_DETECTED / ANALYZING / FAILED / ELIGIBLE), which the backend's POST /voice/session does
// still accept.

import { statusLabel } from "./statusMeta.js";
import { humanize } from "./format.js";

// Statuses where POST /api/recovery-cases/:id/voice/session is accepted (server/src/routes/voice.js
// VOICE_ELIGIBLE_STATUSES). A voice-intervention case is POLICY_APPROVED, which is NOT in this
// list — that is exactly why the old "Start Voice Recovery" button was contradictory.
const MANUAL_SESSION_STATUSES = ["RISK_DETECTED", "ANALYZING", "FAILED", "ELIGIBLE"];
const TERMINAL_STATUSES = ["RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"];

/**
 * @param {{recoveryCase: object, policy: object|null, plan: object|null}} args
 *   recoveryCase — GET /api/recovery-cases/:id
 *   policy       — GET /api/merchant/policy  (.policy); may be null if that fetch failed
 *   plan         — GET /api/recovery-plan/current (.plan); may be null
 * @returns {{
 *   mode: "terminal"|"started"|"limit_reached"|"awaiting_confirmation"|"non_voice"|"startable"|"unavailable",
 *   headline: string, message: string,
 *   attemptsUsed: number, attemptsLimit: number|null,
 *   showStartButton: boolean, ctaLabel: string|null, ctaTo: string|null
 * }}
 */
export function deriveVoiceRecoveryView({ recoveryCase, policy, plan } = {}) {
  const rc = recoveryCase || {};
  const caseId = rc._id || rc.id;

  const attemptsUsed = rc.voiceAttempts ?? 0;
  const attemptsLimit = policy?.maxVoiceAttempts ?? null;
  const exhausted = attemptsLimit != null && attemptsUsed >= attemptsLimit;
  const voiceDisabledByPolicy = policy?.voiceEnabled === false;

  const isVoiceIntervention = rc.selectedIntervention === "START_VOICE_RECOVERY";
  const hasIntervention = Boolean(rc.selectedIntervention);

  const planItem = (plan?.items || []).find((i) => String(i.caseId) === String(caseId)) || null;
  const planStatus = plan?.status || null;
  const planPendingApproval = planItem ? planItem.status === "PENDING" : planStatus === "PENDING_APPROVAL";
  const planExecuting = planStatus === "EXECUTING";
  const voiceItemExecuted = planItem?.status === "EXECUTED";

  const base = {
    attemptsUsed,
    attemptsLimit,
    showStartButton: false,
    ctaLabel: null,
    ctaTo: null,
  };

  // 1. Case already reached a final state — nothing to start.
  if (TERMINAL_STATUSES.includes(rc.status)) {
    return {
      ...base,
      mode: "terminal",
      headline: statusLabel(rc.status),
      message: `This case has reached a final state (${rc.status}) — no voice session available.`,
    };
  }

  // 2. The approved voice intervention has been (or is being) executed after plan confirmation.
  //    Kept ahead of the limit check so a plan-executed call reads as "Started", not "Unavailable".
  if (isVoiceIntervention && (voiceItemExecuted || planExecuting)) {
    return {
      ...base,
      mode: "started",
      headline: planExecuting ? "Starting" : "Started",
      message: "The approved voice intervention has been initiated for this case.",
    };
  }

  // 3. Voice attempts are used up (by a prior session, or a removed plan item).
  if (exhausted) {
    return {
      ...base,
      mode: "limit_reached",
      headline: "Unavailable",
      message: "Voice recovery limit reached for this case.",
    };
  }

  // 4. Policy selected a voice call, but it is still waiting on the single merchant confirmation.
  if (isVoiceIntervention) {
    return {
      ...base,
      mode: "awaiting_confirmation",
      headline: "Awaiting confirmation",
      message:
        planPendingApproval || planStatus == null
          ? "This case is included in the recovery plan. Confirm the recovery plan to start the approved voice intervention."
          : "This case's voice intervention is handled by the recovery plan. Open the recovery plan to review it.",
      ctaLabel: "Go to Recovery Plan",
      ctaTo: "/payments",
    };
  }

  // 5. A non-voice intervention was selected — never offer a voice action.
  if (hasIntervention) {
    return {
      ...base,
      mode: "non_voice",
      headline: humanize(rc.selectedIntervention),
      message: `The recovery plan uses ${humanize(rc.selectedIntervention)} for this case, not a voice call.`,
      ctaLabel: "View recovery case",
      ctaTo: caseId ? `/recovery-cases/${caseId}` : null,
    };
  }

  // 6. Voice turned off in policy — no session, no override.
  if (voiceDisabledByPolicy) {
    return {
      ...base,
      mode: "unavailable",
      headline: "Unavailable",
      message: "Voice recovery is turned off in your recovery policy.",
    };
  }

  // 7. Case not yet analysed into a plan decision — a manual override session is genuinely
  //    startable (the backend accepts POST /voice/session in these statuses).
  if (MANUAL_SESSION_STATUSES.includes(rc.status)) {
    return {
      ...base,
      mode: "startable",
      showStartButton: true,
      headline: "Ready to start",
      message:
        "Start a voice session and reply — PayRevive will analyse this case from the conversation.",
    };
  }

  // 8. Anything else (e.g. WAITING_OUTCOME on a payment link) — no voice action.
  return {
    ...base,
    mode: "unavailable",
    headline: "Unavailable",
    message: "Voice recovery isn't available for this case right now.",
  };
}
