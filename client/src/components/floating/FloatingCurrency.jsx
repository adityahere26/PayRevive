import { ParallaxElement } from "../motion/ParallaxElement.jsx";

// One decorative floating currency glyph — combines the continuous float keyframe with
// cursor-parallax depth so a cluster of these reads as a loose, layered composition rather
// than identical elements moving in sync. Always decorative: never implies a currency picker
// or multi-currency support (INR stays the product's only real currency — see lib/format.js).
//
// `circle` wraps the glyph in a bordered/filled circle (the reference's "currency circle"
// motif) instead of a bare glyph — used for the smaller, more deliberate accents; bare glyphs
// stay for the large, very-low-opacity background-scale marks. `coin` goes further — a
// gradient-filled 3D-style disc with a rim highlight and its own slow spin (brief §4 "COINS"),
// for the handful of accents meant to read as physical objects rather than typographic marks.
const COIN_GRADIENT = {
  primary: "radial-gradient(circle at 32% 28%, #8bbb92 0%, #2a835f 55%, #12544f 100%)",
  secondary: "radial-gradient(circle at 32% 28%, #cfe9d7 0%, #8bbb92 45%, #2a835f 100%)",
  deep: "radial-gradient(circle at 32% 28%, #2a835f 0%, #12544f 55%, #092328 100%)",
};

// `drift` swaps the base positional keyframe (index.css) — "float" (default) is the original
// vertical bob; the rest give a cluster of these varied, non-synchronized movement so a whole
// field of coins (FloatingCoinField) doesn't read as one thing copy-pasted.
const DRIFT_CLASS = {
  float: "pr-float",
  "diagonal-a": "pr-drift-diagonal-a",
  "diagonal-b": "pr-drift-diagonal-b",
  horizontal: "pr-drift-horizontal",
  "up-fade": "pr-drift-up-fade",
};

export function FloatingCurrency({
  symbol = "₹",
  size = "text-4xl",
  tone = "text-white/20",
  className = "",
  style = {},
  depth = 8,
  floatSpeed = 7,
  floatDelay = 0,
  circle = false,
  circleClassName = "",
  coin = false,
  coinTone = "primary",
  drift = "float",
}) {
  const driftClass = DRIFT_CLASS[drift] || DRIFT_CLASS.float;
  if (coin) {
    return (
      <ParallaxElement depth={depth} className={`pointer-events-none absolute select-none ${className}`} style={style}>
        <span
          className={`${driftClass} pr-coin relative flex aspect-square items-center justify-center rounded-full font-bold text-white shadow-[0_14px_28px_-8px_rgba(9,35,40,0.5)] ring-1 ring-white/25 ${size}`}
          style={{
            background: COIN_GRADIENT[coinTone] || COIN_GRADIENT.primary,
            animationDuration: `${floatSpeed}s`,
            animationDelay: `${floatDelay}s`,
          }}
          aria-hidden="true"
        >
          <span className="pointer-events-none absolute inset-1 rounded-full border border-white/20" />
          <span className="pointer-events-none absolute left-[22%] top-[18%] h-[22%] w-[22%] rounded-full bg-white/40 blur-[2px]" />
          <span className="relative">{symbol}</span>
        </span>
      </ParallaxElement>
    );
  }
  return (
    <ParallaxElement depth={depth} className={`pointer-events-none absolute select-none ${className}`} style={style}>
      {circle ? (
        <span
          className={`${driftClass} flex aspect-square items-center justify-center rounded-full border font-semibold ${size} ${tone} ${circleClassName}`}
          style={{ animationDuration: `${floatSpeed}s`, animationDelay: `${floatDelay}s` }}
          aria-hidden="true"
        >
          {symbol}
        </span>
      ) : (
        <span
          className={`${driftClass} block font-semibold ${size} ${tone}`}
          style={{ animationDuration: `${floatSpeed}s`, animationDelay: `${floatDelay}s` }}
          aria-hidden="true"
        >
          {symbol}
        </span>
      )}
    </ParallaxElement>
  );
}
