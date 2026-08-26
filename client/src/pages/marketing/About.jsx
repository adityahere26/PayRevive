import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { FloatingCurrency } from "../../components/floating/FloatingCurrency.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { buttonClasses } from "../../components/ui/Button.jsx";
import { ArrowRightIcon, ShieldCheckIcon, SparkleIcon, FileTextIcon } from "../../components/ui/icons.jsx";

const PRINCIPLES = [
  {
    icon: ShieldCheckIcon,
    title: "Policy decides, not the model",
    body: "Money, thresholds, retry counts, and eligibility are controlled by deterministic code. An AI-recommended action is advisory until the policy engine approves it — never the other way around.",
  },
  {
    icon: SparkleIcon,
    title: "AI where it's actually useful",
    body: "Google Gemini classifies voice intent and recommends interventions — narrow, well-scoped jobs. It isn't wired into an agentic loop making open-ended decisions about your revenue.",
  },
  {
    icon: FileTextIcon,
    title: "Every action is explainable",
    body: "If it's not audited, it didn't happen. Every state-changing event — a decision, a policy check, a payment link, a voice turn — is written to a merchant-scoped audit log.",
  },
];

export default function About() {
  return (
    <div>
      <section className="relative overflow-hidden bg-brand-950 py-28 sm:py-40">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-6xl" tone="text-white/10" style={{ top: "18%", right: "12%" }} depth={12} />
          <FloatingCurrency symbol="$" size="text-3xl" tone="text-mint-300/20" style={{ bottom: "16%", left: "10%" }} depth={18} floatDelay={0.7} />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <Eyebrow tone="dark">About PayRevive</Eyebrow>
            <h1 className="mt-6 text-[clamp(2.75rem,7vw,6rem)] font-bold leading-[0.97] tracking-tight text-white">
              Revenue recovery,
              <span className="block text-mint-300">built to be trusted.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/60">
              PayRevive is an AI revenue recovery agent built for the Razorpay AI Buildathon —
              Track 03. It detects revenue at risk, diagnoses why a payment failed, and takes a
              bounded, policy-checked action to recover it.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      <section className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6 sm:px-8">
          <RevealOnScroll>
            <Eyebrow>Why we built it this way</Eyebrow>
            <h2 className="mt-5 max-w-md text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">
              Three principles that don&rsquo;t bend
            </h2>
          </RevealOnScroll>

          <div className="mt-16">
            {PRINCIPLES.map((p, i) => {
              const Icon = p.icon;
              return (
                <RevealOnScroll
                  key={p.title}
                  delay={i * 100}
                  className="grid grid-cols-1 items-start gap-5 border-t border-brand-100 py-10 sm:grid-cols-[3rem,1fr] sm:gap-10 sm:py-12"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-950 text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-brand-900 sm:text-2xl">{p.title}</h3>
                    <p className="mt-2.5 max-w-xl text-base leading-relaxed text-slate-500">{p.body}</p>
                  </div>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-brand-950 py-28 sm:py-36">
        <div className="mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <p className="text-[clamp(2.25rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-tight text-white">
              Payments fail.
              <span className="block text-mint-300">Revenue shouldn&rsquo;t.</span>
            </p>
          </RevealOnScroll>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-6 text-center sm:px-8">
          <RevealOnScroll>
            <h2 className="text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">See it in the product</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">
              The fastest way to understand PayRevive is the live demo — no account required.
            </p>
            <Link to="/demo" className={buttonClasses({ size: "lg", className: "mt-6" })}>
              View the live demo
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </RevealOnScroll>
        </div>
      </section>
    </div>
  );
}
