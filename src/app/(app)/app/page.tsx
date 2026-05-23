import { AppShell } from "@/components/app-shell";
import { AppOverview } from "@/components/app-overview";

export default function AppDashboardPage() {
  return (
    <AppShell
      title="Foundry HQ"
      subtitle="Your workspace at a glance"
      hideContentHeader
    >
      <AppOverview />
    </AppShell>
  );
}
