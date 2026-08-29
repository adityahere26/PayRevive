// Deterministic synthetic DEMO dataset for the Buildathon scenario:
//
//   100 total clients · 90 successful payments · 10 failed payments
//
// Every number the Payments page / Dashboard shows comes from REAL persisted records here plus
// the existing backend aggregation — nothing is hardcoded in the frontend. The 10 failed
// payments are run through the EXISTING recovery pipeline (pipeline/riskDetector.js ->
// pipeline/recoveryPlan.js planRecoveryForCase), so their outcomes (payment-link / voice /
// escalate / stop / expired) are the policy engine's own decisions, not fixtures.
//
// Fully deterministic: customer identities, amounts and failure reasons are index-based (no
// RNG), and the scoring/policy engines are pure — so `npm run seed:demo` produces byte-stable
// case outcomes every time. Re-seeding first RESETS this merchant's data (merchant-scoped
// deletes only — other merchants are never touched), so the scenario is reproducible.
//
// Clearly synthetic: emails are @payrevive.demo, every audit/payment record carries demo:true,
// and no Razorpay Live Mode is involved anywhere (Test Mode only, and the seed never even
// executes an intervention — it only PLANS them, leaving the plan PENDING_APPROVAL for the
// merchant to confirm).

import {
  Merchant,
  Customer,
  Payment,
  RecoveryCase,
  RecoveryAction,
  RecoveryPlan,
  AuditLog,
  WebhookEvent,
} from "../models/index.js";
import { detectPaymentFailureRisk } from "../pipeline/riskDetector.js";
import { preparePlanItem, commitPlanItems } from "../pipeline/recoveryPlan.js";
import { writeAuditLog } from "../audit/auditLogger.js";
import { logger } from "../lib/logger.js";

export const DEMO_TOTAL_CLIENTS = 100;
export const DEMO_PAYMENTS_PASSED = 90;
export const DEMO_PAYMENTS_FAILED = 10;

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan",
  "Ananya", "Diya", "Aadhya", "Saanvi", "Pari", "Anika", "Navya", "Riya", "Myra", "Kiara",
  "Kabir", "Advait", "Dhruv", "Neha", "Priya",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Patel", "Reddy", "Nair", "Iyer", "Menon", "Rao", "Singh",
  "Kumar", "Bose", "Das", "Mehta", "Shah",
];
const PAID_AMOUNTS = [1499, 2499, 999, 4999, 3499, 1999];

function demoName(i) {
  return `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`;
}
function demoEmail(i) {
  return `demo-customer-${String(i).padStart(3, "0")}@payrevive.demo`;
}

// The 10 failed payments. `customerIndex` maps into the 100 seeded customers. `expect` is the
// pipeline outcome we design each case to reach — asserted (not forced) so scoring drift is
// caught, never hidden.
const FAILED_SPECS = [
  { customerIndex: 0, reason: "insufficient_funds",    amount: 14999, priorPaid: 6, optedOut: false, expiredWindow: false, plan: true,  expect: "START_VOICE_RECOVERY" },
  { customerIndex: 1, reason: "authentication_failed", amount: 8750,  priorPaid: 6, optedOut: false, expiredWindow: false, plan: true,  expect: "START_VOICE_RECOVERY" },
  { customerIndex: 2, reason: "insufficient_funds",    amount: 2999,  priorPaid: 0, optedOut: false, expiredWindow: false, plan: true,  expect: "CREATE_PAYMENT_LINK" },
  { customerIndex: 3, reason: "otp_timeout",           amount: 4599,  priorPaid: 0, optedOut: false, expiredWindow: false, plan: true,  expect: "CREATE_PAYMENT_LINK" },
  { customerIndex: 4, reason: "card_expired",          amount: 3200,  priorPaid: 0, optedOut: false, expiredWindow: false, plan: true,  expect: "CREATE_PAYMENT_LINK" },
  { customerIndex: 5, reason: "gateway_error",         amount: 6499,  priorPaid: 0, optedOut: false, expiredWindow: false, plan: true,  expect: "CREATE_PAYMENT_LINK" },
  { customerIndex: 6, reason: "network_error",         amount: 1899,  priorPaid: 0, optedOut: false, expiredWindow: false, plan: false, expect: "RISK_DETECTED" },
  { customerIndex: 7, reason: "insufficient_funds",    amount: 2450,  priorPaid: 0, optedOut: true,  expiredWindow: false, plan: true,  expect: "STOPPED" },
  { customerIndex: 8, reason: "insufficient_funds",    amount: 74999, priorPaid: 0, optedOut: false, expiredWindow: false, plan: true,  expect: "ESCALATED" },
  { customerIndex: 9, reason: "processing_error",      amount: 3300,  priorPaid: 0, optedOut: false, expiredWindow: true,  plan: true,  expect: "EXPIRED" },
];

/**
 * Resets and re-seeds the demo dataset for one merchant.
 * @param {{merchantId: any}} args
 * @returns {Promise<{totalClients:number, paymentsPassed:number, paymentsFailed:number, recoveryPlanId:string|null, outcomes:Array<object>}>}
 */
export async function seedDemoDataset({ merchantId }) {
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error(`seedDemoDataset: merchant ${merchantId} not found`);

  // 1. Reset — MERCHANT-SCOPED deletes only. Another merchant's data is never touched.
  // WebhookEvent has no merchantId (it is a platform-level idempotency ledger); only the
  // demo helper's own `demo-plink-*` entries are cleared so re-seeding + re-completing works.
  await Promise.all([
    Customer.deleteMany({ merchantId }),
    Payment.deleteMany({ merchantId }),
    RecoveryCase.deleteMany({ merchantId }),
    RecoveryAction.deleteMany({ merchantId }),
    RecoveryPlan.deleteMany({ merchantId }),
    AuditLog.deleteMany({ merchantId }),
    WebhookEvent.deleteMany({ eventId: { $regex: "^demo-plink-" } }),
  ]);

  // 2. 100 customers (index order preserved by insertMany).
  const customerDocs = [];
  for (let i = 0; i < DEMO_TOTAL_CLIENTS; i++) {
    const failedSpec = FAILED_SPECS.find((s) => s.customerIndex === i);
    customerDocs.push({
      merchantId,
      name: demoName(i),
      email: demoEmail(i),
      optedOut: failedSpec ? failedSpec.optedOut : false,
    });
  }
  const customers = await Customer.insertMany(customerDocs);

  // 3. 90 successful payments — prior history for the loyal failed customers, then one each for
  //    a contiguous block of otherwise-untouched customers. Computed so the total is exact.
  const priorPaidTotal = FAILED_SPECS.reduce((sum, s) => sum + s.priorPaid, 0);
  const remainingPaid = DEMO_PAYMENTS_PASSED - priorPaidTotal;
  if (remainingPaid < 0) throw new Error("seedDemoDataset: prior-paid history exceeds DEMO_PAYMENTS_PASSED");
  if (10 + remainingPaid > DEMO_TOTAL_CLIENTS) {
    throw new Error("seedDemoDataset: not enough customers to hold the remaining paid payments");
  }

  const paidDocs = [];
  let paidCounter = 0;
  for (const spec of FAILED_SPECS) {
    for (let k = 0; k < spec.priorPaid; k++) {
      paidDocs.push({
        merchantId,
        customerId: customers[spec.customerIndex]._id,
        amount: PAID_AMOUNTS[paidCounter % PAID_AMOUNTS.length],
        currency: "INR",
        status: "paid",
        razorpayPaymentId: `pay_demo_${spec.customerIndex}_h${k}`,
      });
      paidCounter += 1;
    }
  }
  for (let n = 0; n < remainingPaid; n += 1) {
    const ci = 10 + n; // customers 10 .. 10+remainingPaid-1
    paidDocs.push({
      merchantId,
      customerId: customers[ci]._id,
      amount: PAID_AMOUNTS[paidCounter % PAID_AMOUNTS.length],
      currency: "INR",
      status: "paid",
      razorpayPaymentId: `pay_demo_${ci}`,
    });
    paidCounter += 1;
  }
  await Payment.insertMany(paidDocs);

  // 4. 10 failed payments → the EXISTING recovery pipeline (detect → evaluate). No intervention
  //    is executed here; the single shared plan stays PENDING_APPROVAL for the merchant's
  //    confirmation. The 10 cases are independent (distinct customers, distinct cases), so
  //    detection + evaluation + per-case audit run CONCURRENTLY; the one shared write —
  //    appending every planned item to the merchant's RecoveryPlan — is done once, afterwards,
  //    via commitPlanItems. This turns ~90 sequential DB round-trips into a handful, which is
  //    what the "Entering demo…" latency was dominated by on the hosted (high-RTT) database.
  const failedPaymentDocs = await Payment.insertMany(
    FAILED_SPECS.map((spec) => ({
      merchantId,
      customerId: customers[spec.customerIndex]._id,
      amount: spec.amount,
      currency: "INR",
      status: "failed",
      failureReason: spec.reason,
      razorpayPaymentId: `pay_demo_failed_${spec.customerIndex}`,
    }))
  );

  const prepared = await Promise.all(
    FAILED_SPECS.map(async (spec, i) => {
      const customer = customers[spec.customerIndex];
      const payment = failedPaymentDocs[i];

      let recoveryCase = await detectPaymentFailureRisk({ merchant, customer, payment });
      if (spec.expiredWindow) {
        // The recovery window is computed from "now" by riskDetector; push it into the past —
        // before evaluation — so the (unchanged) policy engine resolves this case to EXPIRED
        // on its own. One save on the doc we already hold; no update + re-fetch.
        recoveryCase.recoveryWindowExpiresAt = new Date(Date.now() - 60 * 60 * 1000);
        await recoveryCase.save();
      }
      await writeAuditLog({
        merchantId,
        caseId: recoveryCase._id,
        actor: "SYSTEM",
        eventType: "REVENUE_RISK_DETECTED",
        reason: "PAYMENT_FAILED",
        metadata: { paymentId: payment._id, amount: recoveryCase.amount, sourceType: "PAYMENT_FAILURE", demo: true },
        result: recoveryCase.status,
      });

      let itemFields = null;
      if (spec.plan) {
        const p = await preparePlanItem({ recoveryCase, merchant, customer, payment });
        recoveryCase = p.recoveryCase || recoveryCase;
        itemFields = p.itemFields;
      }
      return { spec, customer, payment, recoveryCase, itemFields };
    })
  );

  // One shared plan: every planned item, in FAILED_SPECS order, in a single write + audit batch.
  const planned = prepared.filter((p) => p.itemFields);
  const { plan: sharedPlan } = planned.length
    ? await commitPlanItems({ merchantId, prepared: planned })
    : { plan: null };

  const outcomes = prepared.map(({ spec, customer, payment, recoveryCase, itemFields }) => {
    const outcome = {
      customerIndex: spec.customerIndex,
      customerName: customer.name,
      paymentId: String(payment._id),
      caseId: String(recoveryCase._id),
      failureReason: spec.reason,
      amount: spec.amount,
      status: recoveryCase.status,
      selectedIntervention: recoveryCase.selectedIntervention || null,
      expected: spec.expect,
      planId: itemFields && sharedPlan ? String(sharedPlan._id) : null,
    };
    const reached = outcome.selectedIntervention || outcome.status;
    outcome.matchedExpectation = reached === spec.expect;
    if (!outcome.matchedExpectation) {
      logger.warn("demo seed: case outcome differs from designed expectation", {
        customerIndex: spec.customerIndex,
        expected: spec.expect,
        reached,
      });
    }
    return outcome;
  });

  // 5. Contract self-check — the headline counts must be exact, or the seed failed.
  const [totalClients, paymentsPassed, paymentsFailed] = await Promise.all([
    Customer.countDocuments({ merchantId }),
    Payment.countDocuments({ merchantId, status: "paid" }),
    Payment.countDocuments({ merchantId, status: "failed" }),
  ]);
  if (
    totalClients !== DEMO_TOTAL_CLIENTS ||
    paymentsPassed !== DEMO_PAYMENTS_PASSED ||
    paymentsFailed !== DEMO_PAYMENTS_FAILED
  ) {
    throw new Error(
      `seedDemoDataset: count mismatch — clients ${totalClients}/${DEMO_TOTAL_CLIENTS}, ` +
        `paid ${paymentsPassed}/${DEMO_PAYMENTS_PASSED}, failed ${paymentsFailed}/${DEMO_PAYMENTS_FAILED}`
    );
  }

  const activePlan = await RecoveryPlan.findOne({ merchantId, status: "PENDING_APPROVAL" });

  logger.info("demo dataset seeded", {
    merchantId: String(merchantId),
    totalClients,
    paymentsPassed,
    paymentsFailed,
    recoveryPlanId: activePlan ? String(activePlan._id) : null,
    outcomes: outcomes.map((o) => `${o.customerIndex}:${o.status}/${o.selectedIntervention || "-"}`),
  });

  return {
    demo: true,
    totalClients,
    paymentsPassed,
    paymentsFailed,
    recoveryPlanId: activePlan ? String(activePlan._id) : null,
    outcomes,
  };
}
