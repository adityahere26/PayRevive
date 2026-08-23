// See AGENT_DESIGN.md § The ten modules (Audit Logger) and CLAUDE.md core principle #4:
// "If it's not audited, it didn't happen." caseId is optional because a small number of
// future audit events (e.g. merchant policy changes) are merchant-scoped, not case-scoped.

import mongoose from "mongoose";

const { Schema } = mongoose;

const auditLogSchema = new Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  caseId: { type: Schema.Types.ObjectId, ref: "RecoveryCase", default: null, index: true },
  merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
  actor: { type: String, enum: ["SYSTEM", "AI", "MERCHANT", "CUSTOMER"], required: true },
  eventType: { type: String, required: true },
  reason: { type: String, default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
  result: { type: String, default: null },
});

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
