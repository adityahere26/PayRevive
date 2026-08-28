// Turns the recovery pipeline's already-computed outputs (rootCause, recoveryProbability,
// reasonCodes, selectedIntervention, policyDecision) into one plain-language sentence plus a
// factor list — so the case-detail UI can SHOW the agent reasoning, not just list disconnected
// fields. Pure and deterministic: it only *describes* what modules 3-6 decided, it never makes
// or changes a decision. No DB, no LLM, no side effects.
//
// CLAUDE.md permits optional Gemini-generated explanation text; this deterministic version is
// always available (works offline, in tests, and inside Razorpay's 5s webhook window) and can
// be swapped/augmented later.

// Scoring reason codes come from pipeline/scoringEngine.js (calculateRecoveryScore); order
// here is strongest-signal-first so factors[0] is the headline-worthy one.
const SCORE_FACTORS = {
  PREVIOUS_SUCCESSFUL_PAYMENTS: {
    label: "Strong payment history",
    detail: "this customer has paid the large majority of past invoices",
  },
  RETRYABLE_FAILURE: {
    label: "Failure looks transient",
    detail: "the decline is the kind that usually clears on a fresh attempt",
  },
  WITHIN_RECOVERY_WINDOW: {
    label: "Caught early",
    detail: "the failure is recent and well inside the recovery window",
  },
  ACTIVE_CUSTOMER: {
    label: "Active customer",
    detail: "the customer has been active in the last 30 days",
  },
};
const SCORE_FACTOR_ORDER = [
  "PREVIOUS_SUCCESSFUL_PAYMENTS",
  "RETRYABLE_FAILURE",
  "WITHIN_RECOVERY_WINDOW",
  "ACTIVE_CUSTOMER",
];

// Root-cause categories from models/RecoveryCase.js ROOT_CAUSE_CATEGORIES.
const ROOT_CAUSE_FACTOR = {
  RETRYABLE_PAYMENT_FAILURE: {
    label: "Retryable decline",
    detail: "a gateway or network-type failure",
  },
  CUSTOMER_PAYMENT_METHOD_ISSUE: {
    label: "Payment-method issue",
    detail: "an expired card or insufficient funds — recoverable with a fresh attempt",
  },
  NON_RETRYABLE_PAYMENT_FAILURE: {
    label: "Non-retryable decline",
    detail: "the bank declined in a way that will not clear on a retry",
  },
  CUSTOMER_DECLINED: {
    label: "Customer declined",
    detail: "the customer actively declined the charge",
  },
  CHECKOUT_ABANDONMENT: {
    label: "Checkout abandoned",
    detail: "the customer left before completing payment",
  },
  UNKNOWN: {
    label: "Unclear cause",
    detail: "the failure reason did not map to a known category",
  },
};

const PROPOSED_PHRASE = {
  CREATE_PAYMENT_LINK: "a payment link",
  START_VOICE_RECOVERY: "a voice recovery call",
  STOP: "no further contact",
};

function inr(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function proposedLabel(intervention) {
  if (intervention === "CREATE_PAYMENT_LINK") return "Payment link";
  if (intervention === "START_VOICE_RECOVERY") return "Voice recovery call";
  if (intervention === "STOP") return "No further contact";
  return null;
}
function proposedInline(intervention) {
  return PROPOSED_PHRASE[intervention] || "a recovery action";
}

/**
 * @param {object} args
 * @param {object} args.recoveryCase  a case that has been through eligibility (and usually
 *                                    scoring + policy) — reads rootCause, recoveryProbability,
 *                                    reasonCodes, selectedIntervention, policyDecision, amount
 * @param {object} args.policy        merchant.policy — reads maxAutonomousAmount,
 *                                    maxRecoveryAttempts, recoveryWindowHours
 * @returns {{headline: string, proposed: string|null, outcome: string, factors: {label: string, detail: string}[]}|null}
 *          null when the case has not been evaluated far enough to explain.
 */
export function explainRecoveryDecision({ recoveryCase, policy }) {
  const rc = recoveryCase || {};
  if (!rc.policyDecision) return null;

  const pol = policy || {};
  const decision = rc.policyDecision;
  const intervention = rc.selectedIntervention || null;

  // --- factor list (strongest first) --------------------------------------------------------
  const factors = [];
  for (const code of SCORE_FACTOR_ORDER) {
    if (Array.isArray(rc.reasonCodes) && rc.reasonCodes.includes(code)) {
      factors.push({ ...SCORE_FACTORS[code] });
    }
  }
  if (rc.rootCause && ROOT_CAUSE_FACTOR[rc.rootCause]) {
    factors.push({ ...ROOT_CAUSE_FACTOR[rc.rootCause] });
  }
  if (typeof rc.recoveryProbability === "number") {
    factors.push({
      label: `${Math.round(rc.recoveryProbability * 100)}% recovery probability`,
      detail:
        "PayRevive's weighted score across payment history, failure type, recency and customer activity",
    });
  }

  const topDetail = factors.length > 0 ? factors[0].detail : null;
  const proposed = proposedLabel(intervention);

  // --- outcome + headline, keyed on the deterministic policy reason code -------------------
  let outcome;
  let headline;

  switch (decision) {
    case "APPROVED":
      if (intervention === "STOP") {
        outcome = "Stopped — no viable recovery";
        headline = rc.rootCause
          ? `The failure looks unrecoverable (${ROOT_CAUSE_FACTOR[rc.rootCause]?.detail || "no clear signal"}), so PayRevive is not contacting the customer.`
          : "PayRevive found no viable recovery path and is not contacting the customer.";
      } else {
        outcome = "Queued for your approval";
        headline = topDetail
          ? `Because ${topDetail}, PayRevive proposed ${proposedInline(intervention)} and is waiting for your one-click approval.`
          : `PayRevive proposed ${proposedInline(intervention)} and is waiting for your one-click approval.`;
      }
      break;

    case "HIGH_VALUE_REQUIRES_REVIEW":
      outcome = "Escalated for your review";
      headline = `PayRevive would have sent ${proposedInline(intervention)}, but this ${inr(rc.amount)} charge is above your ${inr(pol.maxAutonomousAmount)} autonomous limit, so it was escalated for you to decide.`;
      break;

    case "RECOVERY_WINDOW_EXPIRED":
      outcome = "Expired — outside the recovery window";
      headline = `This failure is older than your ${pol.recoveryWindowHours}-hour recovery window, so PayRevive closed the case without contacting the customer.`;
      break;

    case "RETRY_LIMIT_REACHED":
      outcome = "Stopped — retry limit reached";
      headline = `PayRevive has already used the ${pol.maxRecoveryAttempts} recovery attempts your policy allows, so it stopped.`;
      break;

    case "OPT_OUT_BEHAVIOR":
      outcome = "Stopped — customer opted out";
      headline =
        "This customer has opted out of recovery contact, so PayRevive stopped immediately — an opt-out always overrides every other factor.";
      break;

    case "MAX_VOICE_ATTEMPTS_REACHED":
      outcome = "Voice blocked — attempt limit reached";
      headline =
        "PayRevive proposed a voice call, but this case has already used your per-case voice-attempt limit, so no call was placed.";
      break;

    default:
      outcome = decision;
      headline = `PayRevive's policy engine returned ${decision}.`;
  }

  return { headline, proposed, outcome, factors };
}
