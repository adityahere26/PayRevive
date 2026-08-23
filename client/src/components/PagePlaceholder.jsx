// Shared shell for the not-yet-built pages, so every placeholder is honest about its state
// rather than looking finished. SPEC.md's P0/P1 phasing decides when each of these gets real
// content — see README.md for what's implemented vs. planned.

export default function PagePlaceholder({ title, description, phase }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8">
      <div className="mb-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {phase}
      </div>
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
    </div>
  );
}
