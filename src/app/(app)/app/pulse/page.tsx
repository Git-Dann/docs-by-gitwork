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
        {/* Four equal-height widget cards across the top (collapse-in-unison, collapsed by default). */}
        <PulseTopCards />
        <PulseChecksDisclosure />
        <PulseMonitorsPanel />
        <PulseScanListView />
        {/* Compact table below the main scan list — mirrors its row/header grammar so a lead
            reads as "one more row of the same list", not a separate spacious card. */}
        <PulseLeadsPanel />
      </div>
    </AppShell>
  );
}
