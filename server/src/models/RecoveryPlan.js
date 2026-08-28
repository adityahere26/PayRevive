// Approval-gated autonomy (ARCHITECTURE.md § Recovery plans). PayRevive detects, analyzes,
// runs eligibility + policy, and *prepares* a recovery plan on its own — but no customer-facing
// action (payment link, outbound voice call) executes until the merchant confirms that one
// plan. This is a lightweight tracking layer over the recovery cases; it is NOT a second state
// machine for a case's lifecycle (that stays in RecoveryCase.status). It only records "what the
// agent decided" and "did the merchant approve + did we execute it".
//
// One PENDING_APPROVAL plan per merchant at a time — new failed payments are added as items to
// the open plan (or a fresh plan if none is open). Once confirmed, the plan runs to a terminal
// state and the next failure starts a new plan.

import mongoose from "mongoose";
import { INTERVENTIONS } from "./RecoveryCase.js";

const { Schema } = mongoose;

export const RECOVERY_PLAN_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED", // transient — set the instant a confirm claims the plan, before item execution
  "EXECUTING",
  "COMPLETED", // every customer-facing item executed
  "PARTIAL", // some executed, some removed/failed by revalidation
  "FAILED", // every customer-facing item failed
  "CANCELLED", // expired, explicitly cancelled, or nothing left to do
];

// Per-item lifecycle — distinct from the case's own status.
export const RECOVERY_PLAN_ITEM_STATUSES = [
  "PENDING", // awaiting merchant confirmation
  "EXECUTED", // customer-facing action carried out after confirmation
  "ESCALATED", // surfaced for merchant review (no autonomous action)
  "SKIPPED", // STOP / already-resolved case — nothing to do, by design
  "REMOVED", // revalidation at confirm time found the decision stale/invalid
  "FAILED", // execution was attempted and failed (case stays retryable)
];

const recoveryPlanItemSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: "RecoveryCase", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    customerName: { type: String, default: null },
    // The intervention the Policy Engine approved (CREATE_PAYMENT_LINK / START_VOICE_RECOVERY),
    // or ESCALATE / STOP for a case eligibility/policy already routed to a terminal status.
    intervention: { type: String, enum: [...INTERVENTIONS], required: true },
    reason: { type: String, default: null }, // policyDecision / root-cause-derived
    // One-line plain-language "why" for this item (recoveryCase.decisionRationale.headline),
    // shown in the merchant's plan review — see pipeline/decisionRationale.js.
    decisionHeadline: { type: String, default: null },
    recoveryProbability: { type: Number, min: 0, max: 1, default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    // True for actions that contact the customer — these are the ones the merchant confirms.
    customerFacing: { type: Boolean, default: false },
    requiresMerchantApproval: { type: Boolean, default: false },
    status: { type: String, enum: RECOVERY_PLAN_ITEM_STATUSES, default: "PENDING" },
    // Populated after execution: Razorpay payment link id, telephony call ref, etc.
    executionRef: { type: String, default: null },
    // Populated when status becomes REMOVED at confirm time (e.g. OPT_OUT_BEHAVIOR).
    removalReason: { type: String, default: null },
    executedAt: { type: Date, default: null },
  },
  { _id: true, timestamps: false }
);

const recoveryPlanSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    status: {
      type: String,
      enum: RECOVERY_PLAN_STATUSES,
      default: "PENDING_APPROVAL",
      index: true,
    },
    items: { type: [recoveryPlanItemSchema], default: [] },
    // Actor + time of the single merchant confirmation. approvedBy is an audit-actor value
    // ("MERCHANT"), never a free-text name.
    approvedBy: { type: String, enum: ["MERCHANT", null], default: null },
    approvedAt: { type: Date, default: null },
    // Stale-plan guard: a plan not confirmed by this time is cancelled rather than executed
    // against a world that may have moved on. Defaults to 24h from creation in the planner.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

recoveryPlanSchema.index({ merchantId: 1, status: 1 });
recoveryPlanSchema.index({ merchantId: 1, createdAt: -1 });
// At most one open plan per merchant — new failed payments append to it rather than spawning
// parallel plans. A concurrent create loses with E11000 and adopts the winner's plan.
recoveryPlanSchema.index(
  { merchantId: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING_APPROVAL" } }
);

export const RecoveryPlan = mongoose.model("RecoveryPlan", recoveryPlanSchema);
