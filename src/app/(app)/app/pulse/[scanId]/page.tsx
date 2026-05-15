"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeftIcon, SignalIcon } from "@heroicons/react/24/outline";
import { AppShell } from "@/components/app-shell";
import { usePulseScan } from "@/hooks/use-pulse";
import { PulseScanResults } from "@/components/pulse/pulse-scan-results";
import { PulseScanStatusBadge } from "@/components/pulse/pulse-shared";

function ScanRunningState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-2)] bg-[var(--surface-1)]">
        <SignalIcon className="h-7 w-7 animate-pulse text-[var(--brand-600)]" />
      </div>
      <p className="text-sm font-medium text-[var(--text-1)]">Scan in progress…</p>
      <p className="mt-1 text-sm text-[var(--text-3)]">
        Checking URLs, repos, and running AI analysis. This takes 15–30 seconds.
      </p>
    </div>
  );
}

function ScanFailedState({ errorMessage }: { errorMessage: string | null }) {
  return (
    <div className="rounded-[14px] border border-red-200 bg-red-50 p-6">
      <p className="text-sm font-medium text-red-800">Scan failed</p>
      <p className="mt-1 text-sm text-red-700">{errorMessage ?? "An unexpected error occurred."}</p>
    </div>
  );
}

export default function PulseScanDetailPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = use(params);
  const { data, isLoading } = usePulseScan(scanId);

  const scan = data?.scan;

  return (
    <AppShell
      title={scan?.projectName ?? "Pulse scan"}
      subtitle={scan ? undefined : "Loading…"}
      hideContentHeader={false}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/app/pulse"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All scans
          </Link>
          {scan && <PulseScanStatusBadge status={scan.status} />}
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[12px] bg-[var(--surface-1)]" />
            ))}
          </div>
        )}

        {!isLoading && scan?.status === "RUNNING" && <ScanRunningState />}

        {!isLoading && scan?.status === "FAILED" && (
          <ScanFailedState errorMessage={scan.errorMessage} />
        )}

        {!isLoading && scan?.status === "COMPLETED" && (
          <PulseScanResults scan={scan} />
        )}
      </div>
    </AppShell>
  );
}
