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
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-3.5">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white">
              P
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-brand-900">payrevive</span>
          </Link>
          <nav className="order-3 flex w-full flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:flex-nowrap">
            {PRIMARY_NAV_ITEMS.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
                    active ? "bg-mint-100 text-brand-800" : "text-slate-500 hover:bg-slate-50 hover:text-brand-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <span className="mx-1.5 hidden h-4 w-px bg-slate-200 lg:block" aria-hidden="true" />
            {SECONDARY_NAV_ITEMS.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`hidden shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors lg:inline-block ${
                    active ? "bg-mint-100 text-brand-800" : "text-slate-400 hover:bg-slate-50 hover:text-brand-700"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-slate-400 lg:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${authenticated ? "bg-emerald-500" : "bg-slate-300"}`} />
            {authenticated ? "Demo session active" : "Not signed in"}
          </span>
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full lg:hidden ${authenticated ? "bg-emerald-500" : "bg-slate-300"}`}
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
