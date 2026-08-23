// Platform-level collection (no merchantId) — see ARCHITECTURE.md § Database schema. The
// unique index on eventId is what makes webhook processing idempotent: a duplicate insert
// throws, and the webhook handler (built in a later phase) treats that as ALREADY_PROCESSED
// rather than reprocessing. Stores a payload hash, never the raw sensitive payload — see
// SECURITY.md § Webhook security.

import mongoose from "mongoose";

const { Schema } = mongoose;

const webhookEventSchema = new Schema({
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  receivedAt: { type: Date, default: Date.now },
  processedAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ["RECEIVED", "PROCESSED", "ALREADY_PROCESSED", "FAILED"],
    default: "RECEIVED",
  },
  payloadHash: { type: String, default: null },
  processingError: { type: String, default: null },
});

export const WebhookEvent = mongoose.model("WebhookEvent", webhookEventSchema);
