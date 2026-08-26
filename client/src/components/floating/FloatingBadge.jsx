const TONE_CLASS = {
  mint: "bg-mint-100 text-brand-800 border-brand-200",
  // A solid brand-dark chip — the one tone opaque enough to float over either a light or a
  // bounded dark section.
  dark: "bg-primary text-white border-primary/40 shadow-card",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  emerald: "bg-mint-100 text-accent border-accent/25",
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
