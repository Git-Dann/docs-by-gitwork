import { AppShell } from "@/components/app-shell";
import { PulseChecksDisclosure } from "@/components/pulse/pulse-overview";
import { PulseTopCards } from "@/components/pulse/pulse-top-cards";
import { PulseScanListView } from "@/components/pulse/pulse-scan-list";
import { PulseLeadsPanel } from "@/components/pulse/pulse-leads-panel";
import { PulseMonitorsPanel } from "@/components/pulse/pulse-monitors-panel";
import { InternalOnly } from "@/components/internal-only";

export default function PulsePage() {
  return (
    <AppShell
      title="Pulse"
      subtitle="Validate and audit client projects — from prompt to production."
    >
      <div className="space-y-8">
        {/* ⚠️ Everything in this block is about GITWORK, not about the signed-in user:
            `01 // PORTFOLIO` is the average health of every scan in the workspace,
            `03 // SALES PAGE` and `04 // PUBLIC EMBED` are our own marketing config,
            and `Pulse leads` is a table of captured email addresses. A guest was
            seeing all four. The scan list and the check catalogue below are fine —
            the list is scoped server-side, and the catalogue is public on
            /production-ready anyway. */}
        <InternalOnly>
          <PulseTopCards />
        </InternalOnly>
        <PulseChecksDisclosure />
        <InternalOnly>
          <PulseMonitorsPanel />
        </InternalOnly>
        <PulseScanListView />
        {/* Compact table below the main scan list — mirrors its row/header grammar so a lead
            reads as "one more row of the same list", not a separate spacious card. */}
        <InternalOnly>
          <PulseLeadsPanel />
        </InternalOnly>
      </div>
    </AppShell>
  );
}
