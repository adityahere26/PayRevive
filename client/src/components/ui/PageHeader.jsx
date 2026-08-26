export function PageHeader({ eyebrow, title, badge, description, actions }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow && <div className="mb-1">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  );
}

export function Field({ label, value, caption }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-brand-900">{value ?? "—"}</dd>
      {caption && <div className="mt-0.5 font-mono text-[11px] text-slate-400">{caption}</div>}
    </div>
  );
}
