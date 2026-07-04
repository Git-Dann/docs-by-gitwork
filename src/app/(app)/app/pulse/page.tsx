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
        {/* Three equal-height widget cards across the top: portfolio · studies · starters.
            Constrained to ~2/3 width so the summary row doesn't stretch full-bleed. */}
        <div className="grid max-w-4xl items-stretch gap-3 md:grid-cols-3">
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
