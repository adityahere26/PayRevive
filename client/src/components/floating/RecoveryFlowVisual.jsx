import { RevealOnScroll } from "../motion/RevealOnScroll.jsx";

// The AI-recovery pipeline as animated nodes, not a boring flowchart (brief §11): each stage
// is a small elevated card connected by a gradient thread, revealing in sequence on scroll.
// `tone="dark"` renders the light-on-dark variant for use on a deep-fill section.
const STAGES = [
  { label: "Failed payment", detail: "Detected the moment it happens" },
  { label: "Root cause", detail: "Deterministic diagnosis" },
  { label: "Policy decision", detail: "Checked against merchant rules" },
  { label: "AI intervention", detail: "Gemini recommends, policy approves" },
  { label: "Outcome", detail: "Verified, not assumed" },
];

export function RecoveryFlowVisual({ tone = "light", className = "" }) {
  const dark = tone === "dark";
  return (
    <div className={`relative ${className}`}>
      <div
        className={`pointer-events-none absolute left-4 top-4 bottom-4 w-px sm:left-1/2 ${dark ? "bg-white/15" : "bg-brand-900/10"}`}
        aria-hidden="true"
      />
      <div className="space-y-5">
        {STAGES.map((s, i) => (
          <RevealOnScroll key={s.label} delay={i * 110} className={`flex items-center gap-4 ${i % 2 === 1 ? "sm:flex-row-reverse sm:text-right" : ""}`}>
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                dark ? "bg-accent-light text-brand-950" : "bg-brand-950 text-white"
              }`}
            >
              {i + 1}
            </span>
            <div
              className={`flex-1 rounded-2xl border px-4 py-3 shadow-card ${
                dark ? "border-white/10 bg-white/5 backdrop-blur-sm" : "border-brand-900/10 bg-white"
              }`}
            >
              <div className={`text-sm font-semibold ${dark ? "text-white" : "text-brand-900"}`}>{s.label}</div>
              <div className={`mt-0.5 text-xs ${dark ? "text-white/50" : "text-slate-500"}`}>{s.detail}</div>
            </div>
          </RevealOnScroll>
        ))}
      </div>
    </div>
  );
}
