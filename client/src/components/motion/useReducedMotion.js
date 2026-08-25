import { useEffect, useState } from "react";

// Single source of truth for "does this visitor want motion turned down" — every primitive in
// this folder reads this instead of re-querying matchMedia itself, and the "reduced" branch of
// each primitive renders content immediately/statically rather than skipping it, so nothing
// ever depends on an animation completing to become visible.
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}
