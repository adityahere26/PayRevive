import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { MagneticButton } from "../motion/MagneticButton.jsx";
import { MenuIcon, XIcon, ArrowRightIcon } from "../ui/icons.jsx";

const NAV_LINKS = [
  { to: "/about", label: "About" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/solutions", label: "Solutions" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contact", label: "Contact" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the mobile panel automatically on route change (e.g. a link inside it was followed
  // via keyboard/back-forward rather than its own onClick).
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
            P
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-brand-900">payrevive</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-mint-100 text-brand-800" : "text-slate-500 hover:bg-slate-50 hover:text-brand-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link to="/login" className="rounded-lg px-3.5 py-2 text-sm font-medium text-brand-800 hover:bg-mint-50">
            Log in
          </Link>
          <MagneticButton
            as={Link}
            to="/signup"
            className="items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-800"
          >
            Get Started
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </MagneticButton>
        </div>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-800 hover:bg-mint-50 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-white px-5 py-4 lg:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? "bg-mint-100 text-brand-800" : "text-slate-600 hover:bg-slate-50"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
            <Link to="/login" className="rounded-lg border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-brand-800">
              Log in
            </Link>
            <Link to="/signup" className="rounded-lg bg-brand-700 px-4 py-2.5 text-center text-sm font-medium text-white">
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
