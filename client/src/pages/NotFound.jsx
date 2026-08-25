import { Link } from "react-router-dom";
import { FloatingCurrency } from "../components/floating/FloatingCurrency.jsx";
import { RevealOnScroll } from "../components/motion/RevealOnScroll.jsx";
import { ArrowRightIcon } from "../components/ui/icons.jsx";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <FloatingCurrency symbol="₹" size="text-7xl" tone="text-white/10" style={{ top: "16%", left: "10%" }} depth={14} />
        <FloatingCurrency symbol="$" size="text-3xl" tone="text-mint-300/20" style={{ bottom: "18%", right: "14%" }} depth={18} floatDelay={0.7} />
      </div>
      <RevealOnScroll className="relative text-center">
        <div className="text-8xl font-bold tracking-tight text-white/20 sm:text-9xl">404</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">This page didn&rsquo;t come through.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-mint-100/80">
          Unlike a failed payment, we can&rsquo;t recover this one automatically — but we can get
          you back to something real.
        </p>
        <Link
          to="/"
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-900 shadow-card-hover hover:bg-mint-50"
        >
          Back to home
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </RevealOnScroll>
    </div>
  );
}
