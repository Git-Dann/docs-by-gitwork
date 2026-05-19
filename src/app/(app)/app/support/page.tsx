import { AppShell } from "@/components/app-shell";
import { SupportDashboard } from "@/components/support/support-dashboard";

export default function SupportPage() {
  return (
    <AppShell
      title="Support"
      subtitle="Multi-client customer service ops — inbox, tickets, connectors, and reports."
    >
      <SupportDashboard />
    </AppShell>
  );
}
