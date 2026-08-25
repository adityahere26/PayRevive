import { Link } from "react-router-dom";

const FOOTER_LINKS = [
  { to: "/about", label: "About" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/solutions", label: "Solutions" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contact", label: "Contact" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200/70 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
                P
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-brand-900">payrevive</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Detect revenue at risk. Recover what can be recovered. Stop when it should.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-500">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="hover:text-brand-800">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-slate-400">
            © {new Date().getFullYear()} payrevive — Razorpay AI Buildathon, Track 03: AI Revenue Recovery.
          </span>
          <Link to="/demo" className="text-xs font-medium text-brand-700 hover:text-brand-900">
            Skip sign-up — view the live demo →
          </Link>
        </div>
      </div>
    </footer>
  );
}
