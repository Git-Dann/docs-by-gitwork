import { AppShell } from "@/components/app-shell";
import { ProvenanceRegister } from "@/components/provenance/provenance-register";

export default function ProvenancePage() {
  return (
    <AppShell
      title="Provenance"
      subtitle="Strike a Countermark from a completed Pulse scan — a signed, expiring certificate of what a piece of software was found to be, and what could not be established."
    >
      <ProvenanceRegister />
    </AppShell>
  );
}
