"use client";

import Link from "next/link";
import { cn } from "@/lib/format";
import { useForemanReport, type ForemanFinding, type Severity, type Trend } from "@/hooks/use-foreman";
import { EditorialRow, Stamp, DeskEmpty, DeskSkeleton, RevealList } from "./desk-shared";

/**
 * The Desk "Delivery watch" panel — Foreman's latest daily audit, admin-only. Reads the frozen
 * report the agent persisted at 09:00 (or on a manual run). Each risk carries the evidence that
 * triggered it and a suggested fix; a separate "Blind spots" reveal calls out what Foreman can't
 * yet see (missing dates/timelines). Pure read — mirrors the aggregator ethos of the rest of the Desk.
 */
export function DeskForeman({ enabled = true }: { enabled?: boolean }) {
  const report = useForemanReport(enabled);

  const findings = report.data?.findings ?? [];
  const risks = findings.filter((f) => f.category !== "blindspot");
  const blindSpots = findings.filter((f) => f.category === "blindspot");
  const narrative = report.data?.narrative ?? null;
  const stats = report.data?.stats ?? null;

  const caption = report.data
    ? `Audited ${stats?.clientsScanned ?? 0} clients · ${stats?.developersScanned ?? 0} devs · ${fmtWhen(report.data.generatedAt)}`
    : "Runs every morning at 09:00.";

  return (
    <EditorialRow
      title="Delivery watch"
      caption={caption}
      stamp={<Stamp label="Foreman" href="/app/settings/foreman" />}
    >
      {report.isPending ? (
        <DeskSkeleton />
      ) : !report.data ? (
        <DeskEmpty>Foreman hasn&apos;t run yet — its first daily audit lands at 09:00.</DeskEmpty>
      ) : risks.length === 0 && blindSpots.length === 0 ? (
        <DeskEmpty>All projects on track — nothing overdue or slipping today.</DeskEmpty>
      ) : (
        <div className="space-y-4">
          {narrative?.summary ? (
            <p className="text-sm leading-relaxed text-[var(--text-2)]">{narrative.summary}</p>
          ) : null}

          {risks.length === 0 ? (
            <p className="text-sm text-[var(--text-3)]">
              No overdue or slipping work — only blind spots to tidy up below.
            </p>
          ) : (
            <RevealList items={risks} initial={5} renderItem={(f) => <FindingCard key={f.key} f={f} />} />
          )}

          {blindSpots.length > 0 ? (
            <details className="group rounded-[8px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] px-3.5 py-2.5">
              <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[1px] text-[var(--text-4)] [font-family:var(--font-mono)]">
                Blind spots ({blindSpots.length}) — what Foreman can&apos;t judge yet
              </summary>
              <div className="mt-2.5 space-y-2">
                {blindSpots.map((f) => (
                  <BlindSpotRow key={f.key} f={f} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </EditorialRow>
  );
}

function FindingCard({ f }: { f: ForemanFinding }) {
  const body = (
    <div
      className={cn(
        "rounded-[8px] border bg-[var(--surface-0)] px-3.5 py-3 transition",
        f.href ? "hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]" : "",
        sevBorder(f.severity),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <SevChip severity={f.severity} />
          <span className="min-w-0 flex-1 text-sm font-medium text-[var(--text-1)]">{f.headline}</span>
        </div>
        <TrendBadge trend={f.trend} metric={f.metric} previous={f.previousMetric} />
      </div>

      {f.evidence.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {f.evidence.map((e, i) => (
            <li key={i} className="text-xs text-[var(--text-3)]">
              · {e}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 border-t border-[var(--border-2)] pt-2 text-xs leading-relaxed text-[var(--text-2)]">
        <span className="text-[10px] uppercase tracking-[1px] text-[var(--brand-700)] [font-family:var(--font-mono)]">
          Fix{" "}
        </span>
        {f.recommendation}
      </p>
    </div>
  );

  return f.href ? (
    <Link href={f.href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function BlindSpotRow({ f }: { f: ForemanFinding }) {
  return (
    <div className="text-xs text-[var(--text-3)]">
      <span className="font-medium text-[var(--text-2)]">{f.headline}</span>
      <span className="block text-[var(--text-4)]">{f.recommendation}</span>
    </div>
  );
}

function SevChip({ severity }: { severity: Severity }) {
  const label = severity === "critical" ? "Critical" : severity === "warn" ? "At risk" : "Watch";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.6px]",
        severity === "critical"
          ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          : severity === "warn"
            ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
            : "bg-[var(--surface-1)] text-[var(--text-4)]",
      )}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {label}
    </span>
  );
}

function TrendBadge({ trend, metric, previous }: { trend: Trend; metric: number; previous: number | null }) {
  if (trend === "new") {
    return (
      <span
        className="shrink-0 rounded-[5px] bg-[var(--surface-brand)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-[var(--brand-700)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        New
      </span>
    );
  }
  if (trend === "worsening") {
    return (
      <span className="shrink-0 text-[11px] font-semibold text-red-600 dark:text-red-300" style={{ fontFamily: "var(--font-mono)" }}>
        ↑ {previous ?? "?"}→{metric}
      </span>
    );
  }
  if (trend === "improving") {
    return (
      <span
        className="shrink-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        ↓ {previous ?? "?"}→{metric}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[11px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
      steady
    </span>
  );
}

function sevBorder(severity: Severity): string {
  return severity === "critical"
    ? "border-red-200 dark:border-red-500/30"
    : severity === "warn"
      ? "border-amber-200 dark:border-amber-500/30"
      : "border-[var(--border-2)]";
}

/** "2h ago" / "today 09:00" compact freshness label. */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
