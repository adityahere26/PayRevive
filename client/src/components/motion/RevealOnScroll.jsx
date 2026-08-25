import { forwardRef, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./useReducedMotion.js";

// Fades + lifts children into place the first time they scroll into view (IntersectionObserver,
// no scroll-listener polling). An element already in the viewport at mount (e.g. above-the-fold
// hero content) reveals almost immediately, which is what gives the hero its on-load entrance —
// no separate "page load" animation system needed.
//
// prefers-reduced-motion: renders fully visible with no transition at all, never a skipped/
// stuck-invisible element.
export const RevealOnScroll = forwardRef(function RevealOnScroll(
  { children, className = "", delay = 0, as: Tag = "div", once = true, ...rest },
  forwardedRef
) {
  const localRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return undefined;
    }
    const el = localRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.unobserve(el);
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, once]);

  return (
    <Tag
      ref={(node) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      className={`${reduced ? "" : "transition-all duration-700 ease-out"} ${
        visible || reduced ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      } ${className}`}
      style={!reduced && delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
});

// Same primitive, named for how it reads at call sites that just want "fade this up in" — no
// behavioral difference from RevealOnScroll.
export const FadeUp = RevealOnScroll;
