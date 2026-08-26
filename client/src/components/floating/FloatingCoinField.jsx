import { FloatingCurrency } from "./FloatingCurrency.jsx";

// A full-bleed background field of drifting currency coins (brief: "What recovery feels
// like" section) — purely atmospheric depth behind the section's real content, never a
// literal illustration. Sits absolutely inside a `position: relative` section as the FIRST
// child (see Landing.jsx), so later, non-positioned/relative siblings paint above it without
// needing an explicit z-index — the same DOM-order stacking convention already used for every
// other decorative overlay on this page.
//
// Density/visibility is handled entirely with Tailwind responsive display classes (no JS
// viewport detection) — a fixed superset of coins is defined once, and a subset is hidden
// below md/lg so mobile shows a handful, tablet shows more, desktop shows the full field.
// Reduced-motion is handled per-instance by FloatingCurrency/index.css, not here — coins never
// unmount, they just stop moving.
const COINS = [
  // Distant, larger, softly blurred — background depth layer.
  { symbol: "₹", size: "text-6xl", coinTone: "primary", drift: "diagonal-a", floatSpeed: 15, floatDelay: 0, depth: 5, style: { top: "6%", left: "6%" }, extra: "opacity-35 blur-[2px]" },
  { symbol: "₹", size: "text-5xl", coinTone: "deep", drift: "diagonal-b", floatSpeed: 17, floatDelay: 1.2, depth: 4, style: { bottom: "10%", right: "8%" }, extra: "opacity-30 blur-[2px] hidden sm:block" },
  { symbol: "$", size: "text-5xl", coinTone: "secondary", drift: "horizontal", floatSpeed: 16, floatDelay: 0.6, depth: 6, style: { top: "14%", right: "16%" }, extra: "opacity-30 blur-[1.5px] hidden md:block" },

  // Mid-depth, medium size, mostly sharp.
  { symbol: "₹", size: "text-3xl", coinTone: "primary", drift: "up-fade", floatSpeed: 9, floatDelay: 0.4, depth: 12, style: { top: "34%", left: "16%" }, extra: "opacity-70 hidden sm:block" },
  { symbol: "€", size: "text-2xl", coinTone: "secondary", drift: "diagonal-a", floatSpeed: 11, floatDelay: 1.6, depth: 14, style: { top: "58%", left: "8%" }, extra: "opacity-70" },
  { symbol: "£", size: "text-2xl", coinTone: "deep", drift: "diagonal-b", floatSpeed: 12, floatDelay: 0.9, depth: 10, style: { top: "22%", right: "28%" }, extra: "opacity-70 hidden md:block" },
  { symbol: "₹", size: "text-3xl", coinTone: "secondary", drift: "horizontal", floatSpeed: 10, floatDelay: 2.1, depth: 16, style: { bottom: "22%", right: "20%" }, extra: "opacity-75 hidden sm:block" },

  // Foreground, small, sharp, slightly faster/larger-amplitude drift.
  { symbol: "₹", size: "text-xl", coinTone: "primary", drift: "up-fade", floatSpeed: 7, floatDelay: 0.2, depth: 22, style: { bottom: "14%", left: "22%" }, extra: "" },
  { symbol: "$", size: "text-lg", coinTone: "secondary", drift: "horizontal", floatSpeed: 8, floatDelay: 1.4, depth: 24, style: { top: "68%", right: "10%" }, extra: "hidden lg:block" },
  { symbol: "₹", size: "text-lg", coinTone: "deep", drift: "diagonal-a", floatSpeed: 6.5, floatDelay: 0.8, depth: 26, style: { top: "10%", left: "38%" }, extra: "hidden lg:block" },
  { symbol: "€", size: "text-base", coinTone: "primary", drift: "diagonal-b", floatSpeed: 9.5, floatDelay: 1.9, depth: 20, style: { bottom: "8%", left: "42%" }, extra: "hidden lg:block" },
];

// A pair of very faint curved dotted paths for background depth (brief §6) — static geometry,
// slow stroke-dashoffset creep only (index.css .pr-dash-drift), never traveling particles —
// that treatment is reserved for MoneyTransferAnimation/TransferPath.
function AtmosphericPaths() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 600" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M -50 480 C 250 380, 450 520, 700 380 S 1150 220, 1260 260"
        fill="none"
        stroke="#8bbb92"
        strokeOpacity="0.16"
        strokeWidth="1.5"
        strokeDasharray="2 14"
        strokeLinecap="round"
        className="pr-dash-drift"
      />
      <path
        d="M -50 140 C 200 220, 500 60, 780 180 S 1100 380, 1260 340"
        fill="none"
        stroke="#12544f"
        strokeOpacity="0.14"
        strokeWidth="1.5"
        strokeDasharray="2 16"
        strokeLinecap="round"
        className="pr-dash-drift"
        style={{ animationDelay: "-6s" }}
      />
    </svg>
  );
}

export function FloatingCoinField({ className = "" }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <AtmosphericPaths />
      {COINS.map((c, i) => (
        <FloatingCurrency
          key={i}
          symbol={c.symbol}
          size={c.size}
          coin
          coinTone={c.coinTone}
          drift={c.drift}
          floatSpeed={c.floatSpeed}
          floatDelay={c.floatDelay}
          depth={c.depth}
          style={c.style}
          className={c.extra}
        />
      ))}
    </div>
  );
}
