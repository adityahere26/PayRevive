import { ParallaxElement } from "../motion/ParallaxElement.jsx";

// A stylized stack of currency notes (brief §4 "MONEY STACK") — layered rounded bars with a
// gradient + highlight edge so each "note" reads as slightly raised, not a flat rectangle.
// Decorative only.
const LAYERS = [
  { w: "w-40", bg: "from-brand-900 to-brand-950", edge: "border-white/10" },
  { w: "w-36", bg: "from-secondary to-brand-800", edge: "border-white/10" },
  { w: "w-40", bg: "from-accent to-secondary", edge: "border-white/15" },
  { w: "w-36", bg: "from-accent-light to-accent", edge: "border-white/20" },
];

export function MoneyStack({ className = "", style = {}, depth = 12 }) {
  return (
    <ParallaxElement depth={depth} className={`pr-float pointer-events-none absolute select-none ${className}`} style={{ animationDuration: "8s", ...style }}>
      <div className="relative h-24 w-40" aria-hidden="true">
        {LAYERS.map((l, i) => (
          <div
            key={i}
            className={`absolute left-1/2 h-8 ${l.w} -translate-x-1/2 rounded-lg border bg-gradient-to-r ${l.bg} ${l.edge} shadow-[0_8px_16px_-6px_rgba(9,35,40,0.35)]`}
            style={{ bottom: `${i * 9}px`, transform: `translateX(-50%) rotate(${(i % 2 === 0 ? -1 : 1) * (2 + i)}deg)` }}
          >
            <span className="absolute inset-x-3 top-1.5 h-px bg-white/25" />
          </div>
        ))}
      </div>
    </ParallaxElement>
  );
}
