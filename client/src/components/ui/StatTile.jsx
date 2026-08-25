// Unified metric tile — Dashboard's headline numbers and Evaluation's result metrics both
// render through this so a number looks the same everywhere it appears.

const ACCENTS = {
  brand: "bg-brand-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  cyan: "bg-cyan-500",
  red: "bg-red-500",
  slate: "bg-slate-300",
};

export function StatTile({ label, value, hint, accent = "slate", icon }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${ACCENTS[accent] || ACCENTS.slate}`} />
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        {icon && <div className="text-brand-400">{icon}</div>}
      </div>
      <div className="mt-2 text-[1.75rem] font-semibold leading-none tracking-tight text-brand-900">{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
