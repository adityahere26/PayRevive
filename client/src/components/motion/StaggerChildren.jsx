import { Children, isValidElement } from "react";
import { RevealOnScroll } from "./RevealOnScroll.jsx";

// Wraps each direct child in its own RevealOnScroll with an incrementing delay, so a group
// (a row of capability sections, a grid of numbered steps) reveals as one staggered sequence
// instead of every child popping in at once.
export function StaggerChildren({ children, className = "", itemClassName = "", step = 90, as = "div" }) {
  const kids = Children.toArray(children).filter(isValidElement);
  return (
    <div className={className}>
      {kids.map((child, i) => (
        <RevealOnScroll key={child.key ?? i} delay={i * step} as={as} className={itemClassName}>
          {child}
        </RevealOnScroll>
      ))}
    </div>
  );
}
