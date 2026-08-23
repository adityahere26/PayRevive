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
