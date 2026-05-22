import { AppShell } from "@/components/app-shell";
import { SupportDashboard } from "@/components/support/support-dashboard";

export default function CarePage() {
  return (
    <AppShell
      title="Care"
      subtitle="Multi-client customer service ops — inbox, tickets, connectors, and reports."
      mainClassName="flex min-h-0 flex-1 overflow-hidden p-0"
    >
      <SupportDashboard />
    </AppShell>
  );
}
