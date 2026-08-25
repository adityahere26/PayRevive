import { useState } from "react";
import { RevealOnScroll } from "../../components/motion/RevealOnScroll.jsx";
import { Eyebrow } from "../../components/marketing/Eyebrow.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button } from "../../components/ui/Button.jsx";

const CONTACT_EMAIL = "team@payrevive.dev";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | unavailable

  function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    // Honest by design: this preview build has no contact-form backend to send to. Rather than
    // fake a success state, show a brief "sending" moment and then say so plainly, with a real
    // way to actually reach someone.
    window.setTimeout(() => setStatus("unavailable"), 500);
  }

  return (
    <div>
      <section className="bg-canvas py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center sm:px-8">
          <RevealOnScroll>
            <Eyebrow>Contact</Eyebrow>
            <h1 className="mx-auto mt-6 max-w-xl text-5xl font-bold leading-[1.05] tracking-tight text-brand-900 sm:text-6xl">
              Talk to us.
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-slate-500">
              Questions about pricing, policy, or how PayRevive fits your checkout — reach out
              directly, or use the live demo to see it running first.
            </p>
          </RevealOnScroll>
        </div>
      </section>

      <section className="mx-auto max-w-lg px-6 pb-24 sm:px-8 sm:pb-32">
        <RevealOnScroll className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm text-slate-600">
              Name
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </label>
            <label className="block text-sm text-slate-600">
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </label>
            <label className="block text-sm text-slate-600">
              Message
              <textarea
                required
                rows={4}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-brand-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </label>
            <Button type="submit" disabled={status === "sending"} className="w-full">
              {status === "sending" ? "Sending…" : "Send message"}
            </Button>
          </form>

          {status === "unavailable" && (
            <div className="mt-5">
              <Alert tone="info" title="This preview build doesn't send messages yet">
                Email us directly at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline underline-offset-2">
                  {CONTACT_EMAIL}
                </a>{" "}
                and we&rsquo;ll get back to you.
              </Alert>
            </div>
          )}
        </RevealOnScroll>
      </section>
    </div>
  );
}
