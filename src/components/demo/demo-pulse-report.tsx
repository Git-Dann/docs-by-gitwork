"use client";

/**
 * Standalone Foundry Pulse report demo (`/demo/pulse/[scanId]`). Fetches the
 * seeded scan via the demo interceptor and renders the real `PulseScanResults`
 * report — the same component the live scan-detail page uses for a COMPLETED
 * scan. No auth, no database. See `src/lib/demo/dev-demo-data.ts`.
 */

import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { usePulseScan } from "@/hooks/use-pulse";
import { PulseScanResults } from "@/components/pulse/pulse-scan-results";
import { PulseScanStatusBadge } from "@/components/pulse/pulse-shared";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoPulseReport({ scanId }: { scanId: string }) {
  const { data } = usePulseScan(scanId);
  const scan = data?.scan;

  return (
    <DemoShell
      active="Pulse"
      title={scan?.projectName ?? "Pulse report"}
      subtitle="AI project validation — checks, gaps and a fix roadmap."
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/demo/pulse"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All scans
          </Link>
          {scan ? <PulseScanStatusBadge status={scan.status} /> : null}
        </div>

        {scan ? (
          <PulseScanResults scan={scan} />
        ) : (
          <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
        )}
      </div>
    </DemoShell>
  );
}
