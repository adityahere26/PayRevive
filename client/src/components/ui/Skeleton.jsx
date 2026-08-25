export function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export function SkeletonStatRow({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-3 h-7 w-24" />
          <SkeletonBlock className="mt-3 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
