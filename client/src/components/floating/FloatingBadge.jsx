const TONE_CLASS = {
  mint: "bg-mint-100 text-brand-800 border-brand-200",
  dark: "bg-white/10 text-mint-100 border-white/20",
  amber: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
};

// Small floating decorative label (e.g. "AI DECISION", "POLICY CHECKED") — text only, no
// hover interaction. Purely atmospheric, so it's aria-hidden.
export function FloatingBadge({ text, tone = "mint", style, delay = 0, className = "" }) {
  return (
    <span
      className={`pr-float pointer-events-none absolute hidden rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-wide backdrop-blur-sm sm:inline-block ${TONE_CLASS[tone] || TONE_CLASS.mint} ${className}`}
      style={{ ...style, animationDelay: `${delay}s` }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
