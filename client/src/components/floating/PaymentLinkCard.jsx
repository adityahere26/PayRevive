import { ParallaxElement } from "../motion/ParallaxElement.jsx";
import { formatINR } from "../../lib/format.js";

// Small floating UI object (brief §4 "PAYMENT LINK") — part of the recovery visual story
// alongside PaymentCard3D. Kept intentionally tiny/UI-like (not another full card) so it
// reads as a distinct object in the composition.
export function PaymentLinkCard({ amount = 2999, className = "", style = {}, depth = 14, rotate = 4 }) {
  return (
    <ParallaxElement depth={depth} className={`pr-float pointer-events-none absolute select-none ${className}`} style={{ animationDuration: "6.5s", ...style }}>
      <div
        className="w-48 rounded-xl border border-brand-900/10 bg-white/95 p-3.5 shadow-card-hover backdrop-blur-sm"
        style={{ transform: `rotate(${rotate}deg)` }}
        aria-hidden="true"
      >
        <div className="label-mono text-[9px] font-semibold uppercase tracking-widest text-slate-400">Payment Link</div>
        <div className="mt-1.5 text-lg font-bold text-brand-900">{formatINR(amount)}</div>
        <div className="mt-2.5 rounded-full bg-brand-950 px-3 py-1.5 text-center text-[11px] font-semibold text-white">Pay Now</div>
      </div>
    </ParallaxElement>
  );
}
