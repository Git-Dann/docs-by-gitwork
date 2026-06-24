"use client";

import {
  ArrowRightIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useMemo } from "react";
import { useCodeClearCandidates, useCodeClearStats } from "@/hooks/use-codeclear";
import { useClientList } from "@/hooks/use-proposals";
import { cn } from "@/lib/format";
import { CodeClearTabs, WidgetCard } from "@/components/codeclear/codeclear-shared";
import { ClientAvatar } from "@/components/codeclear/client-avatar";

export function CodeClearOverview() {
  const statsQuery = useCodeClearStats();
  // The overview now derives from the full roster (pageSize 100 covers
  // the Gitwork team comfortably). The legacy hiring-pipeline stats —
  // pass rate, stage distribution, scan queue — are intentionally gone:
  // this product manages our internal devs and their client engagements,
  // not external candidates moving through interviews.
  const allCandidatesQuery = useCodeClearCandidates({
    page: 1,
    pageSize: 100,
    sortBy: "createdAt",
    sortDir: "desc",
  });
  const clientsQuery = useClientList();

  const stats = statsQuery.data;
  // Wrap the `?? []` fallbacks in useMemo so the downstream `useMemo`s
  // that depend on these arrays don't see a fresh reference every render
  // (eslint react-hooks/exhaustive-deps).
  const allCandidates = useMemo(
    () => allCandidatesQuery.data?.items ?? [],
    [allCandidatesQuery.data],
  );
  const allClients = useMemo(
    () => clientsQuery.data?.clients ?? [],
    [clientsQuery.data],
  );

  // ─── Derived metrics ──────────────────────────────────────────────────────
  const total = stats?.total ?? allCandidates.length;

  // Engaged = at least one active client placement. Complement is bench.
  const engaged = useMemo(
    () => allCandidates.filter((c) => c.currentClients.length > 0).length,
    [allCandidates],
  );
  const bench = Math.max(0, total - engaged);
  const engagedPct = total > 0 ? Math.round((engaged / total) * 100) : 0;

  // Calibre = mean of finalized score or live draft, across devs that have
  // a score at all. Skipping unscored devs keeps the average meaningful
  // when half the bench hasn't been validated yet.
  const calibreSamples = useMemo(
    () =>
      allCandidates
        .map((c) => c.score?.overallScore ?? c.scoreDraft?.overallScore ?? null)
        .filter((v): v is number => v != null),
    [allCandidates],
  );
  const avgCalibre =
    calibreSamples.length > 0
      ? Math.round(calibreSamples.reduce((sum, v) => sum + v, 0) / calibreSamples.length)
      : null;

  // Validated = at least one completed analysis run sitting on the dev.
  // Counts as "we have real signal on this person", not just hand-entered.
  const validated = useMemo(
    () =>
      allCandidates.filter(
        (c) => c.analysisState === "COMPLETE" || c.analysisState === "DRAFT_UPDATED",
      ).length,
    [allCandidates],
  );
  const validatedPct = total > 0 ? Math.round((validated / total) * 100) : 0;

  // Tier distribution — the bench mix. Drives how the team is composed.
  const tierMix = useMemo(() => {
    const counts: Record<"TIER_1" | "TIER_2" | "TIER_3", number> = {
      TIER_1: 0,
      TIER_2: 0,
      TIER_3: 0,
    };
    for (const c of allCandidates) {
      if (c.effectiveTier in counts) counts[c.effectiveTier as keyof typeof counts]++;
    }
    return counts;
  }, [allCandidates]);

  // Client coverage — how the team is deployed. Aggregate over all
  // currentClients on every dev (a dev can be on multiple), then sort.
  const clientCoverage = useMemo(() => {
    const byId = new Map<string, { id: string | null; name: string; count: number }>();
    for (const c of allCandidates) {
      for (const eng of c.currentClients) {
        const key = eng.id ?? `name:${eng.name}`;
        const existing = byId.get(key);
        if (existing) {
          existing.count++;
        } else {
          byId.set(key, { id: eng.id, name: eng.name, count: 1 });
        }
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.count - a.count);
  }, [allCandidates]);
  const clientLogoById = useMemo(
    () => new Map(allClients.map((c) => [c.id, c.logoUrl ?? null])),
    [allClients],
  );
  const clientSlugById = useMemo(
    () => new Map(allClients.map((c) => [c.id, c.slug])),
    [allClients],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <CodeClearTabs />
      </div>

      {/* Alerts — the "needs source validation" amber banner was removed
          June 2026 (felt like noise above the bento). Re-check overdue
          is kept because it's a genuine action item that only appears
          when something is actually overdue. */}
      {(stats?.recheckDue ?? 0) > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
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
        </div>
      ) : null}

      {/* Bento — reworked around the current product. The old
          CodeClear-era "hiring funnel" widgets (pass rate, stage
          distribution, scan queue) are gone — they don't reflect what
          this dashboard is for now. */}
      <div className="bento-grid">
        {/* Row 1 — four headline stats about the bench itself. */}
        <StatWidget
          number="01"
          name="ROSTER"
          value={String(total)}
          unit="DEVELOPERS"
          caption="On the Gitwork bench"
          className="col-span-12 md:col-span-6 xl:col-span-3"
        />
        <StatWidget
          number="02"
          name="ENGAGED"
          value={String(engaged)}
          unit={`OF ${total}`}
          caption={
            bench === 0
              ? "Whole team is placed"
              : `${bench} dev${bench > 1 ? "s" : ""} on the bench`
          }
          progress={engagedPct}
          className="col-span-12 md:col-span-6 xl:col-span-3"
        />
        <StatWidget
          number="03"
          name="AVG CALIBRE"
          value={avgCalibre != null ? String(avgCalibre) : "—"}
          unit="/ 100"
          caption={
            calibreSamples.length > 0
              ? `From ${calibreSamples.length} scored dev${calibreSamples.length > 1 ? "s" : ""}`
              : "No devs scored yet"
          }
          progress={avgCalibre ?? undefined}
          className="col-span-12 md:col-span-6 xl:col-span-3"
        />
        <StatWidget
          number="04"
          name="VALIDATED"
          value={String(validated)}
          unit={`OF ${total}`}
          caption={
            validated === 0
              ? "No live GitHub signal yet"
              : `${validatedPct}% have completed validation`
          }
          progress={validatedPct}
          className="col-span-12 md:col-span-6 xl:col-span-3"
        />

        {/* Row 2 — bench composition (tier mix) + how the team is
            deployed (clients with dev counts). */}
        <WidgetCard
          number="05"
          name="TIER MIX"
          className="col-span-12 xl:col-span-4"
          status={`${total} TOTAL`}
          statusTone="muted"
        >
          <div className="space-y-3">
            <TierRow
              label="Tier 1"
              caption="Senior · 80+"
              count={tierMix.TIER_1}
              total={total}
              tone="success"
            />
            <TierRow
              label="Tier 2"
              caption="Mid · 60-79"
              count={tierMix.TIER_2}
              total={total}
              tone="info"
            />
            <TierRow
              label="Tier 3"
              caption="Junior · under 60"
              count={tierMix.TIER_3}
              total={total}
              tone="muted"
            />
          </div>
        </WidgetCard>

        <WidgetCard
          number="06"
          name="CLIENT COVERAGE"
          className="col-span-12 xl:col-span-8"
          status={
            clientCoverage.length === 0
              ? "NONE"
              : `${clientCoverage.length} CLIENT${clientCoverage.length > 1 ? "S" : ""}`
          }
          statusTone={clientCoverage.length === 0 ? "muted" : "info"}
        >
          {clientCoverage.length === 0 ? (
            <div className="py-6 text-center text-sm text-[var(--text-4)]">
              No active placements. Assign devs from the Pipeline.
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {clientCoverage.slice(0, 8).map((entry) => {
                const logo = entry.id ? clientLogoById.get(entry.id) ?? null : null;
                const slug = entry.id ? clientSlugById.get(entry.id) ?? null : null;
                const inner = (
                  <>
                    <ClientAvatar name={entry.name} logoUrl={logo} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-1)]">
                        {entry.name}
                      </p>
                      <p className="widget-timestamp mt-0.5">
                        {entry.count} DEV{entry.count > 1 ? "S" : ""}
                      </p>
                    </div>
                    <span className="font-display text-[22px] font-normal leading-none tracking-[-0.02em] text-[var(--text-1)]">
                      {entry.count}
                    </span>
                  </>
                );
                return (
                  <li key={entry.id ?? entry.name}>
                    {slug ? (
                      <Link
                        href={`/app/portal/${slug}`}
                        className="flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 transition hover:border-[var(--brand-400)] hover:bg-[var(--surface-2)]"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </WidgetCard>
      </div>
    </div>
  );
}

function TierRow({
  label,
  caption,
  count,
  total,
  tone,
}: {
  label: string;
  caption: string;
  count: number;
  total: number;
  tone: "success" | "info" | "muted";
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barClass =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "info"
        ? "bg-sky-500"
        : "bg-[var(--text-4)]";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-1)]">{label}</p>
          <p className="widget-timestamp mt-0.5">{caption}</p>
        </div>
        <div className="text-right">
          <span className="font-display text-[24px] font-normal leading-none tracking-[-0.02em] text-[var(--text-1)]">
            {count}
          </span>
          <p className="widget-timestamp mt-0.5">{pct}% OF BENCH</p>
        </div>
      </div>
      <div className="widget-progress mt-2">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
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

