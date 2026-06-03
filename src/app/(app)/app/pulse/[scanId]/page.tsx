"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { AppShell } from "@/components/app-shell";
import { usePulseScan, usePulseScanStream, useCancelPulseScan, useRetryPulseScan } from "@/hooks/use-pulse";
import { PulseScanResults } from "@/components/pulse/pulse-scan-results";
import { PulseScanStatusBadge } from "@/components/pulse/pulse-shared";
import { Button } from "@/components/ui/button";

// Rough expected check volume per input type — used only as the denominator for
// the live progress bar during the deterministic CHECKS phase. Approximate is
// fine: the authoritative phase signal is `checksCompletedAt` flipping to the AI
// phase. Clamped so the bar never claims 100% before checks are actually done.
const EXPECTED_CHECKS: Record<string, number> = { URL: 500, GITHUB_REPO: 240, FREE_TEXT: 1 };

// Time-eased fill for the AI phase, which has no granular progress signal.
function easeOut(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - x, 2.5);
}

function ScanRunningState({
  startedAt,
  scanId,
  liveChecks,
  checksCompletedAt,
  inputType,
}: {
  startedAt: string;
  scanId: string;
  liveChecks: { category: string; status: string }[];
  checksCompletedAt: string | null;
  inputType: string;
}) {
  const { mutate: cancel, isPending: cancelling } = useCancelPulseScan();
  const [elapsedSec, setElapsedSec] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const origin = new Date(startedAt).getTime();
    function tick() {
      const t = Date.now();
      setNow(t);
      setElapsedSec(Math.floor((t - origin) / 1000));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [startedAt]);

  const checksDone = Boolean(checksCompletedAt);
  const checksCount = liveChecks.length;
  const expected = EXPECTED_CHECKS[inputType] ?? 400;

  // CHECKS phase: real progress = checks persisted / expected, mapped to 0–74%.
  // AI phase: 74% → ~99% time-eased over ~120s (AI gives no progress signal).
  let pct: number;
  if (checksDone) {
    const aiMs = now - new Date(checksCompletedAt!).getTime();
    pct = 74 + easeOut(aiMs / 120_000) * 25;
  } else {
    pct = Math.min(checksCount / expected, 0.98) * 74;
  }
  pct = Math.min(pct, 99);

  const stageLabel = checksDone
    ? "AI analysis in progress"
    : checksCount > 0
      ? `Running automated checks · ${checksCount} done`
      : "Connecting & fetching page";
  const isLong = elapsedSec > 75;

  // Build per-category summary from live checks
  const categoryMap = new Map<string, { pass: number; warn: number; fail: number }>();
  for (const c of liveChecks) {
    const s = categoryMap.get(c.category) ?? { pass: 0, warn: 0, fail: 0 };
    if (c.status === "PASS") s.pass++;
    else if (c.status === "WARN") s.warn++;
    else if (c.status === "FAIL") s.fail++;
    categoryMap.set(c.category, s);
  }
  const categories = Array.from(categoryMap.entries()).filter(([, s]) => s.pass + s.warn + s.fail > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-full max-w-sm space-y-5">
          <div className="mx-auto flex h-[100px] w-[100px] items-center justify-center rounded-full border-4 border-[var(--border-2)] bg-[var(--surface-1)]">
            <span className="text-2xl font-bold tabular-nums text-[var(--text-3)]">
              {Math.round(pct)}%
            </span>
          </div>

          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">{stageLabel}…</p>
            <p className="mt-0.5 text-xs tabular-nums text-[var(--text-4)]">{elapsedSec}s elapsed</p>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--brand-600)] transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Two-phase indicator: deterministic checks → AI synthesis */}
          <div className="flex items-center justify-center gap-2 text-[11px] font-medium">
            <span className={checksDone ? "text-emerald-600" : "text-[var(--brand-600)]"}>
              {checksDone ? "✓ Checks complete" : "● Running checks"}
            </span>
            <span className="text-[var(--border-2)]">→</span>
            <span className={checksDone ? "text-[var(--brand-600)]" : "text-[var(--text-4)]"}>
              {checksDone ? "● AI analysis" : "AI analysis"}
            </span>
          </div>

          {isLong && (
            <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {checksDone
                ? "AI synthesis can take up to a couple of minutes — your checks and score below are final."
                : "Taking longer than usual — complex sites or large repos can take a little longer."}
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

      {/* Live check preview — fills in incrementally as each wave lands */}
      {categories.length > 0 && (
        <div className="rounded-[10px] border border-[var(--border-2)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">
            {checksDone ? "All checks complete — AI is writing your report" : "Checks streaming in live…"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map(([category, s]) => {
              const total = s.pass + s.warn + s.fail;
              const score = Math.round(((s.pass + s.warn * 0.5) / total) * 100);
              const tone = score >= 75 ? "border-emerald-200 bg-emerald-50" : score >= 50 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
              return (
                <div key={category} className={`flex items-center justify-between rounded-[10px] border px-3 py-2 ${tone}`}>
                  <span className="text-xs font-medium text-[var(--text-2)]">{category}</span>
                  <div className="flex items-center gap-2 text-[10px] font-semibold">
                    {s.pass > 0 && <span className="text-emerald-700">{s.pass}P</span>}
                    {s.warn > 0 && <span className="text-amber-700">{s.warn}W</span>}
                    {s.fail > 0 && <span className="text-red-700">{s.fail}F</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
    <div className={`rounded-[10px] border p-6 ${cancelled ? "border-[var(--border-2)] bg-[var(--surface-1)]" : "border-red-200 bg-red-50"}`}>
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
              <div key={i} className="h-20 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
            ))}
          </div>
        )}

        {!isLoading && scan?.status === "RUNNING" && (
          <ScanRunningState
            startedAt={scan.startedAt}
            scanId={scanId}
            liveChecks={scan.checks}
            checksCompletedAt={scan.checksCompletedAt}
            inputType={scan.inputType}
          />
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
