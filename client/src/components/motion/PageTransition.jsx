import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { usePrefersReducedMotion } from "./useReducedMotion.js";

// Wraps route content and replays a short fade/lift whenever the pathname changes — the one
// piece of "page transition" this product needs, without a routing-transition library.
export function PageTransition({ children }) {
  const location = useLocation();
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [location.pathname]);

  if (reduced) return children;

  return (
    <div
      key={location.pathname}
      className={`transition-all duration-300 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
    >
      {children}
    </div>
  );
}
