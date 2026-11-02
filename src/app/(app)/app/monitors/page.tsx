import { AppShell } from "@/components/app-shell";
import { MonitorsWorkspace } from "@/components/monitors/monitors-workspace";

export default function MonitorsPage() {
  return (
    <AppShell title="Monitors" subtitle="Every client's uptime, in one place.">
      <MonitorsWorkspace />
    </AppShell>
  );
}
