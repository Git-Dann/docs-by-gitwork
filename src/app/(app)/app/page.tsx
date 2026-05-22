import { AppShell } from "@/components/app-shell";
import { AppOverview } from "@/components/app-overview";

export default function AppDashboardPage() {
  return (
    <AppShell
      title="Pulse"
      subtitle="A shared signal layer for proposal delivery, proof work, client context, and hiring workflows."
    >
      <AppOverview />
    </AppShell>
  );
}
