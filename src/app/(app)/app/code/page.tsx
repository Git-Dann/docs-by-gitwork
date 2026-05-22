import { AppShell } from "@/components/app-shell";
import { CodeClearOverview } from "@/components/codeclear/codeclear-overview";

export default function CodePage() {
  return (
    <AppShell
      title="Code"
      subtitle="Production-readiness checks, reviews, audits, and remediation planning."
    >
      <CodeClearOverview />
    </AppShell>
  );
}
