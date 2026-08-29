import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { MenuIcon, XIcon } from "./ui/icons.jsx";

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
  { to: "/integration", label: "Integration" },
];

// Below the `lg` breakpoint the desktop nav (which is the only place the secondary items
// appear) is collapsed, so this single list backs the mobile menu and keeps every product
// route reachable there. Same routes/router as above — only the presentation differs.
const MOBILE_NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/payments", label: "Payments" },
  { to: "/recovery-cases", label: "Recovery Cases" },
  { to: "/evaluation", label: "Evaluation" },
  { to: "/policy", label: "Merchant Policy" },
  { to: "/audit-trail", label: "Audit Trail" },
  { to: "/integration", label: "Integration" },
];

export default function Layout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen text-brand-900">
      <header className="border-b border-brand-900/10 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-x-3 px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-950 text-xs font-bold text-white">
              P
            </span>
            <span className="label-mono text-xs font-semibold text-brand-950">PAYREVIVE</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
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
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-900/15 text-brand-950 transition-colors hover:bg-brand-900/5 lg:hidden"
          >
            {menuOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="mx-auto max-w-6xl border-t border-brand-900/10 px-4 pb-3 pt-2 sm:px-6 lg:hidden">
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-950 text-white"
                      : "text-slate-600 hover:bg-brand-900/5 hover:text-brand-950"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
