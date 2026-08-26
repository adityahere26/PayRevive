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
    title: "AI Recovery Decisions",
    body: "Every failed payment is scored for recovery probability and matched to a candidate intervention by PayRevive's planner — advisory only, never final.",
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
      <section className="bg-brand-950 py-28 sm:py-40">
        <div className="mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <Eyebrow tone="dark">Solutions</Eyebrow>
            <h1 className="mx-auto mt-6 max-w-2xl text-[clamp(2.5rem,6.5vw,5.5rem)] font-bold leading-[0.98] tracking-tight text-white">
              Everything revenue recovery needs — <span className="text-mint-300">nothing it doesn&rsquo;t.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-white/60">
              Five capabilities, one deterministic pipeline underneath all of them.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      {SOLUTIONS.map((s) => {
        const Icon = s.icon;
        const dark = Number(s.n) % 2 === 0;
        return (
          <section key={s.title} className={`relative overflow-hidden py-24 sm:py-32 ${dark ? "bg-brand-950" : "bg-white"}`}>
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute -top-6 right-6 select-none text-[9rem] font-bold leading-none tracking-tight sm:right-10 sm:text-[13rem] ${
                dark ? "text-white/[0.04]" : "text-brand-900/[0.04]"
              }`}
            >
              {s.n}
            </span>
            <div className="relative mx-auto max-w-5xl px-6 sm:px-8">
              <RevealOnScroll className="max-w-2xl">
                <span className={`flex h-12 w-12 items-center justify-center rounded-full ${dark ? "bg-white text-brand-950" : "bg-brand-950 text-white"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className={`mt-6 text-3xl font-bold tracking-tight sm:text-4xl ${dark ? "text-white" : "text-brand-900"}`}>{s.title}</h2>
                <p className={`mt-4 max-w-lg text-base leading-relaxed ${dark ? "text-white/60" : "text-slate-500"}`}>{s.body}</p>
              </RevealOnScroll>
              <RevealOnScroll
                delay={100}
                className={`mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 border-t pt-6 ${dark ? "border-white/10" : "border-brand-100"}`}
              >
                {s.points.map((p) => (
                  <span key={p} className={`label-mono flex items-center gap-2 text-[11px] uppercase ${dark ? "text-white/50" : "text-brand-500"}`}>
                    <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                    {p}
                  </span>
                ))}
              </RevealOnScroll>
            </div>
          </section>
        );
      })}

      <section className="border-t border-brand-100 bg-white py-24 sm:py-28">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center sm:px-8">
          <RevealOnScroll>
            <h2 className="text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">Ready to see it work?</h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/signup" className={buttonClasses({ size: "lg" })}>
                Get Started
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link to="/demo" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                View live demo
              </Link>
            </div>
          </RevealOnScroll>
        </div>
      </section>
    </div>
  );
}
