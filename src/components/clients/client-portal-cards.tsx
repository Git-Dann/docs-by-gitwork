"use client";

/**
 * Two compact cards on the Portal client page (src/components/clients/client-detail.tsx): Pulse
 * scans and research studies. Both used to be wide tables that, with one row, left most of their
 * card empty. Now each leads with what matters (the latest score, the latest study) and lists the
 * rest underneath, and an empty card is one line with one action.
 */

import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, BeakerIcon, PlusIcon, SignalIcon } from "@heroicons/react/24/outline";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { useCountUp } from "@/components/ui/motion/use-count-up";
import { cn, formatDate } from "@/lib/format";
import type { ClientPulseScanSummary, ClientStudySummary } from "@/types/client";

const MONO = "var(--font-mono)";

/** Same bands and words as the report's score ring (HealthScoreRing, document-cover.tsx). */
export function pulseScoreWord(score: number): { word: string; tone: string } {
  if (score >= 90) return { word: "Excellent", tone: "text-emerald-700" };
  if (score >= 75) return { word: "Good", tone: "text-emerald-700" };
  if (score >= 50) return { word: "Needs work", tone: "text-amber-700" };
  return { word: "At risk", tone: "text-red-700" };
}

function Header({ number, label, right }: { number: string; label: string; right?: React.ReactNode }) {
  return (
    <div className="widget-header">
      <span className="widget-header__label">
        <span className="widget-header__label--number">{number}</span>
        {` // ${label}`}
      </span>
      {right}
    </div>
  );
}

function LatestScore({ scan }: { scan: ClientPulseScanSummary }) {
  const shown = useCountUp(scan.healthScore);
  const word = scan.healthScore !== null ? pulseScoreWord(scan.healthScore) : null;
  return (
    <Link
      href={`/app/pulse/${scan.id}`}
      className="group flex items-center gap-4 rounded-[8px] border border-[var(--border-2)] p-3 transition hover:border-[var(--brand-400)] hover:bg-[var(--surface-1)]"
    >
      <span className="flex items-baseline gap-1">
        <span className="text-[40px] leading-none tracking-tight text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
          {scan.healthScore !== null ? shown : "—"}
        </span>
        {scan.healthScore !== null ? (
          <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            /100
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        {word ? (
          <span className={cn("block text-[10px] font-semibold uppercase tracking-[0.08em]", word.tone)} style={{ fontFamily: MONO }}>
            {word.word}
          </span>
        ) : null}
        <span className="block truncate text-[13px] font-medium text-[var(--text-1)]" title={scan.projectName}>
          {scan.projectName}
        </span>
        <span className="widget-timestamp">Latest scan · {formatDate(scan.createdAt)}</span>
      </span>
      <ArrowUpRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)] transition group-hover:text-[var(--brand-700)]" />
    </Link>
  );
}

export function ClientPulseCard({
  number,
  scans,
  pendingReview,
  grow,
  style,
}: {
  number: string;
  scans: ClientPulseScanSummary[];
  /** Pulse waits until a client is moved to workflow. */
  pendingReview: boolean;
  /** Last card in its column: take the spare height. */
  grow?: boolean;
  style?: CSSProperties;
}) {
  const [latest, ...older] = scans;
  return (
    <section className={cn("widget-card motion-rise flex flex-col", grow && "flex-1")} style={style}>
      <Header
        number={number}
        label="PULSE"
        right={
          scans.length > 0 ? (
            <span className="widget-header__status">
              <SignalIcon className="h-3 w-3" />
              {scans.length} scan{scans.length === 1 ? "" : "s"}
            </span>
          ) : null
        }
      />
      {!latest ? (
        <p className="px-5 py-4 text-sm text-[var(--text-3)]">
          {pendingReview ? (
            "Pulse scans start once this client is moved to workflow."
          ) : (
            <>
              No scans yet.{" "}
              <Link href="/app/pulse/new" className="text-[var(--brand-700)] hover:underline">
                Run a Pulse scan
              </Link>
            </>
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-2 p-4">
          <LatestScore scan={latest} />
          {older.slice(0, 3).map((scan) => (
            <Link
              key={scan.id}
              href={`/app/pulse/${scan.id}`}
              className="flex items-center gap-3 rounded-[6px] px-2 py-1.5 text-[13px] transition hover:bg-[var(--surface-1)]"
            >
              <span className="w-8 text-right text-[16px] leading-none text-[var(--text-2)]" style={{ fontFamily: "var(--font-display)" }}>
                {scan.healthScore ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--text-2)]" title={scan.projectName}>
                {scan.projectName}
              </span>
              <span className="widget-timestamp shrink-0">{formatDate(scan.createdAt)}</span>
            </Link>
          ))}
          {older.length > 3 ? (
            <Link href="/app/pulse" className="px-2 text-[11px] text-[var(--text-3)] hover:text-[var(--brand-700)]" style={{ fontFamily: MONO }}>
              +{older.length - 3} more in Pulse
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

const STUDY_TONE: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string; pulse?: boolean }> = {
  COMPLETED: { tone: "success", label: "Completed" },
  RUNNING: { tone: "warning", label: "Running", pulse: true },
  PLAN_GENERATING: { tone: "warning", label: "Planning", pulse: true },
  FAILED: { tone: "danger", label: "Failed" },
};

export function ClientStudiesCard({
  number,
  clientId,
  studies,
  grow,
  style,
}: {
  number: string;
  clientId: string;
  studies: ClientStudySummary[];
  grow?: boolean;
  style?: CSSProperties;
}) {
  const newHref = `/app/study/new?clientId=${clientId}`;
  return (
    <section className={cn("widget-card motion-rise flex flex-col", grow && "flex-1")} style={style}>
      <Header
        number={number}
        label="STUDIES"
        right={
          <div className="flex items-center gap-2">
            {studies.length > 0 ? (
              <span className="widget-header__status">
                <BeakerIcon className="h-3 w-3" />
                {studies.length}
              </span>
            ) : null}
            <Link
              href={newHref}
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
              title="New study for this client"
              aria-label="New study for this client"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
      />
      {studies.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--text-3)]">
          No research studies yet.{" "}
          <Link href={newHref} className="text-[var(--brand-700)] hover:underline">
            Start one
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-3)]">
          {studies.slice(0, 4).map((study) => {
            const t = STUDY_TONE[study.status] ?? { tone: "neutral" as const, label: study.status.toLowerCase().replace(/_/g, " ") };
            return (
              <li key={study.id}>
                <Link href={`/app/study/${study.id}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-[var(--surface-1)]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--text-1)]" title={study.title}>
                      {study.title}
                    </span>
                    <span className="widget-timestamp">
                      {study.sessionMode === "GROUP" ? "Group" : "1-on-1"} · {study.completedSessionCount}/{study.sessionCount} sessions ·{" "}
                      {formatDate(study.createdAt)}
                    </span>
                  </span>
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]"
                    style={{ fontFamily: MONO }}
                  >
                    <StatusDot tone={t.tone} motion={t.pulse ? "pulse" : "none"} size="xs" />
                    {t.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
