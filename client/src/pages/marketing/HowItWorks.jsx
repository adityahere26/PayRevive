import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { StaggerChildren } from "../../components/motion/StaggerChildren.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { FloatingCurrency } from "../../components/floating/FloatingCurrency.jsx";
import { ArrowRightIcon } from "../../components/ui/icons.jsx";
import { buttonClasses } from "../../components/ui/Button.jsx";

const STEPS = [
  {
    n: "01",
    title: "Detect",
    body: "A payment fails, or a checkout is started and abandoned. Both are detected by the same risk pipeline the moment they happen — a failed-payment webhook and an abandoned-checkout timeout feed the identical downstream flow.",
  },
  {
    n: "02",
    title: "Understand",
    body: "The root cause is classified — insufficient funds, a bank decline, an expired card, a network drop, or a customer who simply changed their mind. Customer history (past payments, prior recovery attempts) feeds a deterministic recovery-probability score.",
  },
  {
    n: "03",
    title: "Decide",
    body: "An intervention is selected: a payment link, a Hinglish voice call, a promise-to-pay, escalation to the merchant, or stopping outreach entirely. For voice, Gemini classifies what the customer actually said; for everything else, the score drives the choice.",
  },
  {
    n: "04",
    title: "Policy check",
    body: "Every candidate action — regardless of where it came from — passes through the same policy engine. Attempt limits, high-value review thresholds, the recovery window, and opt-out status are checked before anything executes.",
  },
  {
    n: "05",
    title: "Recover",
    body: "The approved action runs: a real Razorpay Test Mode payment link is created (once, idempotently), or a live voice session gathers the customer's response — never a fabricated outcome.",
  },
  {
    n: "06",
    title: "Confirm",
    body: "The real outcome is observed and the recovered amount recorded. Every step along the way — detection, diagnosis, scoring, policy decision, action, outcome — is written to a merchant-scoped audit trail.",
  },
];

const SCENARIOS = [
  {
    title: "Failed payment recovery",
    body: "Triggered the moment a payment fails. PayRevive retrieves payment and customer context, diagnoses the failure, scores recoverability, and works through the same detect → confirm loop above.",
  },
  {
    title: "Checkout abandonment recovery",
    body: "Triggered when a customer starts checkout but never completes it — a session sitting unpaid past a configurable window is treated as at-risk revenue and enters the identical pipeline.",
  },
];

export default function HowItWorks() {
  return (
    <div>
      <section className="gradient-atmosphere glow-field relative overflow-hidden py-28 sm:py-40">
        <div className="pointer-events-none absolute inset-0">
          <FloatingCurrency symbol="₹" size="text-7xl" tone="text-primary/[0.06]" style={{ top: "14%", left: "8%" }} depth={10} />
          <FloatingCurrency
            circle
            symbol="$"
            size="flex h-14 w-14 text-lg"
            tone="border-accent/25 text-accent"
            circleClassName="border bg-white/70"
            style={{ bottom: "16%", right: "12%" }}
            depth={16}
            floatDelay={0.5}
          />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 sm:px-8">
          <RevealOnScroll>
            <Eyebrow>How it works</Eyebrow>
            <h1 className="mt-6 text-[clamp(2.75rem,7vw,6.5rem)] font-bold leading-[0.95] tracking-tight text-brand-950">
              One pipeline.
              <span className="block text-accent">Every safeguard.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-brand-600">
              Detect → Diagnose → Decide → Policy check → Act → Observe → Recover → Measure →
              Audit. Every recovery case moves through all nine stages, traceably.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      <section className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          {STEPS.map((s, i) => (
            <RevealOnScroll
              key={s.n}
              delay={Math.min(i * 60, 240)}
              className={`grid grid-cols-1 items-start gap-4 border-b border-brand-100 py-12 last:border-0 sm:grid-cols-[auto,1fr] sm:gap-14 sm:py-16 ${
                i % 2 === 1 ? "sm:pl-24" : ""
              }`}
            >
              <span className="text-[5.5rem] font-bold leading-none tracking-tight text-brand-100 sm:text-[7.5rem]">{s.n}</span>
              <div className="sm:pt-6">
                <div className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">{s.title}</div>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-500">{s.body}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      <section className="gradient-brand py-24 sm:py-28">
        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          <RevealOnScroll className="max-w-lg">
            <Eyebrow tone="dark">Two triggers, one pipeline</Eyebrow>
            <h2 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">Where a recovery case comes from</h2>
          </RevealOnScroll>
          <StaggerChildren className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2" step={100}>
            {SCENARIOS.map((s) => (
              <div key={s.title} className="gradient-brand p-8 sm:p-10">
                <h3 className="text-xl font-bold text-white">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{s.body}</p>
              </div>
            ))}
          </StaggerChildren>
        </div>
      </section>

      <section className="bg-white py-24 sm:py-28">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <RevealOnScroll>
            <h2 className="text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">Explore the capabilities</h2>
          </RevealOnScroll>
          <RevealOnScroll delay={80}>
            <Link to="/solutions" className={buttonClasses({ size: "lg" })}>
              See solutions
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </RevealOnScroll>
        </div>
      </section>
    </div>
  );
}
