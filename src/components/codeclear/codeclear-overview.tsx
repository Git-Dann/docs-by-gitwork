"use client";

import {
  ArrowRightIcon,
  BeakerIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCodeClearCandidates, useCodeClearStats } from "@/hooks/use-codeclear";
import { cn } from "@/lib/format";
import { statusLabel } from "@/types/codeclear";
import {
  CodeClearStatusBadge,
  CodeClearTabs,
  WidgetCard,
} from "@/components/codeclear/codeclear-shared";

export function CodeClearOverview() {
  const statsQuery = useCodeClearStats();
  // Overview is the health/stats view — pull lightweight aggregates only.
  // The full roster lives in /app/codeclear/candidates.
  const allCandidatesQuery = useCodeClearCandidates({
    page: 1,
    pageSize: 100,
    sortBy: "createdAt",
    sortDir: "desc",
  });

  const stats = statsQuery.data;
  const allCandidates = allCandidatesQuery.data?.items ?? [];

  const stageTotal = (stats?.byStatus ?? []).reduce((sum, e) => sum + e.count, 0);

  const scanned = allCandidates.filter(
    (c) => c.analysisState === "COMPLETE" || c.analysisState === "DRAFT_UPDATED",
  ).length;
  const coveragePct =
    allCandidates.length > 0 ? Math.round((scanned / allCandidates.length) * 100) : 0;
  const scanning = allCandidates.filter((c) => c.analysisState === "RUNNING").length;
  const neverScanned = allCandidates.filter((c) => c.analysisState === "NEVER_RUN").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <CodeClearTabs />
      </div>

      {/* Alerts (kept above the bento — operational signal) */}
      {(neverScanned > 0 || (stats?.recheckDue ?? 0) > 0) ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {neverScanned > 0 ? (
            <Link
              href="/app/codeclear/pipeline"
              className="flex flex-1 items-center gap-3 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 transition hover:border-amber-300"
            >
              <BeakerIcon className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm font-semibold text-amber-700">
                {neverScanned} developer{neverScanned > 1 ? "s" : ""} still need source validation
                <span className="ml-1.5 font-normal text-amber-600">— go to pipeline to request more signal</span>
              </p>
              <ArrowRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-500" />
            </Link>
          ) : null}
          {(stats?.recheckDue ?? 0) > 0 ? (
            <Link
              href="/app/codeclear/candidates?status=RECHECK_DUE"
              className="flex flex-1 items-center gap-3 rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 transition hover:border-rose-300"
            >
              <ClockIcon className="h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-sm font-semibold text-rose-700">
                {stats!.recheckDue} re-check{stats!.recheckDue > 1 ? "s" : ""} overdue
                <span className="ml-1.5 font-normal text-rose-600">— review these developers</span>
              </p>
              <ArrowRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-rose-500" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Bento — numbered widget grid */}
      <div className="bento-grid">
        <StatWidget
          number="01"
          name="ROSTER"
          value={String(stats?.total ?? 0)}
          unit="DEVELOPERS"
          caption="Across all pipeline stages"
          className="col-span-12 md:col-span-6 xl:col-span-3"
        />
        <StatWidget
          number="02"
          name="AVG SCORE"
          value={stats?.avgThis != null ? String(stats.avgThis) : "—"}
          unit="/ 100 THIS MONTH"
          caption={
            stats?.avgLast != null ? `Last month ${stats.avgLast}/100` : "No prior month data yet"
          }
          className="col-span-12 md:col-span-6 xl:col-span-3"
        />
        <StatWidget
          number="03"
          name="PASS RATE"
          value={stats?.passRateThis != null ? String(stats.passRateThis) : "—"}
          unit="% AT 65+"
          caption="Verified developers this month"
          className="col-span-12 md:col-span-6 xl:col-span-3"
        />
        <StatWidget
          number="04"
          name="SIGNAL COVERAGE"
          value={String(coveragePct)}
          unit="% OF ROSTER"
          caption={
            scanning > 0
              ? `${scanning} live scan${scanning > 1 ? "s" : ""} in progress`
              : `${scanned} of ${allCandidates.length} scored from live signal`
          }
          progress={coveragePct}
          status={scanning > 0 ? "LIVE" : undefined}
          statusTone={scanning > 0 ? "info" : "muted"}
          className="col-span-12 md:col-span-6 xl:col-span-3"
        />

        <WidgetCard
          number="05"
          name="QUEUE STATUS"
          className="col-span-12 xl:col-span-4"
          status={scanning > 0 ? "ACTIVE" : "IDLE"}
          statusTone={scanning > 0 ? "info" : "muted"}
        >
          <div className="grid grid-cols-2 gap-3">
            <QueueStat label="LIVE SCANS" value={String(scanning)} tone="info" />
            <QueueStat label="NEVER SCANNED" value={String(neverScanned)} tone={neverScanned > 0 ? "warning" : "muted"} />
            <QueueStat label="RE-CHECK DUE" value={String(stats?.recheckDue ?? 0)} tone={(stats?.recheckDue ?? 0) > 0 ? "danger" : "muted"} />
            <QueueStat label="COMPLETE" value={String(scanned)} tone="success" />
          </div>
        </WidgetCard>

        {/* Stage distribution — pairs with Queue Status above on the same row. */}
        <WidgetCard
          number="06"
          name="STAGE DISTRIBUTION"
          className="col-span-12 xl:col-span-8"
          status={`${stageTotal} TOTAL`}
          statusTone="muted"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(stats?.byStatus ?? []).map((entry) => {
              const pct = stageTotal > 0 ? (entry.count / stageTotal) * 100 : 0;
              return (
                <div
                  key={entry.status}
                  className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4"
                >
                  <CodeClearStatusBadge status={entry.status} />
                  <p className="mt-4 font-display text-[36px] font-normal leading-[1.1] tracking-[-0.03em] text-[var(--text-1)]">
                    {entry.count}
                  </p>
                  <p className="widget-data-label mt-1">{statusLabel(entry.status)}</p>
                  <div className="widget-progress mt-3">
                    <div className="widget-progress__fill" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="widget-timestamp mt-1.5">{pct.toFixed(0)}% OF PIPELINE</p>
                </div>
              );
            })}
            {(stats?.byStatus ?? []).length === 0 ? (
              <div className="col-span-full py-6 text-center text-sm text-[var(--text-4)]">
                No developers yet.
              </div>
            ) : null}
          </div>
        </WidgetCard>

      </div>
    </div>
  );
}

function StatWidget({
  number,
  name,
  value,
  unit,
  caption,
  progress,
  status,
  statusTone,
  className,
}: {
  number: string;
  name: string;
  value: string;
  unit: string;
  caption?: string;
  progress?: number;
  status?: string;
  statusTone?: "info" | "success" | "warning" | "danger" | "muted";
  className?: string;
}) {
  return (
    <WidgetCard
      number={number}
      name={name}
      status={status}
      statusTone={statusTone}
      className={className}
    >
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="widget-stat">{value}</span>
          <span className="widget-data-label">{unit}</span>
        </div>
        {typeof progress === "number" ? (
          <div className="widget-progress">
            <div
              className="widget-progress__fill"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        ) : null}
        {caption ? <p className="text-sm text-[var(--text-4)]">{caption}</p> : null}
      </div>
    </WidgetCard>
  );
}

function QueueStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "info" | "success" | "warning" | "danger" | "muted";
}) {
  const dot =
    tone === "success"
      ? "widget-status-dot--success"
      : tone === "warning"
        ? "widget-status-dot--warning"
        : tone === "danger"
          ? "widget-status-dot--danger"
          : tone === "info"
            ? "widget-status-dot--info"
            : "";

  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={cn("widget-status-dot", dot)} aria-hidden />
        <span className="widget-data-label">{label}</span>
      </div>
      <p className="mt-2 font-display text-[32px] font-normal leading-[1.1] tracking-[-0.03em] text-[var(--text-1)]">
        {value}
      </p>
    </div>
  );
}
