import { AppShell } from "@/components/app-shell";
import { ProofWorkspace } from "@/components/proof/proof-workspace";

export default function ProofPage() {
  return (
    <AppShell
      title="Proof"
      subtitle="Parse a client brief and extract key information — summarised clearly for your team."
    >
      <ProofWorkspace />
    </AppShell>
  );
}
