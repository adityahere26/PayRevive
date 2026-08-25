// Single-hue magnitude bar (this group's revenue/count share vs. the largest group in the
// same breakdown). A second measure (e.g. recovery rate) is carried in the label text rather
// than a second overlapping bar (dataviz skill § avoid dual-encoding a single mark without a
// legend). Shared by Dashboard's live breakdowns and Evaluation's synthetic breakdowns so
// both render identically.

export function MagnitudeBar({ title, value, hint, widthPct, tone = "brand" }) {
  const TONE_BAR = {
    brand: "bg-brand-600",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    slate: "bg-slate-400",
  };
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-brand-900">{title}</span>
        <span className="text-slate-400">
          {value}
          {hint && <> · {hint}</>}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-mint-100">
        <div
          className={`h-full rounded-full ${TONE_BAR[tone] || TONE_BAR.brand}`}
          style={{ width: `${Math.max(2, Math.min(100, widthPct))}%` }}
        />
      </div>
    </div>
  );
}
