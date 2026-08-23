import { useParams } from "react-router-dom";
import PagePlaceholder from "../components/PagePlaceholder.jsx";

export default function RecoveryCaseDetail() {
  const { id } = useParams();
  return (
    <PagePlaceholder
      title={`Recovery Case ${id}`}
      phase="Planned — Day 3"
      description="Will show customer, amount, root cause, recovery probability, policy decision, attempts, and the 'Why this action?' explanation (SPEC.md § Recovery case page)."
    />
  );
}
