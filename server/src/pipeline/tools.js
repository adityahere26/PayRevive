// AGENT_DESIGN.md § Tools (backend service functions) — the merchant-scoped data accessors
// named in the brief, implemented as plain backend functions callable only by pipeline/route
// code, never by an AI Decision/Planner directly. Every query is scoped by merchantId at the
// query level (SECURITY.md § Authorization / IDOR prevention), never filtered after the fact.

import { Customer, Payment, RecoveryCase } from "../models/index.js";

const RESOLVED_CASE_STATUSES = ["RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"];

export async function getCustomerHistory(customerId, merchantId) {
  const [prevSuccessfulPayments, prevFailedPayments, lastPayment, priorCases] = await Promise.all([
    Payment.countDocuments({ merchantId, customerId, status: "paid" }),
    Payment.countDocuments({ merchantId, customerId, status: "failed" }),
    Payment.findOne({ merchantId, customerId }).sort({ createdAt: -1 }),
    RecoveryCase.find({ merchantId, customerId, status: { $in: RESOLVED_CASE_STATUSES } }).select("status"),
  ]);

  const resolvedCount = priorCases.length;
  const recoveredCount = priorCases.filter((c) => c.status === "RECOVERED").length;

  return {
    prevSuccessfulPayments,
    prevFailedPayments,
    lastActivityAt: lastPayment ? lastPayment.createdAt : null,
    priorRecoverySuccessRate: resolvedCount > 0 ? recoveredCount / resolvedCount : null,
  };
}

/** SECURITY.md-style scoped fetch — never findById alone. */
export async function getRecoveryCase(caseId, merchantId) {
  return RecoveryCase.findOne({ _id: caseId, merchantId });
}

export async function getCustomer(customerId, merchantId) {
  return Customer.findOne({ _id: customerId, merchantId });
}

export async function getPaymentDetails(paymentId, merchantId) {
  if (!paymentId) return null;
  return Payment.findOne({ _id: paymentId, merchantId });
}
