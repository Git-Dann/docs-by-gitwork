"use client";

/**
 * Standalone Foundry Pulse demo (`/demo/pulse`). Renders the real
 * `PulseScanListView` for a set of sample scans, fed by the demo fetch
 * interceptor. Clicking a scan opens its report at `/demo/pulse/[scanId]`
 * (a real /app link the reroute maps). No auth, no database.
 * See `src/lib/demo/dev-demo-data.ts`.
 */

import { PulseScanListView } from "@/components/pulse/pulse-scan-list";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoPulse() {
  return (
    <DemoShell
      active="Pulse"
      title="Pulse"
      subtitle="Validate and audit client projects — from prompt to production."
    >
      <PulseScanListView />
    </DemoShell>
  );
}
