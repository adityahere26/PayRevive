// RECOVERY_POLICY.md § Merchant policy fields. Exposes the SAME `merchant.policy` subdocument
// (server/src/models/Merchant.js) that the Eligibility/Policy Engine (server/src/policy/
// policyPrecedence.js) already reads fresh from the database on every pipeline run
// (Merchant.findById inside routes/recoveryCases.js and routes/voice.js) — updating it here
// requires no Policy Engine change at all, the next /evaluate call simply reads the new
// values. Validation here is input sanity (type/range) only, never a re-implementation of
// STOP/ESCALATE/APPROVE decision logic — that logic stays exclusively in policyPrecedence.js.

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { NotFoundError } from "../lib/errors.js";
import { Merchant } from "../models/index.js";
import { writeAuditLog } from "../audit/auditLogger.js";

export const policyRouter = Router();

policyRouter.use(requireAuth);

const policyUpdateRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many policy update requests. Please try again shortly.",
});

// Mirrors the Mongoose bounds in models/Merchant.js's policySchema — never looser than the
// schema itself, just enforced earlier with a structured 400 instead of a Mongoose
// ValidationError. additionalProperties:false so an unknown field is rejected, not silently
// dropped or (worse) silently accepted into the policy the pipeline reads.
const policyUpdateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    maxRecoveryAttempts: { type: "integer", minimum: 0, maximum: 20 },
    maxVoiceAttempts: { type: "integer", minimum: 0, maximum: 10 },
    maxAutonomousAmount: { type: "number", minimum: 0, maximum: 100000000 },
    recoveryWindowHours: { type: "integer", minimum: 1, maximum: 2160 },
    escalationAmount: { type: ["number", "null"], minimum: 0, maximum: 100000000 },
    optOutBehavior: { type: "string", enum: ["DO_NOT_CONTACT"] },
    maxContactAttempts: { type: "integer", minimum: 0, maximum: 20 },
    voiceEnabled: { type: "boolean" },
  },
};

const POLICY_FIELDS = Object.keys(policyUpdateSchema.properties);

policyRouter.get("/", async (req, res, next) => {
  try {
    const merchant = await Merchant.findById(req.merchant.id);
    if (!merchant) {
      next(new NotFoundError("Merchant not found"));
      return;
    }
    res.status(200).json({ policy: merchant.policy });
  } catch (err) {
    next(err);
  }
});

policyRouter.put("/", policyUpdateRateLimiter, validateBody(policyUpdateSchema), async (req, res, next) => {
  try {
    const merchant = await Merchant.findById(req.merchant.id);
    if (!merchant) {
      next(new NotFoundError("Merchant not found"));
      return;
    }

    const before = merchant.policy.toObject();
    const changedFields = [];
    for (const field of POLICY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field) && req.body[field] !== before[field]) {
        merchant.policy[field] = req.body[field];
        changedFields.push(field);
      }
    }

    if (changedFields.length > 0) {
      await merchant.save();
      // AuditLog.js's own comment anticipated this: "caseId is optional because a small
      // number of future audit events (e.g. merchant policy changes) are merchant-scoped, not
      // case-scoped."
      await writeAuditLog({
        merchantId: merchant._id,
        actor: "MERCHANT",
        eventType: "MERCHANT_POLICY_UPDATED",
        reason: changedFields.join(", "),
        result: "UPDATED",
        metadata: { before: Object.fromEntries(changedFields.map((f) => [f, before[f]])), after: Object.fromEntries(changedFields.map((f) => [f, merchant.policy[f]])) },
      });
    }

    res.status(200).json({ policy: merchant.policy, changedFields });
  } catch (err) {
    next(err);
  }
});
