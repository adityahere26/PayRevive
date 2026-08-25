// Single source of truth for how a recovery-case status renders everywhere it appears
// (Dashboard, Recovery Cases, Recovery Case Detail, Voice Recovery, Evaluation results). The
// exact status values themselves are the backend's — RECOVERY_CASE_STATUSES in
// server/src/models/RecoveryCase.js — this file only owns their label + badge tone.

export const STATUS_META = {
  RISK_DETECTED: { label: "Risk detected", tone: "amber" },
  ANALYZING: { label: "Analyzing", tone: "cyan" },
  ELIGIBLE: { label: "Eligible", tone: "cyan" },
  ACTION_SELECTED: { label: "Action selected", tone: "cyan" },
  POLICY_APPROVED: { label: "Policy approved", tone: "mint" },
  ACTION_EXECUTED: { label: "Action executed", tone: "cyan" },
  WAITING_OUTCOME: { label: "Awaiting outcome", tone: "cyan" },
  RECOVERED: { label: "Recovered", tone: "mint" },
  FAILED: { label: "Failed", tone: "red" },
  STOPPED: { label: "Stopped", tone: "slate" },
  ESCALATED: { label: "Escalated", tone: "amber" },
  EXPIRED: { label: "Expired", tone: "slate" },
};

export function statusLabel(status) {
  return STATUS_META[status]?.label || status;
}

export function statusTone(status) {
  return STATUS_META[status]?.tone || "slate";
}

// Status-color-adjacent accent for a page-header top bar / hero number, keyed the same way.
export const STATUS_ACCENT_CLASS = {
  RECOVERED: "bg-emerald-500",
  ESCALATED: "bg-amber-500",
  FAILED: "bg-red-500",
  STOPPED: "bg-slate-300",
  EXPIRED: "bg-slate-300",
  POLICY_APPROVED: "bg-brand-500",
  ACTION_EXECUTED: "bg-cyan-500",
  WAITING_OUTCOME: "bg-cyan-500",
};
