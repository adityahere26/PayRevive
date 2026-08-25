import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./useReducedMotion.js";

// Subtle cursor-driven drift for decorative elements. `depth` scales how far an element moves
// relative to the pointer — a higher depth reads as "closer" (moves more), a lower depth as
// "further back" (moves less) — so a handful of these at different depths feel layered rather
// than moving in lockstep. rAF-throttled to one pending frame at a time.
export function ParallaxElement({ children, depth = 16, className = "", style = {} }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const reduced = usePrefersReducedMotion();
  const frame = useRef(null);

  useEffect(() => {
    if (reduced) return undefined;
    function handleMove(e) {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        const nx = (e.clientX / window.innerWidth - 0.5) * depth;
        const ny = (e.clientY / window.innerHeight - 0.5) * depth;
        setPos({ x: nx, y: ny });
        frame.current = null;
      });
    }
    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [reduced, depth]);

  return (
    <div
      className={`will-change-transform ${reduced ? "" : "transition-transform duration-300 ease-out"} ${className}`}
      style={{ ...style, transform: reduced ? style.transform : `translate(${pos.x}px, ${pos.y}px)` }}
    >
      {children}
    </div>
  );
}
