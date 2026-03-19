import { AppShell } from "@/components/app-shell";
import { AppOverview } from "@/components/app-overview";

export default function AppDashboardPage() {
  return (
    <AppShell
      title="Dashboard"
      subtitle="A shared workspace for proposal delivery, client context, and collaborative drafting."
    >
      <AppOverview />
    </AppShell>
  );
}
