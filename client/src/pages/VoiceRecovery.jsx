import { useParams } from "react-router-dom";
import PagePlaceholder from "../components/PagePlaceholder.jsx";

export default function VoiceRecovery() {
  const { caseId } = useParams();
  return (
    <PagePlaceholder
      title={`Voice Recovery — Case ${caseId}`}
      phase="Planned — Day 5"
      description="Hero feature: Hinglish voice recovery via browser speech recognition + Google Gemini intent classification (AGENT_DESIGN.md § Voice pipeline). Not implemented yet."
    />
  );
}
