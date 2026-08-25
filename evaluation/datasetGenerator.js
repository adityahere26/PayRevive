// EVALUATION.md § Synthetic dataset. A seeded, deterministic generator — same seed + count
// always produces the same dataset (mulberry32, no external dependency, per CLAUDE.md §
// Deterministic randomness). No real customer data: names are drawn from a small synthetic
// pool, not sourced from any real record.
//
// Each archetype below corresponds to a case shape EVALUATION.md's dataset section calls out
// (retryable/non-retryable failures, checkout abandonment, repeat vs first-time customers,
// high/low value, opted-out customers, escalation/stop/expiry cases, ambiguous cases). The
// first pass through the dataset guarantees every archetype appears at least once; any
// remaining cases (when count > archetype count) are filled by a weighted random pick from
// the same seeded rng, so the mix is reproducible but not rigidly round-robin.

import { mulberry32, seedFromString } from "../server/src/lib/prng.js";

const FIRST_NAMES = [
  "Priya", "Rahul", "Ananya", "Vikram", "Sneha", "Arjun", "Kavya", "Rohan",
  "Divya", "Karthik", "Meera", "Aditya", "Pooja", "Suresh", "Neha", "Amit",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Iyer", "Nair", "Reddy", "Gupta", "Menon", "Rao",
  "Kapoor", "Joshi", "Singh", "Patel",
];

const RETRYABLE_REASONS = ["insufficient_funds", "authentication_failed", "gateway_error", "network_error"];
const NON_RETRYABLE_REASONS = ["bank_declined", "card_declined", "fraud_suspected"];
const METHOD_ISSUE_REASONS = ["card_expired", "invalid_upi_pin"];
const DECLINED_REASONS = ["customer_cancelled", "payment_cancelled"];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function range(rng, min, max) {
  return min + rng() * (max - min);
}

function syntheticName(rng) {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

function daysAgo(rng, min, max) {
  return new Date(Date.now() - range(rng, min, max) * 24 * 60 * 60 * 1000);
}

const ARCHETYPES = [
  {
    id: "RETRYABLE_FIRST_TIME",
    label: "Retryable failure — first-time customer",
    build(rng) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(range(rng, 300, 15000)),
        failureReason: pick(rng, RETRYABLE_REASONS),
        optedOut: false,
        attemptsAtStart: 0,
        createdAtOffsetHours: range(rng, 0, 4),
        history: { prevSuccessfulPayments: 0, prevFailedPayments: 0, lastActivityAt: null, priorRecoverySuccessRate: null },
      };
    },
  },
  {
    id: "RETRYABLE_LOYAL_REPEAT",
    label: "Retryable failure — loyal repeat customer",
    build(rng) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(range(rng, 500, 20000)),
        failureReason: pick(rng, RETRYABLE_REASONS),
        optedOut: false,
        attemptsAtStart: 0,
        createdAtOffsetHours: range(rng, 0, 6),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 5, 20)),
          prevFailedPayments: Math.round(range(rng, 0, 2)),
          lastActivityAt: daysAgo(rng, 1, 10),
          priorRecoverySuccessRate: range(rng, 0.7, 1),
        },
      };
    },
  },
  {
    id: "NON_RETRYABLE",
    label: "Non-retryable bank/fraud decline",
    build(rng) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(range(rng, 500, 30000)),
        failureReason: pick(rng, NON_RETRYABLE_REASONS),
        optedOut: false,
        attemptsAtStart: 0,
        createdAtOffsetHours: range(rng, 0, 8),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 0, 3)),
          prevFailedPayments: Math.round(range(rng, 0, 3)),
          lastActivityAt: null,
          priorRecoverySuccessRate: null,
        },
      };
    },
  },
  {
    id: "CUSTOMER_DECLINED",
    label: "Customer actively cancelled",
    build(rng) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(range(rng, 300, 10000)),
        failureReason: pick(rng, DECLINED_REASONS),
        optedOut: false,
        attemptsAtStart: 0,
        createdAtOffsetHours: range(rng, 0, 5),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 0, 5)),
          prevFailedPayments: 0,
          lastActivityAt: null,
          priorRecoverySuccessRate: null,
        },
      };
    },
  },
  {
    id: "PAYMENT_METHOD_ISSUE",
    label: "Card/UPI method needs updating",
    build(rng) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(range(rng, 500, 15000)),
        failureReason: pick(rng, METHOD_ISSUE_REASONS),
        optedOut: false,
        attemptsAtStart: 0,
        createdAtOffsetHours: range(rng, 0, 6),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 1, 10)),
          prevFailedPayments: Math.round(range(rng, 0, 2)),
          lastActivityAt: daysAgo(rng, 1, 20),
          priorRecoverySuccessRate: range(rng, 0.3, 0.8),
        },
      };
    },
  },
  {
    id: "CHECKOUT_ABANDONMENT",
    label: "Checkout abandoned before payment",
    build(rng) {
      return {
        sourceType: "CHECKOUT_ABANDONMENT",
        amount: Math.round(range(rng, 500, 12000)),
        failureReason: null,
        presetRootCause: "CHECKOUT_ABANDONMENT",
        optedOut: false,
        attemptsAtStart: 0,
        createdAtOffsetHours: range(rng, 0, 10),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 0, 6)),
          prevFailedPayments: Math.round(range(rng, 0, 2)),
          lastActivityAt: daysAgo(rng, 1, 15),
          priorRecoverySuccessRate: range(rng, 0.3, 0.7),
        },
      };
    },
  },
  {
    id: "HIGH_VALUE",
    label: "High-value payment (requires review)",
    build(rng, policy) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(policy.maxAutonomousAmount + range(rng, 1000, 50000)),
        failureReason: pick(rng, RETRYABLE_REASONS),
        optedOut: false,
        attemptsAtStart: 0,
        createdAtOffsetHours: range(rng, 0, 4),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 0, 10)),
          prevFailedPayments: 0,
          lastActivityAt: null,
          priorRecoverySuccessRate: range(rng, 0.4, 0.9),
        },
      };
    },
  },
  {
    id: "OPTED_OUT",
    label: "Customer opted out of contact",
    build(rng) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(range(rng, 500, 20000)),
        failureReason: pick(rng, RETRYABLE_REASONS),
        optedOut: true,
        attemptsAtStart: 0,
        createdAtOffsetHours: range(rng, 0, 4),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 0, 10)),
          prevFailedPayments: 0,
          lastActivityAt: null,
          priorRecoverySuccessRate: null,
        },
      };
    },
  },
  {
    id: "WINDOW_EXPIRED",
    label: "Recovery window already expired",
    build(rng, policy) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(range(rng, 500, 15000)),
        failureReason: pick(rng, RETRYABLE_REASONS),
        optedOut: false,
        attemptsAtStart: 0,
        // Past the recovery window entirely, so the case is created already-expired.
        createdAtOffsetHours: policy.recoveryWindowHours + range(rng, 1, 48),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 0, 5)),
          prevFailedPayments: 0,
          lastActivityAt: null,
          priorRecoverySuccessRate: null,
        },
      };
    },
  },
  {
    id: "ATTEMPT_LIMIT_REACHED",
    label: "Retry limit already reached",
    build(rng, policy) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(range(rng, 500, 15000)),
        failureReason: pick(rng, RETRYABLE_REASONS),
        optedOut: false,
        attemptsAtStart: policy.maxRecoveryAttempts,
        createdAtOffsetHours: range(rng, 0, 6),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 0, 5)),
          prevFailedPayments: Math.round(range(rng, 0, 3)),
          lastActivityAt: null,
          priorRecoverySuccessRate: range(rng, 0.2, 0.6),
        },
      };
    },
  },
  {
    id: "AMBIGUOUS",
    label: "Ambiguous — no clear failure signal",
    build(rng) {
      return {
        sourceType: "PAYMENT_FAILURE",
        amount: Math.round(range(rng, 500, 15000)),
        failureReason: null,
        optedOut: false,
        attemptsAtStart: 0,
        createdAtOffsetHours: range(rng, 10, 40),
        history: {
          prevSuccessfulPayments: Math.round(range(rng, 0, 3)),
          prevFailedPayments: Math.round(range(rng, 0, 3)),
          lastActivityAt: null,
          priorRecoverySuccessRate: null,
        },
      };
    },
  },
];

/**
 * @param {{seed: number, count: number, policy: object}} args
 * @returns {Array<object>} plain synthetic case seeds — not yet run through the pipeline
 */
export function generateSyntheticCases({ seed, count, policy }) {
  const rng = mulberry32(seedFromString(`payrevive-eval:${seed}`));
  const cases = [];

  for (let i = 0; i < count; i++) {
    const archetype =
      i < ARCHETYPES.length ? ARCHETYPES[i] : ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
    const built = archetype.build(rng, policy);
    cases.push({
      index: i,
      archetypeId: archetype.id,
      archetypeLabel: archetype.label,
      customerName: syntheticName(rng),
      ...built,
    });
  }

  return cases;
}
