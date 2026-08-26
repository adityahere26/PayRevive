// Small uppercase mono label used above nearly every section heading on the public site — one
// place that owns its two tone variants (light section vs. dark section) instead of every
// page re-deriving the same styling. Editorial treatment: no pill chrome, just a small accent
// dot and tracked-out monospace text, echoing the reference's understated section labels.
export function Eyebrow({ children, tone = "light", className = "" }) {
  const toneClass = tone === "dark" ? "text-white/60" : "text-brand-500";
  const dotClass = tone === "dark" ? "bg-white" : "bg-brand-950";
  return (
    <span className={`label-mono inline-flex items-center gap-2 text-[11px] font-medium uppercase ${toneClass} ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
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
