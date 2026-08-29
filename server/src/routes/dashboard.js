// ARCHITECTURE.md § API contract — GET /api/dashboard/summary: primary + secondary metrics
// for the authenticated merchant. Aggregation pipelines are $match-scoped by merchantId as an
// ObjectId (mongoose aggregate does not auto-cast query strings the way find() does), keeping
// merchant isolation intact for aggregated reads too.

import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { RecoveryCase, Customer, Payment, AuditLog, RecoveryPlan } from "../models/index.js";
import { serializePlan } from "../pipeline/recoveryPlan.js";
import { env } from "../config/env.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (req, res, next) => {
  try {
    const merchantId = new mongoose.Types.ObjectId(req.merchant.id);

    const [riskAgg, recoveredAgg, statusCounts, revenueByStatusAgg, interventionAgg, recentCases, executedInterventionsCount, planStatusCounts, pendingPlans] = await Promise.all([
      RecoveryCase.aggregate([
        { $match: { merchantId } },
        { $group: { _id: null, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      RecoveryCase.aggregate([
        { $match: { merchantId, status: "RECOVERED" } },
        { $group: { _id: null, totalRecovered: { $sum: "$recoveredAmount" }, count: { $sum: 1 } } },
      ]),
      RecoveryCase.aggregate([{ $match: { merchantId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      // Revenue (not just case count) per status — powers the Dashboard's "Recovery
      // Performance" breakdown without fabricating any time-series (ARCHITECTURE.md has no
      // historical/bucketed data to draw one from honestly).
      RecoveryCase.aggregate([
        { $match: { merchantId } },
        { $group: { _id: "$status", revenue: { $sum: "$amount" } } },
      ]),
      // Grouped by the intervention the Policy Engine actually approved — same shape as the
      // Evaluation engine's recoveryByIntervention (evaluation/batchEvaluator.js) so the two
      // views render identically, but this is real merchant data only: RecoveryCase docs are
      // never created by the evaluation engine (it never persists synthetic cases), so this
      // aggregation structurally cannot include synthetic/simulated-run data.
      RecoveryCase.aggregate([
        { $match: { merchantId, selectedIntervention: { $ne: null } } },
        {
          $group: {
            _id: "$selectedIntervention",
            count: { $sum: 1 },
            revenue: { $sum: "$amount" },
            recoveredRevenue: {
              $sum: { $cond: [{ $eq: ["$status", "RECOVERED"] }, "$recoveredAmount", 0] },
            },
          },
        },
      ]),
      RecoveryCase.find({ merchantId }).sort({ createdAt: -1 }).limit(10),
      // Interventions that have ACTUALLY executed after a merchant confirmed a plan — a
      // RECOVERY_EXECUTED audit event is written by pipeline/recoveryPlan.js only once a
      // customer-facing action ran. A plan being prepared is deliberately NOT counted here.
      AuditLog.countDocuments({ merchantId, eventType: "RECOVERY_EXECUTED" }),
      RecoveryPlan.aggregate([
        { $match: { merchantId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      RecoveryPlan.find({ merchantId, status: "PENDING_APPROVAL" }),
    ]);

    const planStatusBreakdown = Object.fromEntries(planStatusCounts.map((s) => [s._id, s.count]));
    const itemsAwaitingApproval = pendingPlans.reduce(
      (sum, plan) => sum + plan.items.filter((i) => i.customerFacing && i.status === "PENDING").length,
      0
    );

    const statusBreakdown = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
    const revenueByStatus = Object.fromEntries(revenueByStatusAgg.map((s) => [s._id, s.revenue]));
    const interventionBreakdown = Object.fromEntries(
      interventionAgg.map((g) => [
        g._id,
        {
          count: g.count,
          revenue: g.revenue,
          recoveredRevenue: g.recoveredRevenue,
          recoveryRate: g.revenue > 0 ? g.recoveredRevenue / g.revenue : 0,
        },
      ])
    );

    res.status(200).json({
      // Drives whether the client shows the DEMO/TEST controls (Simulate Payment Failure). A
      // real merchant never sees them — their failures arrive only via the Razorpay webhook.
      isDemoMerchant: Boolean(req.merchant.isDemo),
      revenueAtRisk: riskAgg[0]?.totalAmount || 0,
      totalCases: riskAgg[0]?.count || 0,
      recoveredRevenue: recoveredAgg[0]?.totalRecovered || 0,
      recoveredCases: recoveredAgg[0]?.count || 0,
      casesRequiringReview: statusBreakdown.ESCALATED || 0,
      statusBreakdown,
      revenueByStatus,
      interventionBreakdown,
      recentCases,
      // Accurate terminology (spec): the system decides automatically, customer contact is
      // approval-gated. "Ready" = plans a merchant can confirm; "executed" = actions that ran
      // after confirmation.
      recoveryAutomation: {
        autoplanEnabled: env.RECOVERY_AUTOPLAN_ENABLED,
        plansAwaitingApproval: planStatusBreakdown.PENDING_APPROVAL || 0,
        plansExecuting: planStatusBreakdown.EXECUTING || 0,
        plansCompleted: (planStatusBreakdown.COMPLETED || 0) + (planStatusBreakdown.PARTIAL || 0),
        customersAwaitingApproval: itemsAwaitingApproval,
        executedInterventions: executedInterventionsCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/payments-overview — powers the business-owner Payments page
// (client/src/pages/Payments.jsx): a merchant-scoped count of clients/passed/failed payments,
// plus the failed-payment list joined against each payment's own RecoveryCase (created 1:1 by
// routes/demo.js's detectPaymentFailureRisk for every PAYMENT_FAILURE case — see
// pipeline/riskDetector.js). Reads only; no business logic here that doesn't already live in
// the models it queries — every intervention/status value shown is the pipeline's own.
dashboardRouter.get("/payments-overview", async (req, res, next) => {
  try {
    const merchantId = new mongoose.Types.ObjectId(req.merchant.id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const [totalClients, paymentsPassed, paymentsFailed, totalFailedPayments, failedPaymentDocs, activePlan] =
      await Promise.all([
        Customer.countDocuments({ merchantId }),
        Payment.countDocuments({ merchantId, status: "paid" }),
        Payment.countDocuments({ merchantId, status: "failed" }),
        Payment.countDocuments({ merchantId, status: "failed" }),
        Payment.find({ merchantId, status: "failed" })
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        // The merchant's CURRENT plan: the open one awaiting confirmation if there is one,
        // otherwise the most recent plan — so after confirmation the panel keeps showing
        // execution progress and the demo test-payment control instead of collapsing to the
        // "automation ready" placeholder. Same selection rule as GET /api/recovery-plan/current.
        RecoveryPlan.findOne({ merchantId, status: "PENDING_APPROVAL" }).then(
          (p) => p || RecoveryPlan.findOne({ merchantId }).sort({ createdAt: -1 })
        ),
      ]);

    const customerIds = failedPaymentDocs.map((p) => p.customerId);
    const paymentIds = failedPaymentDocs.map((p) => p._id);

    const [customers, recoveryCases] = await Promise.all([
      Customer.find({ merchantId, _id: { $in: customerIds } }),
      RecoveryCase.find({ merchantId, paymentId: { $in: paymentIds } }),
    ]);
    const customerById = new Map(customers.map((c) => [String(c._id), c]));
    const caseByPaymentId = new Map(recoveryCases.map((c) => [String(c.paymentId), c]));

    const failedPayments = failedPaymentDocs.map((p) => {
      const customer = customerById.get(String(p.customerId));
      const recoveryCase = caseByPaymentId.get(String(p._id)) || null;
      return {
        paymentId: p._id,
        customerId: p.customerId,
        customerName: customer?.name || null,
        customerEmail: customer?.email || null,
        customerOptedOut: customer?.optedOut || false,
        amount: p.amount,
        currency: p.currency,
        failureReason: p.failureReason,
        createdAt: p.createdAt,
        recoveryCase: recoveryCase && {
          id: recoveryCase._id,
          status: recoveryCase.status,
          selectedIntervention: recoveryCase.selectedIntervention,
          policyDecision: recoveryCase.policyDecision,
          recoveryProbability: recoveryCase.recoveryProbability,
          attempts: recoveryCase.attempts,
          voiceAttempts: recoveryCase.voiceAttempts,
          recoveredAmount: recoveryCase.recoveredAmount,
          razorpayPaymentLinkShortUrl: recoveryCase.razorpayPaymentLinkShortUrl,
          recoveryWindowExpiresAt: recoveryCase.recoveryWindowExpiresAt,
        },
      };
    });

    // Rollup of where the agent has taken every failed payment on this page — computed from the
    // cases' own pipeline statuses, never fabricated. IN_PROGRESS folds the intermediate
    // states (policy-approved, action executed, awaiting a Razorpay outcome) the merchant does
    // not need to distinguish at a glance.
    const IN_PROGRESS = new Set(["ANALYZING", "ELIGIBLE", "ACTION_SELECTED", "POLICY_APPROVED", "ACTION_EXECUTED"]);
    const recoverySummary = { recoverable: 0, inProgress: 0, awaitingOutcome: 0, recovered: 0, escalated: 0, stopped: 0, failed: 0, expired: 0, noCase: 0 };
    for (const row of failedPayments) {
      const s = row.recoveryCase?.status;
      if (!s) recoverySummary.noCase += 1;
      else if (s === "RISK_DETECTED") recoverySummary.recoverable += 1;
      else if (s === "WAITING_OUTCOME") recoverySummary.awaitingOutcome += 1;
      else if (s === "RECOVERED") recoverySummary.recovered += 1;
      else if (s === "ESCALATED") recoverySummary.escalated += 1;
      else if (s === "STOPPED") recoverySummary.stopped += 1;
      else if (s === "FAILED") recoverySummary.failed += 1;
      else if (s === "EXPIRED") recoverySummary.expired += 1;
      else if (IN_PROGRESS.has(s)) recoverySummary.inProgress += 1;
    }

    res.status(200).json({
      // See /summary — gates the client's DEMO/TEST controls (e.g. "Complete test payment").
      isDemoMerchant: Boolean(req.merchant.isDemo),
      totalClients,
      paymentsPassed,
      paymentsFailed,
      failedPayments,
      totalFailedPayments,
      recoverySummary,
      // The merchant's current recovery plan (or null if none has ever been prepared). While
      // PENDING_APPROVAL, no customer-facing action has run — see ARCHITECTURE.md § Recovery
      // plans; once EXECUTING/terminal, item.status / executedAt reflect what actually ran.
      recoveryPlan: serializePlan(activePlan),
      autoplanEnabled: env.RECOVERY_AUTOPLAN_ENABLED,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});
