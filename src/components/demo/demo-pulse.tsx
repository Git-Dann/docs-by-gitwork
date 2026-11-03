"use client";

/**
 * Standalone Foundry Pulse demo (`/demo/pulse`). Renders the real Pulse components for a set
 * of sample scans, fed by the demo fetch interceptor, under the same Pulse nav as the app
 * (with `/demo/pulse` as its base). Clicking a scan opens its report at
 * `/demo/pulse/[scanId]` (a real /app link the reroute maps). No auth, no database.
 * See `src/lib/demo/dev-demo-data.ts`.
 */

import { PulseScanListView } from "@/components/pulse/pulse-scan-list";
import { PulseProjectsView } from "@/components/pulse/pulse-projects";
import { PulseChecksDisclosure } from "@/components/pulse/pulse-overview";
import { DemoShell } from "@/components/demo/demo-shell";
import { DemoPulseNav } from "@/components/demo/demo-pulse-nav";

export function DemoPulse() {
  return (
    <DemoShell
      active="Pulse"
      title="Pulse"
      subtitle="Validate and audit client projects, from prompt to production."
    >
      <DemoPulseNav />
      <div className="space-y-6">
        <PulseProjectsView allScans={<PulseScanListView />} />
        <PulseChecksDisclosure />
      </div>
    </DemoShell>
  );
}
