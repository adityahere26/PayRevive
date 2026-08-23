import PagePlaceholder from "../components/PagePlaceholder.jsx";

export default function RecoveryCases() {
  return (
    <PagePlaceholder
      title="Recovery Cases"
      phase="Planned — Day 3"
      description="Will list revenue-at-risk cases (failed payments and abandoned checkouts) with status, root cause, and recovery probability once the recovery pipeline exists (ARCHITECTURE.md § API contract: GET /api/recovery-cases)."
    />
  );
}
