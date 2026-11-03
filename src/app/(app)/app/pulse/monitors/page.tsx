import { AppShell } from "@/components/app-shell";
import { InternalOnly } from "@/components/internal-only";
import { PulseNav } from "@/components/pulse/pulse-nav";
import { PulseMonitorsPanel } from "@/components/pulse/pulse-monitors-panel";

/**
 * Pulse → Monitors: scheduled re-scans. Internal-only, as it was on the Pulse landing page:
 * `/app/pulse/monitors` is in INTERNAL_ONLY_PREFIXES (the route gate), and the panel stays
 * inside `InternalOnly` so nothing renders for a guest even if the gate were bypassed.
 */
export default function PulseMonitorsPage() {
  return (
    <AppShell title="Monitors" subtitle="Projects Pulse re-scans on a schedule, and who hears about it.">
      <PulseNav />
      <InternalOnly>
        <PulseMonitorsPanel number="01" />
      </InternalOnly>
    </AppShell>
  );
}
