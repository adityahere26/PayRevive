import { Link } from "react-router-dom";
import { FloatingCurrency } from "../floating/FloatingCurrency.jsx";

// Shared visual chrome for every auth screen (login, signup, forgot/reset password) — a
// centered card over the canvas background with a few subtle floating currency glyphs, no
// marketing header/footer. Deliberately standalone so the auth flow doesn't feel like a page
// buried inside the marketing site.
export function AuthShell({ eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-6 py-16">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <FloatingCurrency symbol="₹" size="text-6xl" tone="text-brand-100" style={{ top: "10%", left: "8%" }} depth={10} />
        <FloatingCurrency symbol="$" size="text-2xl" tone="text-mint-300" style={{ bottom: "14%", right: "10%" }} depth={16} floatDelay={0.6} />
        <FloatingCurrency symbol="€" size="text-xl" tone="text-brand-100" style={{ top: "70%", left: "16%" }} depth={20} floatDelay={1.1} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-sm font-bold text-white">P</span>
            <span className="text-base font-semibold tracking-tight text-brand-900">payrevive</span>
          </Link>
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-card-hover">
          {eyebrow}
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
      </div>
    </div>
  );
}
