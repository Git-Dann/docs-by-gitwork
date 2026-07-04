import { AppShell } from "@/components/app-shell";
import { PulseOverview, PulseChecksDisclosure } from "@/components/pulse/pulse-overview";
import { PulseScanListView } from "@/components/pulse/pulse-scan-list";
import { PulseLeadsPanel } from "@/components/pulse/pulse-leads-panel";
import { PulseMonitorsPanel } from "@/components/pulse/pulse-monitors-panel";
import { PulseStudiesPanel } from "@/components/pulse/pulse-studies-panel";
import { PulseStartersPanel } from "@/components/pulse/pulse-starters-panel";

export default function PulsePage() {
  return (
    <AppShell
      title="Pulse"
      subtitle="Validate and audit client projects — from prompt to production."
    >
      <div className="space-y-8">
        {/* Three widget cards across the top, full width: portfolio · studies · starters.
            Portfolio is the substantive one; studies + starters size to their content. */}
        <div className="grid items-start gap-4 md:grid-cols-3">
          <PulseOverview />
          <PulseStudiesPanel />
          <PulseStartersPanel />
        </div>
        <PulseChecksDisclosure />
        <PulseLeadsPanel />
        <PulseMonitorsPanel />
        <PulseScanListView />
      </div>
    </AppShell>
  );
}
