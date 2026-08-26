import { ParallaxElement } from "../motion/ParallaxElement.jsx";

// One decorative floating currency glyph — combines the continuous float keyframe with
// cursor-parallax depth so a cluster of these reads as a loose, layered composition rather
// than identical elements moving in sync. Always decorative: never implies a currency picker
// or multi-currency support (INR stays the product's only real currency — see lib/format.js).
//
// `circle` wraps the glyph in a bordered/filled circle (the reference's "currency circle"
// motif) instead of a bare glyph — used for the smaller, more deliberate accents; bare glyphs
// stay for the large, very-low-opacity background-scale marks.
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
}) {
  return (
    <ParallaxElement depth={depth} className={`pointer-events-none absolute select-none ${className}`} style={style}>
      {circle ? (
        <span
          className={`pr-float flex aspect-square items-center justify-center rounded-full border font-semibold ${size} ${tone} ${circleClassName}`}
          style={{ animationDuration: `${floatSpeed}s`, animationDelay: `${floatDelay}s` }}
          aria-hidden="true"
        >
          {symbol}
        </span>
      ) : (
        <span
          className={`pr-float block font-semibold ${size} ${tone}`}
          style={{ animationDuration: `${floatSpeed}s`, animationDelay: `${floatDelay}s` }}
          aria-hidden="true"
        >
          {symbol}
        </span>
      )}
    </ParallaxElement>
  );
}
