"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { AppShell } from "@/components/app-shell";
import { usePulseScan, usePulseScanStream, useCancelPulseScan, useRetryPulseScan } from "@/hooks/use-pulse";
import { PulseScanResults } from "@/components/pulse/pulse-scan-results";
import { PulseScanStatusBadge } from "@/components/pulse/pulse-shared";
import { Button } from "@/components/ui/button";

const STAGES = [
  { label: "Connecting to project",        from: 0  },
  { label: "Fetching page & headers",      from: 8  },
  { label: "Running automated checks",     from: 22 },
  { label: "Detecting tech stack",         from: 45 },
  { label: "Measuring Core Web Vitals",    from: 55 },
  { label: "AI analysis in progress",      from: 68 },
  { label: "Finalising report",            from: 92 },
];

function currentStage(pct: number) {
  return STAGES.slice().reverse().find((s) => pct >= s.from) ?? STAGES[0];
}

function easedProgress(elapsedMs: number, capPct = 96, totalMs = 60000): number {
  const t = Math.min(elapsedMs / totalMs, 1);
  const eased = 1 - Math.pow(1 - t, 2.5);
  return Math.min(eased * capPct, capPct);
}

function ScanRunningState({ startedAt, scanId }: { startedAt: string; scanId: string }) {
  const { mutate: cancel, isPending: cancelling } = useCancelPulseScan();
  const [pct, setPct] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const origin = new Date(startedAt).getTime();
    function tick() {
      const elapsed = Date.now() - origin;
      setElapsedSec(Math.floor(elapsed / 1000));
      setPct(easedProgress(elapsed));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [startedAt]);

  const stage = currentStage(pct);
  const isLong = elapsedSec > 60;

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-full max-w-sm space-y-5">
        <div className="mx-auto flex h-[100px] w-[100px] items-center justify-center rounded-full border-4 border-[var(--border-2)] bg-[var(--surface-1)]">
          <span className="text-2xl font-bold tabular-nums text-[var(--text-3)]">
            {Math.round(pct)}%
          </span>
        </div>

        <div>
          <p className="text-sm font-semibold text-[var(--text-1)]">{stage.label}…</p>
          <p className="mt-0.5 text-xs tabular-nums text-[var(--text-4)]">{elapsedSec}s elapsed</p>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--brand-600)] transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex justify-between px-0.5">
          {STAGES.map((s) => (
            <div
              key={s.label}
              title={s.label}
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                pct >= s.from ? "bg-[var(--brand-600)]" : "bg-[var(--border-2)]"
              }`}
            />
          ))}
        </div>

        {isLong && (
          <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Taking longer than usual — complex sites or large repos can take up to 90 seconds.
          </p>
        )}

        <Button
          variant="tertiary"
          size="sm"
          onClick={() => cancel(scanId)}
          loading={cancelling}
        >
          Cancel scan
        </Button>
      </div>
    </div>
  );
}

function ScanFailedState({
  scanId,
  errorMessage,
  errorCode,
}: {
  scanId: string;
  errorMessage: string | null;
  errorCode: string | null;
}) {
  const cancelled = errorCode === "USER_CANCELLED";
  const { mutate: retry, isPending: retrying } = useRetryPulseScan();

  return (
    <div className={`rounded-[14px] border p-6 ${cancelled ? "border-[var(--border-2)] bg-[var(--surface-1)]" : "border-red-200 bg-red-50"}`}>
      <p className={`text-sm font-medium ${cancelled ? "text-[var(--text-1)]" : "text-red-800"}`}>
        {cancelled ? "Scan cancelled" : "Scan failed"}
      </p>
      <p className={`mt-2 text-sm ${cancelled ? "text-[var(--text-3)]" : "text-red-700"}`}>
        {cancelled ? "You cancelled this scan." : (errorMessage ?? "An unexpected error occurred.")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!cancelled && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => retry(scanId)}
            loading={retrying}
          >
            Retry scan
          </Button>
        )}
        <Link href="/app/pulse/new">
          <Button variant="tertiary" size="sm">New scan</Button>
        </Link>
      </div>
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
  // SSE stream — active only while RUNNING; falls back to 5s polling on error
  usePulseScanStream(scanId, scan?.status === "RUNNING");

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

        {!isLoading && scan?.status === "RUNNING" && (
          <ScanRunningState startedAt={scan.startedAt} scanId={scanId} />
        )}

        {!isLoading && scan?.status === "FAILED" && (
          <ScanFailedState scanId={scanId} errorMessage={scan.errorMessage} errorCode={scan.errorCode} />
        )}

        {!isLoading && scan?.status === "COMPLETED" && (
          <PulseScanResults scan={scan} />
        )}
      </div>
    </AppShell>
  );
}
