import { AppShell } from "@/components/app-shell";
import { AssayRegister } from "@/components/assay/assay-register";

export default function AssayPage() {
  return (
    <AppShell
      title="Assay"
      subtitle="Strike a Countermark from a completed Pulse scan — a signed, expiring certificate of what a piece of software was found to be, and what could not be established."
    >
      <AssayRegister />
    </AppShell>
  );
}
