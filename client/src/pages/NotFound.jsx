import { Link } from "react-router-dom";
import { FloatingCurrency } from "../components/floating/FloatingCurrency.jsx";
import { RevealOnScroll } from "../components/motion/RevealOnScroll.jsx";
import { ArrowRightIcon } from "../components/ui/icons.jsx";

export default function NotFound() {
  return (
    <div className="gradient-atmosphere glow-field relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <FloatingCurrency symbol="₹" size="text-7xl" tone="text-primary/10" style={{ top: "16%", left: "10%" }} depth={14} />
        <FloatingCurrency symbol="$" size="text-3xl" tone="text-accent/25" style={{ bottom: "18%", right: "14%" }} depth={18} floatDelay={0.7} />
      </div>
      <RevealOnScroll className="relative text-center">
        <div className="text-8xl font-bold tracking-tight text-brand-200 sm:text-9xl">404</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">This page didn&rsquo;t come through.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-brand-500">
          Unlike a failed payment, we can&rsquo;t recover this one automatically — but we can get
          you back to something real.
        </p>
        <Link
          to="/"
          className="gradient-cta mt-7 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
        >
          Back to home
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </RevealOnScroll>
    </div>
  );
}
