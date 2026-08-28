// Approval-gated autonomy (ARCHITECTURE.md § Recovery plans). Two phases, one merchant
// decision in between:
//
//   PLAN  (planRecoveryForCase)  — runs on every failed payment, fully autonomous.
//         DETECT is already done (riskDetector). This runs the EXACT SAME evaluate pipeline
//         the manual /evaluate route runs (pipeline/orchestrator.js runEvaluationPipeline —
//         eligibility, scoring, intervention selection, policy precedence), then records the
//         decision as an item on the merchant's open RecoveryPlan. It NEVER contacts a
//         customer: no payment link, no phone call.
//
//   CONFIRM (confirmRecoveryPlan) — runs once, when the merchant confirms the plan.
//         Re-validates every item against the *current* case/customer/policy state (reusing
//         policy/policyPrecedence.js — no duplicated policy logic), drops anything stale, then
//         executes the surviving customer-facing actions through the existing safe paths
//         (pipeline/tools.js createLivePaymentLink, integrations/telephony initiateVoiceCall).
//
// The decision engine is untouched. The approval step sits strictly between POLICY DECISION and
// EXECUTION.

import { runEvaluationPipeline } from "./orchestrator.js";
import { executeAction } from "./actionExecutor.js";
import { transition } from "./transition.js";
import { getCustomerHistory, createLivePaymentLink } from "./tools.js";
import { evaluatePrecedence } from "../policy/policyPrecedence.js";
import { writeAuditLog, writeAuditLogs } from "../audit/auditLogger.js";
import { mulberry32, seedFromString } from "../lib/prng.js";
import { isRazorpayConfigured } from "../integrations/razorpay/client.js";
import { initiateVoiceCall } from "../integrations/telephony/provider.js";
import { RecoveryCase, RecoveryPlan, RecoveryAction, Merchant, Customer } from "../models/index.js";
import { logger } from "../lib/logger.js";

const PLAN_TTL_MS = 24 * 60 * 60 * 1000; // a plan not confirmed within 24h is stale
const CUSTOMER_FACING = new Set(["CREATE_PAYMENT_LINK", "START_VOICE_RECOVERY"]);
const TERMINAL_CASE_STATUSES = new Set(["RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"]);
const PRECEDENCE_OUTCOME_TO_STATUS = { STOP: "STOPPED", ESCALATE: "ESCALATED", EXPIRE: "EXPIRED", BLOCK: "STOPPED" };

// ---------------------------------------------------------------------------------------------
// PLAN
// ---------------------------------------------------------------------------------------------

/**
 * Autonomously evaluates a freshly detected failed-payment case and records the decision as an
 * item on the merchant's open recovery plan. No customer contact happens here.
 *
 * @param {{recoveryCase: object, merchant: object, customer: object, payment: object|null}} args
 * @returns {Promise<{plan: object|null, decision: string, recoveryCase: object|null}>}
 */
export async function planRecoveryForCase({ recoveryCase, merchant, customer, payment }) {
  const merchantId = merchant._id;

  const history = await getCustomerHistory(customer._id, merchantId);
  const { auditEntries } = runEvaluationPipeline({
    recoveryCase,
    policy: merchant.policy,
    customer,
    payment,
    history,
    // The agent is allowed to *decide* on voice when the merchant has voice enabled and the
    // score supports it — the call still won't be placed until plan confirmation.
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
    recoveryCase = await RecoveryCase.findOne({ _id: recoveryCase._id, merchantId });
    if (!recoveryCase) return { plan: null, decision: "CASE_GONE", recoveryCase: null };
  }

  const itemFields = buildPlanItemFields(recoveryCase, customer);
  const { plan, created } = await getOrCreateActivePlan(merchantId);

  const idx = plan.items.findIndex((i) => String(i.caseId) === String(recoveryCase._id));
  if (idx >= 0) {
    // Re-planned (case re-evaluated) — refresh in place, never duplicate.
    plan.items[idx].set(itemFields);
  } else {
    plan.items.push(itemFields);
  }
  await plan.save();

  await writeAuditLog({
    merchantId,
    caseId: recoveryCase._id,
    actor: "SYSTEM",
    eventType: "RECOVERY_PLAN_CREATED",
    reason: itemFields.intervention,
    result: plan.status,
    metadata: {
      planId: plan._id,
      planCreated: created,
      customerFacing: itemFields.customerFacing,
      requiresMerchantApproval: itemFields.requiresMerchantApproval,
    },
  });

  return { plan, decision: itemFields.intervention, recoveryCase };
}

async function getOrCreateActivePlan(merchantId) {
  const existing = await RecoveryPlan.findOne({ merchantId, status: "PENDING_APPROVAL" });
  if (existing) return { plan: existing, created: false };
  try {
    const plan = await RecoveryPlan.create({
      merchantId,
      status: "PENDING_APPROVAL",
      items: [],
      expiresAt: new Date(Date.now() + PLAN_TTL_MS),
    });
    return { plan, created: true };
  } catch (err) {
    // Partial unique index (one PENDING_APPROVAL plan per merchant) — a concurrent create won;
    // adopt theirs.
    if (err.code === 11000) {
      return { plan: await RecoveryPlan.findOne({ merchantId, status: "PENDING_APPROVAL" }), created: false };
    }
    throw err;
  }
}

// Derives the plan item purely from the case's post-pipeline state — never re-runs policy.
function buildPlanItemFields(rc, customer) {
  let intervention;
  let reason;
  if (rc.status === "POLICY_APPROVED") {
    intervention = rc.selectedIntervention; // CREATE_PAYMENT_LINK | START_VOICE_RECOVERY | STOP
    reason = rc.policyDecision || rc.rootCause || null;
  } else if (rc.status === "ESCALATED") {
    intervention = "ESCALATE";
    reason = rc.policyDecision || "REQUIRES_MERCHANT_REVIEW";
  } else if (rc.status === "STOPPED") {
    intervention = "STOP";
    reason = rc.policyDecision || "STOPPED_BY_POLICY";
  } else if (rc.status === "EXPIRED") {
    intervention = "STOP";
    reason = "RECOVERY_WINDOW_EXPIRED";
  } else {
    // RECOVERED/FAILED (a retry re-plan) or an unexpected mid-pipeline state — nothing to do.
    intervention = "STOP";
    reason = rc.status;
  }
  const customerFacing = CUSTOMER_FACING.has(intervention);
  return {
    caseId: rc._id,
    customerId: rc.customerId,
    customerName: customer?.name || null,
    intervention,
    reason,
    recoveryProbability: rc.recoveryProbability ?? null,
    amount: rc.amount,
    currency: rc.currency || "INR",
    customerFacing,
    requiresMerchantApproval: customerFacing,
    status: "PENDING",
    executionRef: null,
    removalReason: null,
    executedAt: null,
  };
}

// ---------------------------------------------------------------------------------------------
// CONFIRM
// ---------------------------------------------------------------------------------------------

/**
 * The single merchant confirmation. Idempotent: only a PENDING_APPROVAL plan is claimed for
 * execution (atomic status transition); every other call returns the current plan state and
 * executes nothing.
 *
 * @param {{planId: any, merchantId: any}} args
 * @returns {Promise<{plan: object, idempotent: boolean, expired?: boolean}>}
 */
export async function confirmRecoveryPlan({ planId, merchantId }) {
  const claimed = await RecoveryPlan.findOneAndUpdate(
    { _id: planId, merchantId, status: "PENDING_APPROVAL" },
    { $set: { status: "EXECUTING", approvedBy: "MERCHANT", approvedAt: new Date() } },
    { new: true }
  );

  if (!claimed) {
    // Already approved / executing / completed / cancelled — a second confirmation must not
    // re-execute anything (no duplicate links, no duplicate calls).
    const current = await RecoveryPlan.findOne({ _id: planId, merchantId });
    return { plan: current, idempotent: true };
  }

  await writeAuditLog({
    merchantId,
    caseId: null,
    actor: "MERCHANT",
    eventType: "RECOVERY_PLAN_APPROVED",
    reason: null,
    result: "EXECUTING",
    metadata: { planId: claimed._id, itemCount: claimed.items.length },
  });

  // Stale-plan guard: don't execute decisions prepared against a world that has moved on.
  if (Date.now() > new Date(claimed.expiresAt).getTime()) {
    for (const item of claimed.items) {
      if (item.status === "PENDING") {
        item.status = "REMOVED";
        item.removalReason = "PLAN_EXPIRED";
      }
    }
    claimed.status = "CANCELLED";
    await claimed.save();
    await writeAuditLog({
      merchantId,
      actor: "SYSTEM",
      eventType: "RECOVERY_PLAN_CANCELLED",
      reason: "PLAN_EXPIRED",
      result: "CANCELLED",
      metadata: { planId: claimed._id },
    });
    return { plan: claimed, idempotent: false, expired: true };
  }

  const merchant = await Merchant.findById(merchantId); // fresh policy for revalidation

  for (const item of claimed.items) {
    if (item.status !== "PENDING") continue;
    try {
      await executePlanItem({ item, plan: claimed, merchant });
    } catch (err) {
      logger.error("recovery plan item execution failed", {
        planId: String(claimed._id),
        caseId: String(item.caseId),
        error: err.message,
      });
      item.status = "FAILED";
      item.removalReason = "EXECUTION_ERROR";
    }
  }

  claimed.status = derivePlanStatus(claimed.items);
  await claimed.save();

  await writeAuditLog({
    merchantId,
    actor: "SYSTEM",
    eventType: "RECOVERY_PLAN_EXECUTED",
    reason: null,
    result: claimed.status,
    metadata: {
      planId: claimed._id,
      executed: claimed.items.filter((i) => i.status === "EXECUTED").length,
      escalated: claimed.items.filter((i) => i.status === "ESCALATED").length,
      removed: claimed.items.filter((i) => i.status === "REMOVED").length,
      failed: claimed.items.filter((i) => i.status === "FAILED").length,
    },
  });

  return { plan: claimed, idempotent: false };
}

async function executePlanItem({ item, plan, merchant }) {
  const merchantId = merchant._id;

  // Non-customer-facing items never execute anything: escalations are surfaced, stops do
  // nothing, by design.
  if (!item.customerFacing) {
    item.status = item.intervention === "ESCALATE" ? "ESCALATED" : "SKIPPED";
    return;
  }

  const recoveryCase = await RecoveryCase.findOne({ _id: item.caseId, merchantId });
  if (!recoveryCase) {
    item.status = "REMOVED";
    item.removalReason = "CASE_NOT_FOUND";
    return;
  }

  // Case resolved while the plan waited for approval.
  if (TERMINAL_CASE_STATUSES.has(recoveryCase.status)) {
    item.status = recoveryCase.status === "ESCALATED" ? "ESCALATED" : "REMOVED";
    item.removalReason = `CASE_${recoveryCase.status}`;
    return;
  }
  // A link was already created (e.g. via the manual bulk flow) — treat as executed, don't
  // create a second one.
  if (recoveryCase.status === "WAITING_OUTCOME") {
    item.status = "EXECUTED";
    item.executedAt = new Date();
    item.executionRef = recoveryCase.razorpayPaymentLinkId || null;
    return;
  }
  if (recoveryCase.status !== "POLICY_APPROVED") {
    item.status = "REMOVED";
    item.removalReason = `CASE_${recoveryCase.status}`;
    return;
  }

  const customer = await Customer.findOne({ _id: recoveryCase.customerId, merchantId });
  if (!customer) {
    item.status = "REMOVED";
    item.removalReason = "CUSTOMER_NOT_FOUND";
    return;
  }

  // RE-VALIDATE against current state — same shared precedence function the pipeline uses.
  const check = evaluatePrecedence(recoveryCase, merchant.policy, customer, recoveryCase.selectedIntervention);
  if (check.outcome !== "APPROVE") {
    const toStatus = PRECEDENCE_OUTCOME_TO_STATUS[check.outcome];
    if (toStatus && toStatus !== recoveryCase.status) {
      try {
        transition(recoveryCase, toStatus);
        recoveryCase.policyDecision = check.reasonCode;
        await recoveryCase.save();
      } catch {
        // If the state-machine edge isn't allowed, leave the case as-is — the point is that we
        // do NOT execute the stale action, which the item status below records.
      }
    }
    item.status = "REMOVED";
    item.removalReason = check.reasonCode;
    await writeAuditLog({
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "RECOVERY_PLAN_ITEM_REMOVED",
      reason: check.reasonCode,
      result: recoveryCase.status,
      metadata: { planId: plan._id, intervention: item.intervention },
    });
    return;
  }

  // Case-scoped record that THIS case's customer-facing action was authorised by the single
  // merchant confirmation — so the recovery-case audit trail reads
  // PLAN_CREATED → PLAN_APPROVED → LINK_CREATED → RECOVERY_EXECUTED → WEBHOOK_VERIFIED →
  // RECOVERY_SUCCEEDED. (confirmRecoveryPlan also writes one plan-scoped RECOVERY_PLAN_APPROVED
  // for the merchant-wide audit log.)
  await writeAuditLog({
    merchantId,
    caseId: recoveryCase._id,
    actor: "MERCHANT",
    eventType: "RECOVERY_PLAN_APPROVED",
    reason: item.intervention,
    result: recoveryCase.status,
    metadata: { planId: plan._id },
  });

  if (item.intervention === "CREATE_PAYMENT_LINK") {
    await executePaymentLinkItem({ item, plan, recoveryCase, customer, merchantId });
  } else if (item.intervention === "START_VOICE_RECOVERY") {
    await executeVoiceItem({ item, plan, recoveryCase, customer, merchantId });
  } else {
    item.status = "SKIPPED";
  }
}

async function executePaymentLinkItem({ item, plan, recoveryCase, customer, merchantId }) {
  if (isRazorpayConfigured()) {
    const outcome = await createLivePaymentLink({ recoveryCase, merchantId, customer });

    if (!outcome.ok) {
      if (outcome.code === "CLAIM_CONFLICT") {
        // Another execution path already created (or is creating) the link — not a failure.
        item.status = "EXECUTED";
        item.executedAt = new Date();
        return;
      }
      item.status = "FAILED";
      item.removalReason = outcome.code;
      await writeAuditLog({
        merchantId,
        caseId: recoveryCase._id,
        actor: "SYSTEM",
        eventType: "PAYMENT_LINK_CREATION_FAILED",
        reason: outcome.code,
        result: recoveryCase.status,
        metadata: { planId: plan._id },
      });
      return;
    }

    const updated = outcome.recoveryCase;
    if (!outcome.reused) {
      await updated.save();
      await RecoveryAction.create({
        caseId: updated._id,
        merchantId,
        actionType: "CREATE_PAYMENT_LINK",
        status: "LIVE_TEST_MODE",
        result: outcome.result?.outcome ?? updated.status,
        metadata: {
          planId: plan._id,
          live: true,
          razorpayPaymentLinkId: outcome.link.id,
          razorpayPaymentLinkShortUrl: outcome.link.shortUrl,
        },
      });
      await writeAuditLogs([
        {
          merchantId,
          caseId: updated._id,
          actor: "SYSTEM",
          eventType: "PAYMENT_LINK_CREATED",
          reason: "CREATE_PAYMENT_LINK",
          result: updated.status,
          metadata: { planId: plan._id, live: true, razorpayPaymentLinkId: outcome.link.id },
        },
        {
          merchantId,
          caseId: updated._id,
          actor: "SYSTEM",
          eventType: "RECOVERY_EXECUTED",
          reason: "CREATE_PAYMENT_LINK",
          result: updated.status,
          metadata: { planId: plan._id, live: true },
        },
      ]);
    }
    item.status = "EXECUTED";
    item.executedAt = new Date();
    item.executionRef = outcome.link.id;
    return;
  }

  // Simulated fallback (dev/CI, no Razorpay) — seeded executor, clearly labelled SIMULATED so
  // it can never be mistaken for a real Test Mode recovery.
  const rng = mulberry32(seedFromString(`${recoveryCase._id}:${recoveryCase.attempts}`));
  const result = executeAction({ recoveryCase, action: "CREATE_PAYMENT_LINK", rng });
  await recoveryCase.save();
  await RecoveryAction.create({
    caseId: recoveryCase._id,
    merchantId,
    actionType: "CREATE_PAYMENT_LINK",
    status: "SIMULATED",
    result: result.success === null ? result.outcome : result.success ? "SUCCESS" : "FAILURE",
    metadata: { planId: plan._id, simulated: true },
  });
  await writeAuditLogs([
    {
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "ACTION_SIMULATED",
      reason: "CREATE_PAYMENT_LINK",
      result: recoveryCase.status,
      metadata: { planId: plan._id, simulated: true, success: result.success },
    },
    {
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "RECOVERY_EXECUTED",
      reason: "CREATE_PAYMENT_LINK",
      result: recoveryCase.status,
      metadata: { planId: plan._id, simulated: true },
    },
  ]);
  item.status = "EXECUTED";
  item.executedAt = new Date();
}

async function executeVoiceItem({ item, plan, recoveryCase, customer, merchantId }) {
  let call;
  try {
    call = await initiateVoiceCall({ recoveryCase, customer });
  } catch (err) {
    item.status = "FAILED";
    item.removalReason = "TELEPHONY_ERROR";
    await writeAuditLog({
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "VOICE_RECOVERY_FAILED",
      reason: "TELEPHONY_ERROR",
      result: recoveryCase.status,
      metadata: { planId: plan._id, error: err.message },
    });
    return;
  }

  // The call is *initiated*, not completed. The case stays POLICY_APPROVED; voiceAttempts is
  // the real attempt counter and now blocks any further voice attempt via policy precedence.
  recoveryCase.voiceAttempts += 1;
  await recoveryCase.save();

  await RecoveryAction.create({
    caseId: recoveryCase._id,
    merchantId,
    actionType: "START_VOICE_RECOVERY",
    status: "INITIATED",
    result: call.callRef,
    metadata: { planId: plan._id, provider: call.provider, callRef: call.callRef },
  });
  await writeAuditLogs([
    {
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "VOICE_RECOVERY_STARTED",
      reason: "START_VOICE_RECOVERY",
      result: recoveryCase.status,
      metadata: { planId: plan._id, provider: call.provider, callRef: call.callRef },
    },
    {
      merchantId,
      caseId: recoveryCase._id,
      actor: "SYSTEM",
      eventType: "RECOVERY_EXECUTED",
      reason: "START_VOICE_RECOVERY",
      result: recoveryCase.status,
      metadata: { planId: plan._id },
    },
  ]);
  item.status = "EXECUTED";
  item.executedAt = new Date();
  item.executionRef = call.callRef;
}

function derivePlanStatus(items) {
  const cf = items.filter((i) => i.customerFacing);
  if (cf.length === 0) return "COMPLETED"; // plan held only escalate/stop items
  const executed = cf.filter((i) => i.status === "EXECUTED").length;
  const failed = cf.filter((i) => i.status === "FAILED").length;
  const removed = cf.filter((i) => i.status === "REMOVED").length;
  if (executed === cf.length) return "COMPLETED";
  if (executed === 0 && failed === cf.length) return "FAILED";
  if (executed === 0 && removed === cf.length) return "CANCELLED";
  return "PARTIAL";
}

// ---------------------------------------------------------------------------------------------
// Serialization for the API / UI
// ---------------------------------------------------------------------------------------------

export function serializePlan(plan) {
  if (!plan) return null;
  const items = plan.items.map((i) => ({
    caseId: i.caseId,
    customerId: i.customerId,
    customerName: i.customerName,
    intervention: i.intervention,
    reason: i.reason,
    recoveryProbability: i.recoveryProbability,
    amount: i.amount,
    currency: i.currency,
    customerFacing: i.customerFacing,
    requiresMerchantApproval: i.requiresMerchantApproval,
    status: i.status,
    executionRef: i.executionRef,
    removalReason: i.removalReason,
    executedAt: i.executedAt,
  }));

  const byIntervention = {};
  let amountAtRisk = 0;
  let recoverable = 0;
  for (const i of items) {
    byIntervention[i.intervention] = (byIntervention[i.intervention] || 0) + 1;
    if (i.customerFacing) {
      recoverable += 1;
      amountAtRisk += i.amount;
    }
  }

  return {
    id: plan._id,
    status: plan.status,
    expiresAt: plan.expiresAt,
    approvedBy: plan.approvedBy,
    approvedAt: plan.approvedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    items,
    summary: {
      totalItems: items.length,
      recoverable,
      amountAtRisk,
      byIntervention,
      executed: items.filter((i) => i.status === "EXECUTED").length,
      escalated: items.filter((i) => i.status === "ESCALATED").length,
      removed: items.filter((i) => i.status === "REMOVED").length,
      failed: items.filter((i) => i.status === "FAILED").length,
      pending: items.filter((i) => i.status === "PENDING").length,
    },
  };
}
