import { Link } from "react-router-dom";
import { FloatingCurrency } from "../floating/FloatingCurrency.jsx";

// Shared visual chrome for every auth screen (login, signup, forgot/reset password) — a
// full-bleed black/white split composition, not a centered card floating on a plain canvas.
// The left panel carries an editorial statement + floating currency circles; the right panel
// carries the actual form. No marketing header/footer — the auth flow is deliberately
// standalone rather than a page buried inside the marketing site.
export function AuthShell({ eyebrow, title, subtitle, statement, statementSupport, children, footer }) {
  return (
    <div className="relative grid min-h-screen overflow-hidden bg-canvas lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-950 px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-8xl" tone="text-white/5" style={{ top: "-6%", right: "-4%" }} depth={8} />
          <FloatingCurrency symbol="₹" size="text-2xl" tone="border-mint-300/30 text-mint-300" style={{ top: "22%", left: "12%" }} depth={16} circle />
          <FloatingCurrency symbol="$" size="text-lg" tone="border-white/15 text-white/50" style={{ bottom: "30%", right: "16%" }} depth={20} floatDelay={0.6} circle />
          <FloatingCurrency symbol="€" size="text-base" tone="border-white/10 text-white/30" style={{ bottom: "14%", left: "20%" }} depth={24} floatDelay={1.1} circle />
        </div>

        <Link to="/" className="relative inline-flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-950">P</span>
          <span className="label-mono text-xs font-semibold text-white">PAYREVIVE</span>
        </Link>

        <div className="relative max-w-sm">
          <p className="label-mono text-[11px] text-mint-300">Revenue recovery</p>
          <h2 className="mt-4 text-[clamp(1.75rem,2.6vw,2.75rem)] font-semibold leading-[1.08] tracking-tight text-white">
            {statement}
          </h2>
          {statementSupport && <p className="mt-4 text-sm leading-relaxed text-white/55">{statementSupport}</p>}
        </div>

        <p className="label-mono relative text-[10px] text-white/25">Razorpay Test Mode · Synthetic demo data</p>
      </div>

      <div className="relative flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-950 text-sm font-bold text-white">P</span>
              <span className="label-mono text-xs font-semibold text-brand-950">PAYREVIVE</span>
            </Link>
          </div>

          {eyebrow}
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-brand-950">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-brand-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-brand-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
