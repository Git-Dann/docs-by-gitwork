import { AppShell } from "@/components/app-shell";
import { ProofWorkspace } from "@/components/proof/proof-workspace";

export default function ProofPage() {
  return (
    <AppShell
      title="Proof"
      subtitle="Collaborative drafting and provenance-aware editing inside the Gitwork workspace."
    >
      <ProofWorkspace />
    </AppShell>
  );
}
