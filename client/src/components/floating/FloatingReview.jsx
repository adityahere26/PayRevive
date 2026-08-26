import { HoverReveal } from "../motion/HoverReveal.jsx";
import { formatINR } from "../../lib/format.js";

// Floating customer-initial bubble -> hover/focus reveals a review card. `label` must always
// say plainly what this is ("Example recovery", "Demo feedback") — this component is never
// used to present synthetic content as a real, verified customer testimonial.
export function FloatingReview({ name, quote, amount, status = "Recovered", label = "Example recovery", style, delay = 0 }) {
  return (
    <div className="pr-float pointer-events-auto absolute hidden lg:block" style={{ ...style, animationDelay: `${delay}s` }}>
      <HoverReveal
        label={`${name} — ${label}, ${formatINR(amount)}, ${status}. Focus for details.`}
        trigger={
          <span aria-hidden="true" className="gradient-brand flex h-12 w-12 cursor-default items-center justify-center rounded-full text-sm font-semibold text-white shadow-card-hover">
            {name[0]}
          </span>
        }
        panelClassName="left-1/2 top-full mt-3 w-60 -translate-x-1/2"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-card-hover">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-brand-900">{name}</span>
            <span className="shrink-0 rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700">
              {label}
            </span>
          </div>
          <p className="mt-2 text-sm italic leading-snug text-slate-600">&ldquo;{quote}&rdquo;</p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
            <span className="text-sm font-bold text-brand-900">{formatINR(amount)}</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-brand-500">{status}</span>
          </div>
        </div>
      </HoverReveal>
    </div>
  );
}
