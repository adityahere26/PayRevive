import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import DemoEntry from "./pages/DemoEntry.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import RecoveryCases from "./pages/RecoveryCases.jsx";
import RecoveryCaseDetail from "./pages/RecoveryCaseDetail.jsx";
import VoiceRecovery from "./pages/VoiceRecovery.jsx";
import Evaluation from "./pages/Evaluation.jsx";
import AuditTrail from "./pages/AuditTrail.jsx";
import MerchantPolicy from "./pages/MerchantPolicy.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DemoEntry />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/recovery-cases" element={<RecoveryCases />} />
          <Route path="/recovery-cases/:id" element={<RecoveryCaseDetail />} />
          <Route path="/voice-recovery/:caseId" element={<VoiceRecovery />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="/audit-trail" element={<AuditTrail />} />
          <Route path="/policy" element={<MerchantPolicy />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
