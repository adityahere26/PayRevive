import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { buttonClasses } from "../../components/ui/Button.jsx";
import { CheckCircleIcon } from "../../components/ui/icons.jsx";

// Deliberately no invented numbers here — RECOVERY_POLICY.md/CLAUDE.md's honesty requirement
// extended to commercial claims. Every tier's price column says "Coming soon" or routes to
// /contact ("Talk to us") rather than fabricating a number.
const TIERS = [
  {
    name: "Starter",
    tagline: "For merchants finding their footing with recovery",
    features: ["Failed-payment & abandonment detection", "Razorpay Test Mode payment links", "Merchant policy controls", "Audit trail"],
  },
  {
    name: "Growth",
    tagline: "For merchants running recovery at real volume",
    features: ["Everything in Starter", "Hinglish voice recovery", "Recovery-engine evaluation tooling", "Priority support"],
    highlighted: true,
  },
  {
    name: "Enterprise",
    tagline: "For merchants with custom policy and volume needs",
    features: ["Everything in Growth", "Custom policy configuration", "Dedicated onboarding", "SLA-backed support"],
  },
];

export default function Pricing() {
  return (
    <div>
      <section className="gradient-atmosphere glow-field relative overflow-hidden py-28 sm:py-40">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 top-10 hidden select-none text-[20rem] font-bold leading-none text-primary/[0.05] lg:block"
        >
          ₹
        </span>
        <div className="relative mx-auto max-w-4xl px-6 sm:px-8">
          <RevealOnScroll className="max-w-xl">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="mt-6 text-[clamp(2.75rem,7vw,6rem)] font-bold leading-[0.97] tracking-tight text-brand-950">
              Simple, honest pricing.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-brand-600">
              PayRevive is still early — final pricing isn&rsquo;t set. Rather than guess, every
              tier below is shown with what it includes, not a number we&rsquo;d have to walk back.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-28 sm:px-8 sm:pb-40">
        <div className="divide-y divide-brand-900/10 border-y border-brand-900/10">
          {TIERS.map((tier, i) => (
            <RevealOnScroll
              key={tier.name}
              delay={i * 90}
              className={`relative grid grid-cols-1 gap-6 py-10 sm:grid-cols-[1fr,auto] sm:items-center sm:gap-10 sm:py-14 ${
                tier.highlighted ? "pl-6 sm:pl-10" : ""
              }`}
            >
              {tier.highlighted && <span aria-hidden="true" className="gradient-cta absolute inset-y-0 left-0 w-1" />}
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">{tier.name}</h2>
                  {tier.highlighted && (
                    <span className="label-mono rounded-full border border-accent/40 bg-mint-100 px-2.5 py-1 text-[10px] uppercase text-accent">
                      Most requested
                    </span>
                  )}
                </div>
                <p className="mt-2 max-w-md text-sm text-brand-400">{tier.tagline}</p>
                <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-brand-600">
                      <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-6 sm:flex-col sm:items-end sm:gap-3">
                <span className="text-lg font-semibold text-brand-300">Coming soon</span>
                {tier.highlighted ? (
                  <Link to="/contact" className={buttonClasses({ size: "md" })}>
                    Talk to us
                  </Link>
                ) : (
                  <Link
                    to="/contact"
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-brand-200 px-5 py-2.5 text-sm font-medium tracking-tight text-brand-900 transition-all duration-300 hover:border-brand-400 hover:bg-brand-50"
                  >
                    Talk to us
                  </Link>
                )}
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>
    </div>
  );
}
