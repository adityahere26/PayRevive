import { usePrefersReducedMotion } from "./useReducedMotion.js";

// Seamless horizontal marquee: content is rendered twice back-to-back and the whole track
// animates translateX(-50%) in a loop, so as the first copy scrolls fully offscreen the second
// is sitting in exactly the position the first started in — no visible seam or reset jump.
//
// Purely decorative repeated text (a strip of taglines) — aria-hidden so screen readers don't
// read a duplicated, order-scrambled stream of the same words.
export function Marquee({ children, speed = 28, className = "", trackClassName = "" }) {
  const reduced = usePrefersReducedMotion();
  return (
    <div className={`overflow-hidden ${className}`} aria-hidden="true">
      <div
        className={`flex w-max items-center ${reduced ? "" : "pr-marquee-track"}`}
        style={reduced ? undefined : { animationDuration: `${speed}s` }}
      >
        <div className={`flex items-center ${trackClassName}`}>{children}</div>
        <div className={`flex items-center ${trackClassName}`}>{children}</div>
      </div>
    </div>
  );
}
