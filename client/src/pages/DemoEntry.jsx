import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken, getToken } from "../api/client.js";
import { Button } from "../components/ui/Button.jsx";
import { FloatingCurrency } from "../components/floating/FloatingCurrency.jsx";
import { RevealOnScroll } from "../components/motion/RevealOnScroll.jsx";

// SPEC.md § Demo mode: evaluators never register. This is the single entry point into the
// product — there is no public sign-in / sign-up UI. It exchanges nothing for a pre-seeded
// demo-merchant JWT (api.authDemo) so every downstream route stays merchant-scoped.
export default function DemoEntry() {
  const navigate = useNavigate();
  // Starts in "loading": the single deliberate click happens on the landing page's "Enter
  // Demo", which navigates here; this screen then authenticates on its own — no second press.
  const [status, setStatus] = useState("loading"); // loading | error
  const [error, setError] = useState(null);
  const startedRef = useRef(false);

  async function handleEnterDemo() {
    setStatus("loading");
    setError(null);
    try {
      const { token } = await api.authDemo();
      setToken(token);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  }

  useEffect(() => {
    if (startedRef.current) return; // guard StrictMode's double-invoke
    startedRef.current = true;
    if (getToken()) {
      navigate("/dashboard", { replace: true });
      return;
    }
    handleEnterDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gradient-atmosphere glow-field relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <FloatingCurrency symbol="₹" size="text-9xl" tone="text-primary/6" style={{ top: "-8%", left: "4%" }} depth={8} />
        <FloatingCurrency symbol="₹" size="text-2xl" tone="border-accent/30 text-accent" style={{ top: "20%", right: "14%" }} depth={16} circle />
        <FloatingCurrency symbol="$" size="text-lg" tone="border-secondary/20 text-secondary/60" style={{ bottom: "18%", left: "12%" }} depth={20} floatDelay={0.6} circle />
        <FloatingCurrency symbol="£" size="text-base" tone="border-primary/10 text-primary/25" style={{ bottom: "10%", right: "22%" }} depth={24} floatDelay={1.2} circle />
      </div>

      <RevealOnScroll className="relative w-full max-w-md text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-950 text-sm font-bold text-white">P</span>
        <p className="label-mono mt-5 text-[11px] text-accent">PayRevive · Demo</p>
        <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-brand-950 sm:text-5xl">
          Enter the
          <br />
          PayRevive demo.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-brand-500">
          Experience the recovery workflow end to end — no account required.
        </p>

        <Button onClick={handleEnterDemo} disabled={status === "loading"} className="mt-9 w-full" size="lg">
          {status === "loading" ? "Entering demo…" : "Try again"}
        </Button>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </RevealOnScroll>
    </div>
  );
}
