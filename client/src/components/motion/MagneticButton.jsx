import { useRef, useState } from "react";
import { usePrefersReducedMotion } from "./useReducedMotion.js";

// Subtle "magnetic" hover: the element drifts a few pixels toward the cursor within its own
// bounds, then eases back to rest on mouseleave. `as` lets it wrap a <button>, an <a>, or a
// react-router <Link> without a second wrapper element.
export function MagneticButton({ children, className = "", strength = 10, as: Tag = "button", ...props }) {
  const ref = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const reduced = usePrefersReducedMotion();

  function handleMouseMove(e) {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const relY = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    setOffset({ x: relX * strength, y: relY * strength });
  }
  function handleMouseLeave() {
    setOffset({ x: 0, y: 0 });
  }

  return (
    <Tag
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`inline-flex will-change-transform ${reduced ? "" : "transition-transform duration-200 ease-out"} ${className}`}
      style={reduced ? undefined : { transform: `translate(${offset.x}px, ${offset.y}px)` }}
      {...props}
    >
      {children}
    </Tag>
  );
}
