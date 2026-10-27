import { AppShell } from "@/components/app-shell";
import { PulseChecksDisclosure } from "@/components/pulse/pulse-overview";
import { PulseNav } from "@/components/pulse/pulse-nav";
import { PulseScanListView } from "@/components/pulse/pulse-scan-list";
import { PulseProjectsView } from "@/components/pulse/pulse-projects";

/**
 * Pulse → Projects. One row per site/repo, with the flat list of every scan one click away.
 *
 * This page used to stack everything Pulse has. Each concern now has its own page in the
 * Pulse nav (src/lib/pulse-nav.ts): Monitors, Portfolio (with the workspace scan health),
 * Compare, and Growth (our sales page, public embed, the About Pulse share card and the
 * leads table). The internal-only ones keep the gating they had here — see each page.
 */
export default function PulsePage() {
  return (
    <AppShell
      title="Pulse"
      subtitle="Validate and audit client projects, from prompt to production."
    >
      <PulseNav />
      <div className="space-y-6">
        <PulseProjectsView allScans={<PulseScanListView />} />
        <PulseChecksDisclosure />
      </div>
    </AppShell>
  );
}
