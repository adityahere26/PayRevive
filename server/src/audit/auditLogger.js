// AGENT_DESIGN.md § The ten modules, module 10 — Audit Logger. CLAUDE.md core principle #4:
// "Every state-changing event writes an audit log entry. If it's not audited, it didn't
// happen." The `logger.js` structured-log redaction (secrets/tokens/cards) is a defense-in-
// depth backstop — this module's callers must never pass secret-shaped data into `metadata`
// in the first place (SECURITY.md § Logging / observability).

import { AuditLog } from "../models/index.js";

export async function writeAuditLog({
  merchantId,
  caseId = null,
  actor = "SYSTEM",
  eventType,
  reason = null,
  metadata = {},
  result = null,
}) {
  return AuditLog.create({ merchantId, caseId, actor, eventType, reason, metadata, result });
}

/** Batches the audit entries a single pipeline run produces (orchestrator.js) into one insert. */
export async function writeAuditLogs(entries) {
  if (entries.length === 0) return [];
  return AuditLog.insertMany(entries);
}
