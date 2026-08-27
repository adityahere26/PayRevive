import { Link } from "react-router-dom";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { buttonClasses } from "../../components/ui/Button.jsx";
import {
  ArrowRightIcon,
  SparkleIcon,
  LinkIcon,
  MicIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
} from "../../components/ui/icons.jsx";

const SOLUTIONS = [
  {
    n: "01",
    icon: SparkleIcon,
    title: "Recovery Decisions",
    body: "Every failed payment is scored for recovery probability and matched to a candidate intervention by PayRevive's recovery decision engine — advisory only, never final.",
    points: ["Root-cause classification", "Deterministic recovery scoring", "Advisory intervention selection"],
  },
  {
    n: "02",
    icon: LinkIcon,
    title: "Razorpay Payment Links",
    body: "Approved cases get a real Razorpay Test Mode payment link, created through one idempotent path shared by every channel that can trigger one.",
    points: ["One safe, shared code path", "Idempotent — never sent twice", "Test Mode only, by design"],
  },
  {
    n: "03",
    icon: MicIcon,
    title: "Hinglish Voice Recovery",
    body: "A live, browser-based conversation in natural Hinglish. The customer's intent is classified and run through the same eligibility and policy checks as every other channel.",
    points: ["Natural Hinglish conversation", "Same policy engine as text", "Text fallback for any browser"],
  },
  {
    n: "04",
    icon: ShieldCheckIcon,
    title: "Merchant Policy Engine",
    body: "Attempt limits, high-value review thresholds, recovery windows, and opt-out behavior — configured per merchant, enforced deterministically on every single action.",
    points: ["Max recovery / voice attempts", "High-value escalation threshold", "Opt-out always respected"],
  },
  {
    n: "05",
    icon: CheckCircleIcon,
    title: "Outcome Verification & Audit",
    body: "Nothing is assumed recovered. Every case's real outcome is confirmed, and the entire path from detection to confirmation is written to a merchant-scoped audit log.",
    points: ["Real outcomes, never assumed", "Full explainable timeline", "Merchant-isolated audit trail"],
  },
];

export default function Solutions() {
  return (
    <div>
      <section className="gradient-atmosphere glow-field relative overflow-hidden py-28 sm:py-40">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span
            aria-hidden="true"
            className="absolute -right-6 top-1/2 hidden -translate-y-1/2 select-none text-[16rem] font-bold leading-none tracking-tight text-primary/[0.05] lg:block"
          >
            05
          </span>
        </div>
        <div className="relative mx-auto max-w-4xl px-6 sm:px-8">
          <RevealOnScroll className="max-w-2xl">
            <Eyebrow>Solutions</Eyebrow>
            <h1 className="mt-6 text-[clamp(2.5rem,6.5vw,5.5rem)] font-bold leading-[0.98] tracking-tight text-brand-950">
              Everything revenue recovery needs — <span className="text-accent">nothing it doesn&rsquo;t.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-brand-600">
              Five capabilities, one deterministic pipeline underneath all of them.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      {SOLUTIONS.map((s) => {
        const Icon = s.icon;
        const tinted = Number(s.n) % 2 === 0;
        return (
          <section key={s.title} className={`relative overflow-hidden py-24 sm:py-32 ${tinted ? "bg-mint-50/50" : "bg-white"}`}>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-6 right-6 select-none text-[9rem] font-bold leading-none tracking-tight text-brand-900/[0.04] sm:right-10 sm:text-[13rem]"
            >
              {s.n}
            </span>
            <div className="relative mx-auto max-w-5xl px-6 sm:px-8">
              <RevealOnScroll className="max-w-2xl">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-950 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-6 text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">{s.title}</h2>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-500">{s.body}</p>
              </RevealOnScroll>
              <RevealOnScroll delay={100} className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-brand-100 pt-6">
                {s.points.map((p) => (
                  <span key={p} className="label-mono flex items-center gap-2 text-[11px] uppercase text-brand-500">
                    <CheckCircleIcon className="h-3.5 w-3.5 text-accent" />
                    {p}
                  </span>
                ))}
              </RevealOnScroll>
            </div>
          </section>
        );
      })}

      <section className="border-t border-brand-100 bg-white py-24 sm:py-28">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <RevealOnScroll>
            <h2 className="text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">Ready to see it work?</h2>
          </RevealOnScroll>
          <RevealOnScroll delay={80} className="flex flex-wrap items-center gap-3">
            <Link to="/demo" className={buttonClasses({ size: "lg" })}>
              Enter Demo
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Link to="/how-it-works" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              See How It Works
            </Link>
          </RevealOnScroll>
        </div>
      </section>
    </div>
  );
}
