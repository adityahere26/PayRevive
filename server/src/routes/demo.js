// CLAUDE.md § Day 3 objective, § 2 Payment Failure Simulation — DEMO/TEST ONLY. Never
// executes a real payment; it calls the exact same shared ingest function
// (services/paymentFailureIngest.js) a connected merchant's real Razorpay `payment.failed`
// webhook uses (routes/webhooks.js POST /razorpay/inbound/:webhookId), only tagged with
// `source: "DEMO_SIMULATION"` — see ARCHITECTURE.md § Inbound payment-failure webhook
// ("one ingest, three triggers").

import { Router } from "express";
import { requireAuth, requireDemoMerchant } from "../middleware/auth.js";
import { paymentFailureRateLimiter } from "../middleware/rateLimit.js";
import { validateBody } from "../lib/validate.js";
import { NotFoundError } from "../lib/errors.js";
import { Merchant } from "../models/index.js";
import { ingestPaymentFailure } from "../services/paymentFailureIngest.js";
import { seedDemoDataset } from "../services/demoSeed.js";
import { completeDemoTestPayments } from "../services/demoTestPayment.js";
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
  requireDemoMerchant,
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

      // DEMO/TEST trigger for the shared ingest pipeline (server/src/services/
      // paymentFailureIngest.js) — the identical path a connected merchant's real Razorpay
      // `payment.failed` webhook takes, only tagged with a different `source`.
      const { recoveryCase, payment, customer, plan } = await ingestPaymentFailure({
        merchant,
        customerInput,
        amount,
        currency,
        failureReason,
        razorpayPaymentId,
        source: "DEMO_SIMULATION",
      });

      res.status(201).json({ recoveryCase, payment, customer, recoveryPlan: plan });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/demo/seed — DEMO/TEST ONLY. Resets the authenticated merchant's data and re-seeds
// the deterministic Buildathon scenario (100 clients / 90 passed / 10 failed), running the 10
// failed payments through the real recovery pipeline. Merchant-scoped: only the caller's own
// data is reset (see server/src/services/demoSeed.js). Same job as `npm run seed:demo`, over HTTP.
demoRouter.post("/seed", requireAuth, requireDemoMerchant, paymentFailureRateLimiter, async (req, res, next) => {
  try {
    const summary = await seedDemoDataset({ merchantId: req.merchant.id });
    res.status(201).json(summary);
  } catch (err) {
    next(err);
  }
});

// POST /api/demo/complete-test-payment — DEMO/TEST ONLY. Simulates a customer completing the
// Razorpay Test Mode payment for a case (or all of the merchant's cases) awaiting an outcome:
// it signs a payment_link.paid event and delivers it to the REAL webhook route. The webhook's
// signature verification, cross-checks, idempotency and outcome logic all run unchanged — this
// is not a "mark as paid" shortcut and it never mutates a RecoveryCase directly (see
// server/src/services/demoTestPayment.js). Body: optional { caseId }.
demoRouter.post("/complete-test-payment", requireAuth, requireDemoMerchant, paymentFailureRateLimiter, async (req, res, next) => {
  try {
    const caseId = typeof req.body?.caseId === "string" ? req.body.caseId : null;
    const hostPort = Number((req.get("host") || "").split(":")[1]);
    const localPort = req.socket?.localPort || (Number.isFinite(hostPort) ? hostPort : env.PORT);
    const selfBase = `http://127.0.0.1:${localPort}`;
    const result = await completeDemoTestPayments({ merchantId: req.merchant.id, caseId, selfBase });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
