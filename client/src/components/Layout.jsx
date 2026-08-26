import { Link, Outlet, useLocation } from "react-router-dom";
import { getToken } from "../api/client.js";

// Primary nav follows the business owner's mental model (payments and recovery first);
// secondary items are operational/configuration surfaces and render visually de-emphasized.
// Routes themselves are unchanged — /dashboard, /recovery-cases etc. still work exactly as
// before, this only relabels/reorders how they're presented.
const PRIMARY_NAV_ITEMS = [
  { to: "/dashboard", label: "Overview" },
  { to: "/payments", label: "Payments" },
  { to: "/recovery-cases", label: "Recovery" },
  { to: "/evaluation", label: "Evaluation" },
];
const SECONDARY_NAV_ITEMS = [
  { to: "/audit-trail", label: "Audit Trail" },
  { to: "/policy", label: "Merchant Policy" },
];

export default function Layout() {
  const location = useLocation();
  const authenticated = Boolean(getToken());

  return (
    <div className="min-h-screen text-brand-900">
      <header className="border-b border-brand-900/10 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-950 text-xs font-bold text-white">
              P
            </span>
            <span className="label-mono text-xs font-semibold text-brand-950">PAYREVIVE</span>
          </Link>
          <nav className="order-3 flex w-full flex-wrap items-center gap-1 sm:order-0 sm:w-auto sm:flex-nowrap">
            {PRIMARY_NAV_ITEMS.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-3.5 ${
                    active ? "bg-brand-950 text-white" : "text-slate-500 hover:text-brand-950"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <span className="mx-1.5 hidden h-4 w-px bg-brand-900/10 lg:block" aria-hidden="true" />
            {SECONDARY_NAV_ITEMS.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`hidden shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors lg:inline-block ${
                    active ? "text-brand-950 underline underline-offset-4" : "text-slate-400 hover:text-brand-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-slate-400 lg:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${authenticated ? "bg-brand-950" : "bg-slate-300"}`} />
            {authenticated ? "Demo session active" : "Not signed in"}
          </span>
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full lg:hidden ${authenticated ? "bg-brand-950" : "bg-slate-300"}`}
            title={authenticated ? "Demo session active" : "Not signed in"}
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
