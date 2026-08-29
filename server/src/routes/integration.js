// ARCHITECTURE.md § Inbound payment-failure webhook (connected merchants). Issues and rotates
// the per-merchant Razorpay webhook credential (models/Merchant.js `integration.razorpay`) that
// routes/webhooks.js's POST /api/webhooks/razorpay/inbound/:webhookId verifies against. This is
// the code-free integration path: a business copies the URL + signing secret shown here into
// their Razorpay Dashboard → Settings → Webhooks and failed payments start flowing into the
// same recovery pipeline the demo "Simulate Payment Failure" control uses.
//
// Route shape mirrors routes/policy.js (requireAuth, a local rate limiter, writeAuditLog). No
// recovery/policy decision logic lives here.

import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { NotFoundError } from "../lib/errors.js";
import { Merchant } from "../models/index.js";
import { writeAuditLog } from "../audit/auditLogger.js";

export const integrationRouter = Router();

integrationRouter.use(requireAuth);

// Per-IP cap on this merchant-scoped, authenticated settings surface (view URL / reveal own
// secret / rotate). It's DoS/abuse bounding, not anti-brute-force: /reveal only ever returns
// the *caller's own* secret, so there is nothing across-tenant to guess. Kept generous enough
// that a merchant clicking through setup — and the provision→reveal→rotate→verify test path —
// never trips it.
const integrationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many integration requests. Please try again shortly.",
});

// The Razorpay events a merchant is told to subscribe this endpoint to. Only payment.failed is
// consumed today (routes/webhooks.js) — link-outcome events stay on the platform route.
const INBOUND_EVENTS = ["payment.failed"];

const newWebhookId = () => `wh_${crypto.randomBytes(12).toString("hex")}`;
const newWebhookSecret = () => crypto.randomBytes(32).toString("hex");

// Build the public webhook URL for THIS deployment from the incoming request, so the value
// shown in the dashboard is copy-paste-correct on localhost, Render, etc.
function inboundWebhookUrl(req, webhookId) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  return `${proto}://${req.get("host")}/api/webhooks/razorpay/inbound/${webhookId}`;
}

// The real signing secret is NEVER placed in a serialized response — not GET, not regenerate.
// `webhookSecret` here is a fixed-length mask (never the real length either); the literal value
// is available only via POST /reveal, on an explicit authenticated request.
const SECRET_MASK = "•".repeat(16);

function serialize(req, merchant) {
  const rz = merchant.integration?.razorpay || {};
  return {
    webhookId: rz.webhookId,
    webhookUrl: rz.webhookId ? inboundWebhookUrl(req, rz.webhookId) : null,
    hasWebhookSecret: Boolean(rz.webhookSecret),
    webhookSecret: rz.webhookSecret ? SECRET_MASK : null,
    provisionedAt: rz.provisionedAt || null,
    rotatedAt: rz.rotatedAt || null,
    events: INBOUND_EVENTS,
  };
}

// GET /api/merchant/integration — the merchant's Razorpay webhook endpoint, provisioned on
// first access. The signing secret is NOT returned here (only `hasWebhookSecret` + a mask); the
// owning merchant fetches the literal value with POST /reveal when they intentionally ask.
integrationRouter.get("/", integrationRateLimiter, async (req, res, next) => {
  try {
    const merchant = await Merchant.findById(req.merchant.id).select(
      "+integration.razorpay.webhookSecret"
    );
    if (!merchant) {
      next(new NotFoundError("Merchant not found"));
      return;
    }

    const rz = merchant.integration?.razorpay;
    if (!rz?.webhookId || !rz?.webhookSecret) {
      merchant.integration.razorpay = {
        webhookId: newWebhookId(),
        webhookSecret: newWebhookSecret(),
        provisionedAt: new Date(),
        rotatedAt: null,
      };
      await merchant.save();
      await writeAuditLog({
        merchantId: merchant._id,
        actor: "MERCHANT",
        eventType: "MERCHANT_WEBHOOK_PROVISIONED",
        reason: "razorpay",
        result: "PROVISIONED",
        metadata: { webhookId: merchant.integration.razorpay.webhookId },
      });
    }

    res.status(200).json({ integration: serialize(req, merchant) });
  } catch (err) {
    next(err);
  }
});

// POST /api/merchant/integration/reveal — returns the literal signing secret, and ONLY to the
// authenticated owning merchant, on an explicit request. Identity is taken from the session
// (req.merchant.id set by requireAuth) — never from the request body — so merchant A can only
// ever get merchant A's secret. The value is never in GET/regenerate responses and never
// logged (the audit entry carries only the webhookId).
integrationRouter.post("/reveal", integrationRateLimiter, async (req, res, next) => {
  try {
    const merchant = await Merchant.findById(req.merchant.id).select(
      "+integration.razorpay.webhookSecret"
    );
    const secret = merchant?.integration?.razorpay?.webhookSecret;
    if (!secret) {
      next(new NotFoundError("No webhook secret provisioned"));
      return;
    }

    await writeAuditLog({
      merchantId: merchant._id,
      actor: "MERCHANT",
      eventType: "MERCHANT_WEBHOOK_SECRET_REVEALED",
      reason: "razorpay",
      result: "REVEALED",
      metadata: { webhookId: merchant.integration.razorpay.webhookId },
    });

    res.status(200).json({ webhookSecret: secret });
  } catch (err) {
    next(err);
  }
});

// POST /api/merchant/integration/regenerate — rotates BOTH the webhookId and the signing
// secret. The old URL stops resolving immediately (routes/webhooks.js looks up by webhookId),
// so the merchant must re-paste both values into Razorpay. The response is the same masked
// shape as GET — the new secret is obtained via POST /reveal, like any other.
integrationRouter.post("/regenerate", integrationRateLimiter, async (req, res, next) => {
  try {
    const merchant = await Merchant.findById(req.merchant.id).select(
      "+integration.razorpay.webhookSecret"
    );
    if (!merchant) {
      next(new NotFoundError("Merchant not found"));
      return;
    }

    const previousWebhookId = merchant.integration?.razorpay?.webhookId || null;
    merchant.integration.razorpay = {
      webhookId: newWebhookId(),
      webhookSecret: newWebhookSecret(),
      provisionedAt: merchant.integration?.razorpay?.provisionedAt || new Date(),
      rotatedAt: new Date(),
    };
    await merchant.save();

    await writeAuditLog({
      merchantId: merchant._id,
      actor: "MERCHANT",
      eventType: "MERCHANT_WEBHOOK_SECRET_ROTATED",
      reason: "razorpay",
      result: "ROTATED",
      metadata: { previousWebhookId, webhookId: merchant.integration.razorpay.webhookId },
    });

    res.status(200).json({ integration: serialize(req, merchant) });
  } catch (err) {
    next(err);
  }
});
