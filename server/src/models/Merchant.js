// See ARCHITECTURE.md § Database schema (merchants) and RECOVERY_POLICY.md § Merchant policy
// fields and MVP defaults for the defaults used below.

import mongoose from "mongoose";

const { Schema } = mongoose;

// ARCHITECTURE.md § Inbound payment-failure webhook (connected merchants). A real business
// connects PayRevive by pasting a per-merchant webhook URL + signing secret into their
// Razorpay Dashboard; `payment.failed` events then arrive at
// POST /api/webhooks/razorpay/inbound/:webhookId and are attributed to this merchant by the
// `webhookId` in the path (never from the payload — CLAUDE.md core principle #3).
//
// `webhookSecret` is a symmetric HMAC-SHA256 key: verification must recompute the same digest
// Razorpay sent, so it is stored as-is (not hashed) and guarded with `select: false` — the
// same posture as any config credential. It is never in GET /api/merchant/integration (which
// returns only `hasWebhookSecret` + a mask); the authenticated owning merchant fetches the
// literal value from POST /api/merchant/integration/reveal on an explicit request.
const razorpayIntegrationSchema = new Schema(
  {
    webhookId: { type: String, default: null }, // public, appears in the webhook URL
    webhookSecret: { type: String, default: null, select: false },
    provisionedAt: { type: Date, default: null },
    rotatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const integrationSchema = new Schema(
  {
    razorpay: { type: razorpayIntegrationSchema, default: () => ({}) },
  },
  { _id: false }
);

const policySchema = new Schema(
  {
    maxRecoveryAttempts: { type: Number, default: 2, min: 0 },
    maxVoiceAttempts: { type: Number, default: 1, min: 0 },
    maxAutonomousAmount: { type: Number, default: 50000, min: 0 },
    recoveryWindowHours: { type: Number, default: 72, min: 1 },
    // Falls back to maxAutonomousAmount when unset — see RECOVERY_POLICY.md.
    escalationAmount: { type: Number, default: null, min: 0 },
    optOutBehavior: { type: String, enum: ["DO_NOT_CONTACT"], default: "DO_NOT_CONTACT" },
    maxContactAttempts: { type: Number, default: 2, min: 0 },
    // AGENT_DESIGN.md § Voice pipeline. Gates whether a voice session can be started at all
    // for this merchant — checked by routes/voice.js before any Gemini call is made. Defaults
    // to true so the Day 3/4 demo merchant (seeded before this field existed) gets voice
    // enabled by default; a merchant can be switched off without disabling recovery entirely.
    voiceEnabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const merchantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Not set for the demo merchant. Required only by the (not-yet-built) real
    // registration flow — enforced there, not at the schema level.
    passwordHash: { type: String, default: null, select: false },
    policy: { type: policySchema, default: () => ({}) },
    // Per-merchant Razorpay connection (webhook URL + signing secret). See
    // razorpayIntegrationSchema above and routes/integration.js.
    integration: { type: integrationSchema, default: () => ({}) },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Resolves an inbound webhook delivery to its merchant (routes/webhooks.js). Partial rather
// than sparse: `webhookId` is stored as `null` on every merchant until they connect a Razorpay
// account, and a plain sparse unique index would treat those many nulls as duplicates — the
// partial filter indexes only merchants that actually have a string webhookId.
merchantSchema.index(
  { "integration.razorpay.webhookId": 1 },
  { unique: true, partialFilterExpression: { "integration.razorpay.webhookId": { $type: "string" } } }
);

export const Merchant = mongoose.model("Merchant", merchantSchema);
