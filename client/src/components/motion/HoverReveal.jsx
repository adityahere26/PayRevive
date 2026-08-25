// A trigger that reveals a floating panel on hover OR keyboard focus — pure CSS (Tailwind's
// `group`/`group-focus-within`), no state/re-render, so it's cheap to use for many small
// floating elements on one page. The trigger is tabIndex=0 so keyboard users reach it too; the
// interaction isn't mouse-only.
export function HoverReveal({ trigger, children, className = "", panelClassName = "", label }) {
  return (
    <div className={`group relative ${className}`}>
      <div tabIndex={0} aria-label={label} className="outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-full">
        {trigger}
      </div>
      <div
        role="tooltip"
        className={`pointer-events-none absolute z-20 opacity-0 translate-y-1 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
