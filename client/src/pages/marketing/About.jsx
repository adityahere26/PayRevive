import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { StaggerChildren } from "../../components/motion/StaggerChildren.jsx";
import { FloatingCurrency } from "../../components/floating/FloatingCurrency.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
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
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCurrency symbol="₹" size="text-6xl" tone="text-white/10" style={{ top: "18%", right: "12%" }} depth={12} />
          <FloatingCurrency symbol="$" size="text-3xl" tone="text-mint-300/20" style={{ bottom: "16%", left: "10%" }} depth={18} floatDelay={0.7} />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <Eyebrow tone="dark">About PayRevive</Eyebrow>
            <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">
              Revenue recovery,
              <span className="block text-mint-300">built to be trusted.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-mint-100/90">
              PayRevive is an AI revenue recovery agent built for the Razorpay AI Buildathon —
              Track 03. It detects revenue at risk, diagnoses why a payment failed, and takes a
              bounded, policy-checked action to recover it.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-24 sm:px-8 sm:py-32">
        <RevealOnScroll className="text-center">
          <Eyebrow>Why we built it this way</Eyebrow>
          <h2 className="mx-auto mt-5 max-w-lg text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">
            Three principles that don&rsquo;t bend
          </h2>
        </RevealOnScroll>

        <StaggerChildren className="mt-16 space-y-12" step={110}>
          {PRINCIPLES.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-xl font-bold text-brand-900">{p.title}</h3>
                  <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-500">{p.body}</p>
                </div>
              </div>
            );
          })}
        </StaggerChildren>
      </section>

      <section className="border-t border-slate-200/70 bg-mint-50/50 py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-6 text-center sm:px-8">
          <RevealOnScroll>
            <h2 className="text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">See it in the product</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">
              The fastest way to understand PayRevive is the live demo — no account required.
            </p>
            <Link
              to="/demo"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-800"
            >
              View the live demo
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </RevealOnScroll>
        </div>
      </section>
    </div>
  );
}
