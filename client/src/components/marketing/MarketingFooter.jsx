import { Link } from "react-router-dom";

const FOOTER_LINKS = [
  { to: "/about", label: "About" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/solutions", label: "Solutions" },
  { to: "/contact", label: "Contact" },
];

// Large editorial footer on the deep brand fill (#092328) — a closing statement, not a small
// conventional link list.
export function MarketingFooter() {
  return (
    <footer className="gradient-deep text-white">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:px-8 sm:py-32">
        <h2 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-tight sm:text-7xl lg:text-8xl">
          Recover what
          <span className="block text-accent-light">can be recovered.</span>
        </h2>

        <div className="hairline-dark mt-16 flex flex-col gap-10 border-t pt-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-950">
                P
              </span>
              <span className="label-mono text-xs font-semibold">PAYREVIVE</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-white/50">
              Detect revenue at risk. Recover what can be recovered. Stop when it should.
            </p>
          </div>
          <nav className="label-mono flex flex-wrap gap-x-8 gap-y-3 text-[11px] uppercase tracking-[0.14em] text-white/60">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="hover:text-white">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hairline-dark mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-end">
          <Link to="/demo" className="text-xs font-medium text-accent-light hover:text-white">
            Enter Demo →
          </Link>
        </div>
      </div>
    </footer>
  );
}
