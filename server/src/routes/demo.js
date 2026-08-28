// CLAUDE.md § Day 3 objective, § 2 Payment Failure Simulation — DEMO/TEST ONLY. Never
// executes a real payment; it creates the same Payment/RecoveryCase records a real
// `payment.failed` webhook would (once that path is built) and runs the identical
// pipeline/riskDetector.js function, per ARCHITECTURE.md's "one pipeline, two triggers"
// pattern already established for checkout abandonment.

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { paymentFailureRateLimiter } from "../middleware/rateLimit.js";
import { validateBody } from "../lib/validate.js";
import { NotFoundError } from "../lib/errors.js";
import { Merchant, Customer, Payment } from "../models/index.js";
import { detectPaymentFailureRisk } from "../pipeline/riskDetector.js";
import { planRecoveryForCase, serializePlan } from "../pipeline/recoveryPlan.js";
import { writeAuditLog } from "../audit/auditLogger.js";
import { env } from "../config/env.js";

export const demoRouter = Router();

const paymentFailureSchema = {
  type: "object",
  additionalProperties: false,
  required: ["customer", "amount", "failureReason"],
  properties: {
    customer: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 200 },
        email: { type: "string", minLength: 3, maxLength: 200, pattern: "^\\S+@\\S+\\.\\S+$" },
        phone: { type: "string", maxLength: 20 },
        optedOut: { type: "boolean" },
      },
    },
    amount: { type: "number", exclusiveMinimum: 0, maximum: 100000000 },
    currency: { type: "string", enum: ["INR"] },
    // Razorpay's own identifier for the simulated failed payment — opaque metadata, never
    // used to derive amount/customer/merchant (SECURITY.md § Input and AI output validation).
    razorpayPaymentId: { type: "string", maxLength: 100 },
    failureReason: { type: "string", minLength: 1, maxLength: 100 },
  },
};

demoRouter.post(
  "/payment-failure",
  requireAuth,
  paymentFailureRateLimiter,
  validateBody(paymentFailureSchema),
  async (req, res, next) => {
    try {
      const merchant = await Merchant.findById(req.merchant.id);
      if (!merchant) {
        next(new NotFoundError("Merchant not found"));
        return;
      }

      const { customer: customerInput, amount, currency = "INR", razorpayPaymentId = null, failureReason } =
        req.body;

      // Upsert-by-email-per-merchant so repeated demo submissions for the same customer
      // build real payment history (Payment collection) instead of a fresh, historyless
      // customer each time — that history is what the Scoring Engine reads.
      let customer;
      if (customerInput.email) {
        customer = await Customer.findOneAndUpdate(
          { merchantId: merchant._id, email: customerInput.email.toLowerCase() },
          {
            $setOnInsert: {
              merchantId: merchant._id,
              name: customerInput.name,
              email: customerInput.email.toLowerCase(),
              phone: customerInput.phone,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (typeof customerInput.optedOut === "boolean" && customer.optedOut !== customerInput.optedOut) {
          customer.optedOut = customerInput.optedOut;
          await customer.save();
        }
      } else {
        customer = await Customer.create({
          merchantId: merchant._id,
          name: customerInput.name,
          phone: customerInput.phone,
          optedOut: Boolean(customerInput.optedOut),
        });
      }

      const payment = await Payment.create({
        merchantId: merchant._id,
        customerId: customer._id,
        amount,
        currency,
        status: "failed",
        failureReason,
        razorpayPaymentId,
      });

      const recoveryCase = await detectPaymentFailureRisk({ merchant, customer, payment });

      await writeAuditLog({
        merchantId: merchant._id,
        caseId: recoveryCase._id,
        actor: "SYSTEM",
        eventType: "REVENUE_RISK_DETECTED",
        reason: "PAYMENT_FAILED",
        metadata: { paymentId: payment._id, amount: recoveryCase.amount, sourceType: "PAYMENT_FAILURE" },
        result: recoveryCase.status,
      });

      // Approval-gated autonomy (ARCHITECTURE.md § Recovery plans): PayRevive autonomously runs
      // the SAME evaluate pipeline and records the decision as an item on the merchant's
      // recovery plan. It does NOT contact the customer — no payment link, no call — until the
      // merchant confirms the plan (POST /api/recovery-plan/:id/confirm). Disabled only when
      // RECOVERY_AUTOPLAN_ENABLED=false (and forced off in the shared test harness).
      let finalCase = recoveryCase;
      let recoveryPlan = null;
      if (env.RECOVERY_AUTOPLAN_ENABLED) {
        const result = await planRecoveryForCase({ recoveryCase, merchant, customer, payment });
        finalCase = result.recoveryCase || recoveryCase;
        recoveryPlan = result.plan ? serializePlan(result.plan) : null;
      }

      res.status(201).json({ recoveryCase: finalCase, payment, customer, recoveryPlan });
    } catch (err) {
      next(err);
    }
  }
);
