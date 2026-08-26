import { ParallaxElement } from "../motion/ParallaxElement.jsx";
import { formatINR } from "../../lib/format.js";

// PayRevive's visual signature (brief §12): one physical card design, three states. Pure
// CSS perspective/rotation/shadow — no image asset. Reused across the hero, the product-story
// section, and the CTA so the same object carries the fail -> recover narrative everywhere it
// appears.
const STATE_STYLE = {
  failed: { label: "PAYMENT FAILED", chip: "bg-amber-400/90 text-brand-950", ring: "ring-amber-300/40" },
  progress: { label: "RECOVERY IN PROGRESS", chip: "bg-white/25 text-white", ring: "ring-white/25" },
  recovered: { label: "PAYMENT RECOVERED", chip: "bg-accent-light text-brand-950", ring: "ring-accent-light/40" },
};

export function PaymentCard3D({
  amount = 2999,
  state = "recovered",
  size = "md",
  rotate = -8,
  className = "",
  style = {},
  depth = 10,
}) {
  const cfg = STATE_STYLE[state] || STATE_STYLE.recovered;
  const dims = size === "lg" ? "h-56 w-96 sm:h-64 sm:w-[26rem]" : size === "sm" ? "h-32 w-56" : "h-44 w-80";

  return (
    <ParallaxElement depth={depth} className={`pr-card-float ${className}`} style={style}>
      <div
        className={`pr-card-tilt ${dims} relative rounded-[1.5rem] p-6 text-white shadow-[0_30px_60px_-15px_rgba(9,35,40,0.45)] ring-1 ${cfg.ring}`}
        style={{
          background: "linear-gradient(135deg, #12544f 0%, #092328 60%, #0c2724 100%)",
          transform: `rotate(${rotate}deg)`,
        }}
      >
        <span className="pr-card-sheen" aria-hidden="true" />
        <div className="flex items-start justify-between">
          <span className="label-mono text-xs font-semibold tracking-[0.2em] text-white/85">PAYREVIVE</span>
          <span className="h-6 w-9 rounded-md bg-gradient-to-br from-accent-light/80 to-accent/60" aria-hidden="true" />
        </div>
        <div className="mt-8 text-3xl font-bold tracking-tight sm:text-4xl">{formatINR(amount)}</div>
        <div className="mt-5 flex items-center justify-between">
          <span className={`label-mono inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide ${cfg.chip}`}>
            {cfg.label}
          </span>
          <span className="label-mono text-[10px] text-white/40">TEST MODE</span>
        </div>
      </div>
    </ParallaxElement>
  );
}
