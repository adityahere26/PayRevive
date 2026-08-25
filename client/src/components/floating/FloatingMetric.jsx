const TONE_DOT = {
  emerald: "bg-emerald-100 text-emerald-600",
  brand: "bg-mint-100 text-brand-700",
  amber: "bg-amber-100 text-amber-600",
};

// Small floating pill carrying one number + label (e.g. "₹82,450 · Recovered"). Used sparingly
// around hero/results sections — always paired with a caller-provided label that makes clear
// when a figure is illustrative rather than a live merchant number (see Landing.jsx).
export function FloatingMetric({ icon, value, label, tone = "emerald", style, delay = 0, className = "" }) {
  return (
    <div
      className={`pr-float pointer-events-none absolute hidden items-center gap-2 rounded-full border border-slate-200/70 bg-white/95 px-3.5 py-2 shadow-card backdrop-blur-sm sm:flex ${className}`}
      style={{ ...style, animationDelay: `${delay}s` }}
    >
      {icon && (
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${TONE_DOT[tone] || TONE_DOT.emerald}`}>
          {icon}
        </span>
      )}
      <span className="text-xs font-semibold text-brand-900">{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
    </div>
  );
}
