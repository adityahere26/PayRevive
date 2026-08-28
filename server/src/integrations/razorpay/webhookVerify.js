// Verified against Razorpay's official webhook docs (razorpay.com/docs/webhooks/validate-test/):
// signature arrives in the X-Razorpay-Signature header, computed as
// HMAC-SHA256(raw_request_body, RAZORPAY_WEBHOOK_SECRET), hex-encoded. The body passed here
// MUST be the untouched raw bytes — Razorpay's own docs warn explicitly against parsing/casting
// it first (routes/webhooks.js mounts express.raw() for this reason).
//
// Deliberately NOT using the razorpay-node SDK's own validateWebhookSignature: its reference
// implementation compares digests with plain `===`, which is not constant-time. This uses
// crypto.timingSafeEqual instead — a strict improvement, not a deviation from documented
// behavior (the HMAC computation itself is identical).

import crypto from "node:crypto";

/**
 * @param {Buffer|string} rawBody untouched request body
 * @param {string|undefined} signatureHeader the X-Razorpay-Signature header value
 * @param {string} secret RAZORPAY_WEBHOOK_SECRET
 * @returns {boolean}
 */
export function verifyRazorpaySignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;

  const expectedHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "utf8");
  const providedBuf = Buffer.from(String(signatureHeader), "utf8");

  // timingSafeEqual throws on length mismatch rather than returning false — check first.
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * The inverse of verifyRazorpaySignature — computes the header value Razorpay would send for a
 * given raw body. Used ONLY by the DEV/DEMO test-payment helper (server/src/services/
 * demoTestPayment.js), which acts as Razorpay's servers would after a Test Mode payment: it
 * builds a payment_link.paid event, signs it here, and delivers it to the real
 * /api/webhooks/razorpay route so signature verification, cross-checks and idempotency all
 * still run. Never used to bypass verification.
 *
 * @param {Buffer|string} rawBody
 * @param {string} secret RAZORPAY_WEBHOOK_SECRET
 * @returns {string} hex HMAC-SHA256
 */
export function signRazorpayWebhookBody(rawBody, secret) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}
