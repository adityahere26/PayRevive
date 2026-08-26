import { statusLabel, statusTone } from "../../lib/statusMeta.js";

// The one badge system for the whole product (design system migration — see CLAUDE.md /
// session brief). Every status pill, source tag, and inline label goes through this.

const TONE_STYLES = {
  mint: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15",
  cyan: "bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-600/20",
  slate: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/10",
  brand: "bg-brand-700 text-white",
};

const SIZE_STYLES = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
};

export function Badge({ tone = "slate", size = "md", className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${TONE_STYLES[tone] || TONE_STYLES.slate} ${SIZE_STYLES[size] || SIZE_STYLES.md} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, size = "md" }) {
  return (
    <Badge tone={statusTone(status)} size={size}>
      {statusLabel(status)}
    </Badge>
  );
}
