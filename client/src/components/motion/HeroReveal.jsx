// Absolute-positioned wrapper that plays a one-shot entrance (pr-hero-in, index.css) around a
// floating decorative component, so the hero's staggered "load" sequence (brief §7) never
// fights that component's own continuous pr-float/pr-card-float/pr-coin transform — the two
// animations live on separate DOM nodes. Position (top/left/etc.) belongs on this wrapper via
// `style`; the child keeps its own size/animation props only.
export function HeroReveal({ style = {}, delay = 0, className = "", children }) {
  return (
    <div className={`pr-hero-in absolute ${className}`} style={{ ...style, animationDelay: `${delay}s` }}>
      {children}
    </div>
  );
}
