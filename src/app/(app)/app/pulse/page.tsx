import { AppShell } from "@/components/app-shell";
import { PulseChecksDisclosure } from "@/components/pulse/pulse-overview";
import { PulseTopCards } from "@/components/pulse/pulse-top-cards";
import { PulseScanListView } from "@/components/pulse/pulse-scan-list";
import { PulseLeadsPanel } from "@/components/pulse/pulse-leads-panel";
import { PulseMonitorsPanel } from "@/components/pulse/pulse-monitors-panel";

export default function PulsePage() {
  return (
    <AppShell
      title="Pulse"
      subtitle="Validate and audit client projects — from prompt to production."
    >
      <div className="space-y-8">
        {/* Three equal-height widget cards across the top (collapse-in-unison, collapsed by default). */}
        <PulseTopCards />
        <PulseChecksDisclosure />
        <PulseLeadsPanel />
        <PulseMonitorsPanel />
        <PulseScanListView />
      </div>
    </AppShell>
  );
}
