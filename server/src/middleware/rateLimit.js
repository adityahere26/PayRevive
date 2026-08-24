// SECURITY.md § Rate limiting. A small factory rather than one hardcoded limiter, so the
// same behavior can be re-used for the other sensitive routes ARCHITECTURE.md/SECURITY.md
// call out (payment-link creation, voice-intent, evaluation/run) as they're built in later
// phases, and so tests can instantiate a limiter with tiny numbers instead of exhausting a
// production-sized one.

import rateLimit from "express-rate-limit";
import { RateLimitedError } from "../lib/errors.js";

export function createRateLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new RateLimitedError(message));
    },
  });
}

// SECURITY.md § Rate limiting table: unauthenticated token-minting endpoint, limited per-IP.
export const demoAuthRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many demo login attempts. Please try again later.",
});

// SECURITY.md § Rate limiting table doesn't name this route directly (it's a Day 3 addition),
// but it creates payment/customer/recovery-case records same as any state-changing route the
// table does cover — generous but present, consistent with the table's own rationale.
export const paymentFailureRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many simulated payment failures. Please try again later.",
});

// Analogous to SECURITY.md's `/execute` entry ("prevents unlimited recovery-action
// triggering") — /evaluate and /simulate-action are this phase's equivalent of that route.
export const recoveryCaseActionRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: "Too many recovery-case action requests. Please try again later.",
});
