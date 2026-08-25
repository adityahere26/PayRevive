// The one card surface for the whole product: white, rounded-2xl, a hairline border, a soft
// shadow token (index.css), generous padding. Every page-level section uses this instead of
// a bespoke rounded-lg/border/shadow combination.

const TONES = {
  white: "border-slate-200/80 bg-white",
  mint: "border-brand-200 bg-mint-50/70",
};

export function Card({ title, subtitle, action, tone = "white", className = "", bodyClassName = "", children }) {
  return (
    <div className={`rounded-2xl border p-6 shadow-card ${TONES[tone] || TONES.white} ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-brand-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
