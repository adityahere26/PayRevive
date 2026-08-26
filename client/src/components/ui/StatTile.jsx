// Unified metric tile — Dashboard's headline numbers and Evaluation's result metrics both
// render through this so a number looks the same everywhere it appears. Editorial treatment:
// the number itself carries the weight, not a colored card chrome — accent shows up only as a
// small dot next to the label.

const ACCENTS = {
  brand: "bg-brand-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  cyan: "bg-cyan-500",
  red: "bg-red-500",
  slate: "bg-brand-300",
};

export function StatTile({ label, value, hint, accent = "slate", icon }) {
  return (
    <div className="border-t border-brand-900/10 pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACCENTS[accent] || ACCENTS.slate}`} />
          {label}
        </div>
        {icon && <div className="text-brand-400">{icon}</div>}
      </div>
      <div className="mt-2.5 text-4xl font-semibold leading-none tracking-tight text-brand-950 sm:text-[2.75rem]">{value}</div>
      {hint && <div className="mt-2.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
