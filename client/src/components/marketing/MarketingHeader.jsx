import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { MagneticButton } from "../motion/MagneticButton.jsx";
import { MenuIcon, XIcon, ArrowRightIcon } from "../ui/icons.jsx";

const NAV_LINKS = [
  { to: "/solutions", label: "Product" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the mobile panel automatically on route change (e.g. a link inside it was followed
  // via keyboard/back-forward rather than its own onClick).
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-brand-900/10 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-950 text-sm font-bold text-white">
            P
          </span>
          <span className="label-mono text-xs font-semibold text-brand-950">PAYREVIVE</span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `label-mono relative py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:bg-brand-950 after:transition-all after:duration-300 ${
                  isActive
                    ? "text-brand-950 after:w-full"
                    : "text-slate-500 after:w-0 hover:text-brand-950 hover:after:w-full"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-6 lg:flex">
          <Link to="/login" className="label-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brand-800 hover:text-brand-950">
            Log in
          </Link>
          <MagneticButton
            as={Link}
            to="/signup"
            className="gradient-cta items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            Get Started
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </MagneticButton>
        </div>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full text-brand-800 hover:bg-brand-50 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-brand-900/10 bg-white px-5 py-6 lg:hidden">
          <nav className="flex flex-col gap-5">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-2xl font-semibold tracking-tight ${isActive ? "text-brand-950 underline underline-offset-4" : "text-brand-950"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 flex flex-col gap-3 border-t border-brand-900/10 pt-6">
            <Link to="/login" className="rounded-full border border-brand-200 px-4 py-3 text-center text-sm font-medium text-brand-800">
              Log in
            </Link>
            <Link to="/signup" className="gradient-cta rounded-full px-4 py-3 text-center text-sm font-semibold text-white">
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
