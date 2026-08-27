import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import MarketingLayout from "./components/marketing/MarketingLayout.jsx";
import DemoEntry from "./pages/DemoEntry.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Payments from "./pages/Payments.jsx";
import RecoveryCases from "./pages/RecoveryCases.jsx";
import RecoveryCaseDetail from "./pages/RecoveryCaseDetail.jsx";
import VoiceRecovery from "./pages/VoiceRecovery.jsx";
import Evaluation from "./pages/Evaluation.jsx";
import AuditTrail from "./pages/AuditTrail.jsx";
import MerchantPolicy from "./pages/MerchantPolicy.jsx";
import Landing from "./pages/marketing/Landing.jsx";
import About from "./pages/marketing/About.jsx";
import HowItWorks from "./pages/marketing/HowItWorks.jsx";
import Solutions from "./pages/marketing/Solutions.jsx";
import Contact from "./pages/marketing/Contact.jsx";
import NotFound from "./pages/NotFound.jsx";

// Route map (demo-first Buildathon build):
//  - "/" is the public marketing landing page. Its primary CTA is "Enter Demo" → "/demo".
//  - There is NO public sign-in / sign-up / password-reset / onboarding UI. Those screens were
//    removed: this build has no real merchant registration backend, only the pre-seeded demo
//    merchant (server/src/routes/auth.js issues demo tokens — SECURITY.md § Demo authentication).
//  - "/demo" (DemoEntry) is the single entry point into the product. It calls api.authDemo(),
//    stores the demo JWT, and lands on "/dashboard". Merchant scoping/isolation is unchanged —
//    every product route below still runs under that demo session's token.
//  - The product routes (/dashboard onward) are unchanged — same Layout, components, APIs.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/solutions" element={<Solutions />} />
          <Route path="/contact" element={<Contact />} />
        </Route>

        <Route path="/demo" element={<DemoEntry />} />

        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/recovery-cases" element={<RecoveryCases />} />
          <Route path="/recovery-cases/:id" element={<RecoveryCaseDetail />} />
          <Route path="/voice-recovery/:caseId" element={<VoiceRecovery />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="/audit-trail" element={<AuditTrail />} />
          <Route path="/policy" element={<MerchantPolicy />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
