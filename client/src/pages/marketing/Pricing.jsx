import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { StaggerChildren } from "../../components/motion/StaggerChildren.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
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
      <section className="bg-canvas py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="mx-auto mt-6 max-w-xl text-5xl font-bold leading-[1.05] tracking-tight text-brand-900 sm:text-6xl">
              Simple, honest pricing.
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-slate-500">
              PayRevive is still early — final pricing isn&rsquo;t set. Rather than guess, every
              tier below is shown with what it includes, not a number we&rsquo;d have to walk back.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 sm:px-8 sm:pb-32">
        <StaggerChildren className="grid grid-cols-1 gap-6 lg:grid-cols-3" step={100}>
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-3xl border p-8 ${
                tier.highlighted ? "border-brand-700 bg-brand-900 text-white shadow-card-hover" : "border-slate-200/80 bg-white shadow-card"
              }`}
            >
              <h2 className={`text-xl font-bold ${tier.highlighted ? "text-white" : "text-brand-900"}`}>{tier.name}</h2>
              <p className={`mt-2 text-sm ${tier.highlighted ? "text-mint-100/80" : "text-slate-500"}`}>{tier.tagline}</p>
              <div className={`mt-6 text-2xl font-bold ${tier.highlighted ? "text-mint-200" : "text-slate-400"}`}>Coming soon</div>
              <ul className="mt-6 flex-1 space-y-3">
                {tier.features.map((f) => (
                  <li key={f} className={`flex items-start gap-2.5 text-sm ${tier.highlighted ? "text-mint-100/90" : "text-slate-600"}`}>
                    <CheckCircleIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tier.highlighted ? "text-mint-300" : "text-emerald-500"}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/contact"
                className={`mt-8 rounded-xl px-5 py-2.5 text-center text-sm font-semibold ${
                  tier.highlighted ? "bg-white text-brand-900 hover:bg-mint-50" : "bg-brand-700 text-white hover:bg-brand-800"
                }`}
              >
                Talk to us
              </Link>
            </div>
          ))}
        </StaggerChildren>
      </section>
    </div>
  );
}
