export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-mint-100 text-brand-600">{icon}</div>}
      <p className="text-sm font-medium text-brand-900">{title}</p>
      {description && <p className="max-w-md text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
