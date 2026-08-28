// Agentic auto-recovery orchestrator — the single server-side point where a freshly created
// PAYMENT_FAILURE recovery case is carried through DETECT -> EVALUATE -> EXECUTE without a
// merchant clicking anything per case. It is NOT a second recovery engine: it is thin
// orchestration that calls the exact same functions the manual routes already call —
//
//   EVALUATE : pipeline/orchestrator.js runEvaluationPipeline  (same as POST /:id/evaluate)
//   EXECUTE  : pipeline/tools.js createLivePaymentLink          (same as POST /:id/payment-link)
//              pipeline/actionExecutor.js executeAction         (same as POST /:id/simulate-action)
//
// The Policy Engine is never bypassed (CLAUDE.md core principle #2): this function only ever
// executes an action the pipeline itself moved to POLICY_APPROVED. ESCALATE / STOP / EXPIRE
// outcomes are recorded and surfaced for merchant review, never auto-actioned.
//
// Idempotent by construction:
//   - runEvaluationPipeline is re-entrant (its own docstring) — a second pass on a case already
//     past ANALYZING is a no-op.
//   - the live payment-link path goes through pipeline/tools.js's atomic DB claim, so two
//     concurrent auto-recovery runs on one case create exactly one link.
//   - the simulated/STOP path is guarded on status === "POLICY_APPROVED", which only one run
//     can observe (the executor transitions the case out of it).
//
// Failure safety (RECOVERY_POLICY.md § Failure safety): a failed execution never marks the case
// recovered, releases any claim (createLivePaymentLink does this itself), leaves the case
// retryable where policy allows, and writes an AUTO_RECOVERY_FAILED audit entry.

import { runEvaluationPipeline } from "./orchestrator.js";
import { executeAction } from "./actionExecutor.js";
import { getCustomerHistory, createLivePaymentLink } from "./tools.js";
import { writeAuditLog, writeAuditLogs } from "../audit/auditLogger.js";
import { mulberry32, seedFromString } from "../lib/prng.js";
import { isRazorpayConfigured } from "../integrations/razorpay/client.js";
import { RecoveryCase, RecoveryAction, AuditLog } from "../models/index.js";
import { logger } from "../lib/logger.js";

const EXECUTED_STATUSES = new Set(["WAITING_OUTCOME", "RECOVERED", "FAILED", "STOPPED"]);

/**
 * @param {{recoveryCase: object, merchant: object, customer: object, payment: object|null}} args
 * @returns {Promise<{recoveryCase: object, decision: string, executed: object|null}>}
 */
export async function runAutomaticRecovery({ recoveryCase, merchant, customer, payment }) {
  const merchantId = merchant._id;

  // ---- EVALUATE (reuse) --------------------------------------------------------------------
  const history = await getCustomerHistory(customer._id, merchantId);
  const { auditEntries } = runEvaluationPipeline({
    recoveryCase,
    policy: merchant.policy,
    customer,
    payment,
    history,
    // The only behavioral difference from the manual /evaluate route: the agent is allowed to
    // pick START_VOICE_RECOVERY when the merchant has voice enabled and the score supports it.
    interventionOptions: { voiceEnabled: merchant.policy.voiceEnabled !== false },
  });

  try {
    await recoveryCase.save();
    if (auditEntries.length > 0) {
      await writeAuditLogs(
        auditEntries.map((entry) => ({ merchantId, caseId: recoveryCase._id, actor: "SYSTEM", ...entry }))
      );
    }
  } catch (err) {
    if (err.name !== "VersionError") throw err;
    // A concurrent auto-recovery run already evaluated and persisted this case (and wrote the
    // evaluate-phase audit trail). runEvaluationPipeline is idempotent, so we simply adopt the
    // freshly persisted document and continue to the execute phase, which is itself guarded by
    // an atomic DB claim / status check.
    recoveryCase = await RecoveryCase.findOne({ _id: recoveryCase._id, merchantId });
    if (!recoveryCase) return { recoveryCase: null, decision: "CASE_GONE", executed: null };
  }

  // ---- Decide whether there is anything to auto-execute -----------------------------------
  if (recoveryCase.status !== "POLICY_APPROVED") {
    // Eligibility/Policy routed the case straight to ESCALATED / STOPPED / EXPIRED. Do not
    // auto-action — record the decision and leave it for the merchant.
    await writeAuditLog({
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "AUTO_RECOVERY_NO_ACTION",
      reason: recoveryCase.policyDecision,
      result: recoveryCase.status,
      metadata: { autonomous: true },
    });
    return { recoveryCase, decision: recoveryCase.status, executed: null };
  }

  const action = recoveryCase.selectedIntervention;

  // ---- START_VOICE_RECOVERY: policy-approved, but there is no automated outbound dialer ----
  // A voice "session" is a live interactive Hinglish conversation (browser mic <-> Gemini) that
  // only exists while a person is on the line — see client/src/pages/Payments.jsx CallAgentFlow.
  // The honest autonomous behavior is to leave the case POLICY_APPROVED (approved for voice) and
  // surface it so the merchant runs the real session. voiceAttempts is deliberately NOT touched
  // here — only routes/voice.js POST /:id/voice/session increments it.
  if (action === "START_VOICE_RECOVERY") {
    // Idempotent: a second auto-recovery pass on the same still-approved case must not queue
    // (or re-log) a second time.
    const alreadyQueued = await AuditLog.exists({
      caseId: recoveryCase._id,
      eventType: "AUTO_RECOVERY_VOICE_QUEUED",
    });
    if (!alreadyQueued) {
      await writeAuditLog({
        merchantId,
        caseId: recoveryCase._id,
        actor: "SYSTEM",
        eventType: "AUTO_RECOVERY_VOICE_QUEUED",
        reason: "VOICE_SESSION_REQUIRED",
        result: recoveryCase.status,
        metadata: { autonomous: true, selectedIntervention: action },
      });
    }
    return { recoveryCase, decision: "VOICE_QUEUED", executed: { action, status: "VOICE_QUEUED" } };
  }

  // ---- EXECUTE (reuse) -------------------------------------------------------------------
  try {
    if (action === "CREATE_PAYMENT_LINK" && isRazorpayConfigured()) {
      return await executeLivePaymentLink({ recoveryCase, merchantId, customer });
    }
    return await executeSimulated({ recoveryCase, merchantId, action });
  } catch (err) {
    logger.error("auto-recovery execution failed", { caseId: String(recoveryCase._id), error: err.message });
    await writeAuditLog({
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "AUTO_RECOVERY_FAILED",
      reason: "EXECUTION_ERROR",
      result: recoveryCase.status,
      metadata: { autonomous: true, action },
    });
    return { recoveryCase, decision: "EXECUTION_FAILED", executed: null };
  }
}

// Live Razorpay Test Mode path — identical mechanics to routes/recoveryCases.js POST
// /:id/payment-link, just triggered by the agent instead of a click. Never credits
// recoveredAmount: that only happens when routes/webhooks.js verifies a payment_link.paid event.
async function executeLivePaymentLink({ recoveryCase, merchantId, customer }) {
  const outcome = await createLivePaymentLink({ recoveryCase, merchantId, customer });

  if (!outcome.ok) {
    // CLAIM_CONFLICT: a concurrent auto-recovery run (or a manual click) already holds the
    // claim — not an error, just nothing left for this run to do. RAZORPAY_UNAVAILABLE: the
    // claim was released by createLivePaymentLink; the case stays POLICY_APPROVED and retryable.
    await writeAuditLog({
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: outcome.code === "CLAIM_CONFLICT" ? "AUTO_RECOVERY_SKIPPED" : "PAYMENT_LINK_CREATION_FAILED",
      reason: outcome.code,
      result: recoveryCase.status,
      metadata: { autonomous: true, live: true },
    });
    return {
      recoveryCase,
      decision: outcome.code === "CLAIM_CONFLICT" ? "ALREADY_IN_PROGRESS" : "EXECUTION_FAILED",
      executed: null,
    };
  }

  const updatedCase = outcome.recoveryCase;

  if (!outcome.reused) {
    await updatedCase.save();
    await RecoveryAction.create({
      caseId: updatedCase._id,
      merchantId,
      actionType: "CREATE_PAYMENT_LINK",
      status: "LIVE_TEST_MODE",
      result: outcome.result?.outcome ?? updatedCase.status,
      metadata: {
        autonomous: true,
        live: true,
        razorpayPaymentLinkId: outcome.link.id,
        razorpayPaymentLinkShortUrl: outcome.link.shortUrl,
      },
    });
    await writeAuditLogs([
      {
        merchantId,
        caseId: updatedCase._id,
        actor: "SYSTEM",
        eventType: "PAYMENT_LINK_CREATED",
        reason: "CREATE_PAYMENT_LINK",
        result: updatedCase.status,
        metadata: { autonomous: true, live: true, razorpayPaymentLinkId: outcome.link.id },
      },
      {
        merchantId,
        caseId: updatedCase._id,
        actor: "SYSTEM",
        eventType: "AUTO_RECOVERY_EXECUTED",
        reason: "CREATE_PAYMENT_LINK",
        result: updatedCase.status,
        metadata: { autonomous: true, live: true },
      },
    ]);
  }

  return { recoveryCase: updatedCase, decision: "PAYMENT_LINK_SENT", executed: outcome.result ?? null };
}

// Simulated path — CREATE_PAYMENT_LINK with no Razorpay configured (dev/CI), or STOP. Byte-for-
// byte the same seeded executor POST /:id/simulate-action uses; the SIMULATED status on the
// RecoveryAction keeps it clearly distinguishable from a real Test Mode recovery.
async function executeSimulated({ recoveryCase, merchantId, action }) {
  if (recoveryCase.status !== "POLICY_APPROVED") {
    // A concurrent run already executed it.
    return { recoveryCase, decision: "ALREADY_EXECUTED", executed: null };
  }

  const rng = mulberry32(seedFromString(`${recoveryCase._id}:${recoveryCase.attempts}`));
  const result = executeAction({ recoveryCase, action, rng });
  try {
    await recoveryCase.save();
  } catch (err) {
    if (err.name === "VersionError") return { recoveryCase, decision: "ALREADY_EXECUTED", executed: null };
    throw err;
  }

  await RecoveryAction.create({
    caseId: recoveryCase._id,
    merchantId,
    actionType: result.action,
    status: "SIMULATED",
    result: result.success === null ? result.outcome : result.success ? "SUCCESS" : "FAILURE",
    metadata: { autonomous: true, simulated: true },
  });

  await writeAuditLogs([
    {
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "ACTION_SIMULATED",
      reason: result.action,
      result: recoveryCase.status,
      metadata: { autonomous: true, simulated: true, success: result.success },
    },
    {
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "AUTO_RECOVERY_EXECUTED",
      reason: result.action,
      result: recoveryCase.status,
      metadata: { autonomous: true, simulated: true },
    },
  ]);

  return {
    recoveryCase,
    decision: EXECUTED_STATUSES.has(recoveryCase.status) ? recoveryCase.status : "EXECUTED",
    executed: result,
  };
}
