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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="text-sm font-semibold tracking-tight text-slate-900">
            payrevive
          </Link>
          <nav className="flex gap-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`text-sm ${
                  location.pathname.startsWith(item.to)
                    ? "font-medium text-slate-900"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span
            className={`text-xs ${authenticated ? "text-emerald-600" : "text-slate-400"}`}
          >
            {authenticated ? "Demo session active" : "Not signed in"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
