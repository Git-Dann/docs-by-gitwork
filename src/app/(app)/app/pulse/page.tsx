import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PulseChecksDisclosure } from "@/components/pulse/pulse-overview";
import { PulseTopCards } from "@/components/pulse/pulse-top-cards";
import { PulseScanListView } from "@/components/pulse/pulse-scan-list";
import { PulseProjectsView } from "@/components/pulse/pulse-projects";
import { PulseLeadsPanel } from "@/components/pulse/pulse-leads-panel";
import { PulseMonitorsPanel } from "@/components/pulse/pulse-monitors-panel";
import { InternalOnly } from "@/components/internal-only";
import { pulseCapabilityCounts } from "@/server/pulse-capabilities";

export default function PulsePage() {
  const { checks, areas } = pulseCapabilityCounts();
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
          <PulseTopCards checks={checks} areas={areas.length} />
        </InternalOnly>
        <Link
          href="/app/pulse/portfolio"
          className="flex items-center justify-between gap-4 rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] px-4 py-3 hover:border-[var(--brand-600)]"
        >
          <span>
            <span className="block font-mono text-[10px] uppercase tracking-wide text-[var(--text-4)]">Code portfolio</span>
            <span className="block text-sm text-[var(--text-2)]">Every measured repository side by side: debt, vulnerable libraries, import cycles, and where the next days do the most good.</span>
          </span>
          <span aria-hidden className="font-mono text-sm text-[var(--brand-600)]">→</span>
        </Link>
        <PulseChecksDisclosure />
        <InternalOnly>
          <PulseMonitorsPanel />
        </InternalOnly>
        {/* By project by default (one row per site/repo, trend, what needs a look); the flat
            list of every scan is one click away. */}
        <PulseProjectsView allScans={<PulseScanListView />} />
        {/* Compact table below the main scan list — mirrors its row/header grammar so a lead
            reads as "one more row of the same list", not a separate spacious card. */}
        <InternalOnly>
          <PulseLeadsPanel />
        </InternalOnly>
      </div>
    </AppShell>
  );
}
