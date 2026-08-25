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
import Pricing from "./pages/marketing/Pricing.jsx";
import Contact from "./pages/marketing/Contact.jsx";
import Login from "./pages/auth/Login.jsx";
import Signup from "./pages/auth/Signup.jsx";
import ForgotPassword from "./pages/auth/ForgotPassword.jsx";
import ResetPassword from "./pages/auth/ResetPassword.jsx";
import Onboarding from "./pages/auth/Onboarding.jsx";
import NotFound from "./pages/NotFound.jsx";

// Route map (this session's redesign):
//  - "/" now the public marketing landing page (was DemoEntry — moved to "/demo", still the
//    same working component, still the one real entry point for evaluators per CLAUDE.md).
//  - Public marketing + auth-shell routes carry PayRevive's design language but no working
//    backend beyond the demo token (see Login.jsx/Signup.jsx's own notes on why).
//  - The authenticated product routes (/dashboard onward) are unchanged — same Layout, same
//    components, same APIs.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/solutions" element={<Solutions />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/contact" element={<Contact />} />
        </Route>

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/onboarding" element={<Onboarding />} />
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
