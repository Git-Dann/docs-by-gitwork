"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { AppShell } from "@/components/app-shell";
import { usePulseScan, usePulseScanStream, useCancelPulseScan, useRetryPulseScan } from "@/hooks/use-pulse";
import { PulseScanResults } from "@/components/pulse/pulse-scan-results";
import { PulseScanStatusBadge } from "@/components/pulse/pulse-shared";
import { Button } from "@/components/ui/button";

// Time-eased fill for the AI phase, which has no granular progress signal.
function easeOut(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - x, 2.5);
}

function scoreTone(score: number): string {
  if (score >= 75) return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (score >= 50) return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300";
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300";
}

// One step in the two-phase scan progress (Automated checks → AI analysis).
function ProgressStep({
  index,
  title,
  state,
  detail,
  bar,
  children,
}: {
  index: number;
  title: string;
  state: "pending" | "active" | "done";
  detail: string;
  bar?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={
          state === "done"
            ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white"
            : state === "active"
              ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--brand-500)] text-xs font-bold tabular-nums text-[var(--brand-600)]"
              : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--border-2)] text-xs font-bold tabular-nums text-[var(--text-4)]"
        }
      >
        {state === "done" ? "✓" : index}
      </div>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className={state === "pending" ? "text-sm font-semibold text-[var(--text-4)]" : "text-sm font-semibold text-[var(--text-1)]"}>
            {title}
          </p>
          {state === "active" && <span className="text-xs text-[var(--brand-600)]">In progress</span>}
        </div>
        <p className="text-xs text-[var(--text-4)]">{detail}</p>
        {bar}
        {children}
      </div>
    </div>
  );
}

function ScanRunningState({
  startedAt,
  scanId,
  liveChecks,
  checksCompletedAt,
  healthScore,
}: {
  startedAt: string;
  scanId: string;
  liveChecks: { category: string; status: string }[];
  checksCompletedAt: string | null;
  healthScore: number | null;
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

  // AI phase has no granular signal — ease 0→99% over ~120s, scoped to step 2 only.
  const aiMs = checksDone ? now - new Date(checksCompletedAt!).getTime() : 0;
  const aiPct = Math.min(easeOut(aiMs / 120_000) * 99, 99);
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
      <div className="mx-auto w-full max-w-md space-y-6 py-8">
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--text-1)]">
            {checksDone ? "Writing your report" : "Scanning your project"}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-[var(--text-4)]">{elapsedSec}s elapsed</p>
        </div>

        {/* Step 1 — Automated checks (fast, deterministic) */}
        <ProgressStep
          index={1}
          title="Automated checks"
          state={checksDone ? "done" : "active"}
          detail={
            checksDone
              ? `${checksCount} checks complete`
              : checksCount > 0
                ? `${checksCount} checks run so far…`
                : "Connecting & fetching the project…"
          }
          bar={
            checksDone ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                <div className="h-full w-full rounded-full bg-emerald-500" />
              </div>
            ) : (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="h-full w-full animate-pulse rounded-full bg-[var(--brand-500)]" />
              </div>
            )
          }
        >
          {checksDone && healthScore !== null && (
            <div className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${scoreTone(healthScore)}`}>
              Health score {healthScore}/100
            </div>
          )}
        </ProgressStep>

        {/* Step 2 — AI analysis (the long pole) */}
        <ProgressStep
          index={2}
          title="AI analysis"
          state={checksDone ? "active" : "pending"}
          detail={
            checksDone
              ? "Writing insights, gaps & recommendations…"
              : "Starts once the checks are in"
          }
          bar={
            checksDone ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--brand-600)] transition-all duration-300 ease-out"
                  style={{ width: `${aiPct}%` }}
                />
              </div>
            ) : undefined
          }
        />

        {isLong && checksDone && (
          <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
            AI synthesis can take a couple of minutes — your checks and score above are already final.
          </p>
        )}

        <div className="flex justify-center">
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
              const tone = score >= 75 ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/30" : score >= 50 ? "border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30" : "border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/30";
              return (
                <div key={category} className={`flex items-center justify-between rounded-[10px] border px-3 py-2 ${tone}`}>
                  <span className="text-xs font-medium text-[var(--text-2)]">{category}</span>
                  <div className="flex items-center gap-2 text-[10px] font-semibold">
                    {s.pass > 0 && <span className="text-emerald-700 dark:text-emerald-400">{s.pass}P</span>}
                    {s.warn > 0 && <span className="text-amber-700 dark:text-amber-400">{s.warn}W</span>}
                    {s.fail > 0 && <span className="text-red-700 dark:text-red-400">{s.fail}F</span>}
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
    <div className={`rounded-[10px] border p-6 ${cancelled ? "border-[var(--border-2)] bg-[var(--surface-1)]" : "border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/30"}`}>
      <p className={`text-sm font-medium ${cancelled ? "text-[var(--text-1)]" : "text-red-800 dark:text-red-300"}`}>
        {cancelled ? "Scan cancelled" : "Scan failed"}
      </p>
      <p className={`mt-2 text-sm ${cancelled ? "text-[var(--text-3)]" : "text-red-700 dark:text-red-400"}`}>
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
      hideContentHeader={true}
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
            healthScore={scan.healthScore}
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
