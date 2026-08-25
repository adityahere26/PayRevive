// Small uppercase label used above nearly every section heading on the public site — one
// place that owns its two tone variants (light section vs. dark section) instead of every
// page re-deriving the same pill styling.
export function Eyebrow({ children, tone = "light", className = "" }) {
  const toneClass = tone === "dark" ? "bg-white/10 text-mint-200" : "bg-mint-100 text-brand-700";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-widest ${toneClass} ${className}`}>
      {children}
    </span>
  );
}

// A small "this is illustrative, not live merchant data" tag — reused everywhere the public
// site shows a number or quote that isn't real (RECOVERY_POLICY.md / CLAUDE.md § honesty
// requirement extended to the public site: never let a demo figure read as a real result).
export function DemoTag({ children = "Example", className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 ${className}`}>
      {children}
    </span>
  );
}
