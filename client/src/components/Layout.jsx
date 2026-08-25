import { Link, Outlet, useLocation } from "react-router-dom";
import { getToken } from "../api/client.js";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/recovery-cases", label: "Recovery Cases" },
  { to: "/evaluation", label: "Evaluation" },
  { to: "/audit-trail", label: "Audit Trail" },
  { to: "/policy", label: "Merchant Policy" },
];

export default function Layout() {
  const location = useLocation();
  const authenticated = Boolean(getToken());

  return (
    <div className="min-h-screen text-brand-900">
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white">
              P
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-brand-900">payrevive</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-mint-100 text-brand-800" : "text-slate-500 hover:bg-slate-50 hover:text-brand-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${authenticated ? "bg-emerald-500" : "bg-slate-300"}`} />
            {authenticated ? "Demo session active" : "Not signed in"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
