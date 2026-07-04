"use client";

import Link from "next/link";
import { useStudyList } from "@/hooks/use-study";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";

function statusTone(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "text-emerald-600";
    case "RUNNING":
    case "PLAN_GENERATING":
      return "text-amber-600";
    case "FAILED":
      return "text-red-600";
    default:
      return "text-[var(--text-4)]";
  }
}

/**
 * `02 // RESEARCH STUDIES` — optional Study research tool, second of the three-card top row.
 * DESIGN.md widget grammar: mono numbered header + status chip, blurb, capped list, bottom CTA.
 */
export function PulseStudiesPanel() {
  const { canManageStudy } = usePermissions();
  // Study is an admin-only tool — hide the whole panel from everyone else, and don't even
  // fire the (now admin-gated) studies fetch for non-admins.
  const { data: studies, isLoading } = useStudyList(canManageStudy);

  if (!canManageStudy) return null;

  const list = studies ?? [];

  return (
    <article className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">02</span>{" // RESEARCH STUDIES"}
        </span>
        <span className="widget-header__status">Optional</span>
      </div>

      <div className="flex flex-col p-4">
        <p className="text-[12px] leading-snug text-[var(--text-4)]">
          AI persona interviews to validate assumptions — run one when a scan raises questions worth testing with users.
        </p>

        <div className="mt-3">
          {isLoading ? null : list.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[var(--border-2)] px-4 py-4 text-center text-xs text-[var(--text-4)]">
              No studies yet — start one to interview AI personas.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-2)]">
              {list.slice(0, 3).map((study) => (
                <Link
                  key={study.id}
                  href={`/app/study/${study.id}`}
                  className="flex items-center gap-x-3 py-2 transition hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--text-1)]">{study.title}</p>
                    <p className="widget-data-label mt-0.5 truncate normal-case tracking-normal">
                      {study.workspaceClientName ? `${study.workspaceClientName} · ` : ""}
                      {study.completedSessionCount}/{study.sessionCount} session{study.sessionCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className={cn("widget-data-label shrink-0", statusTone(study.status))}>
                    {study.status.replace(/_/g, " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <Link href="/app/study/new" className="mt-3 block">
          <Button variant="secondary" size="sm" className="w-full">New research study</Button>
        </Link>
      </div>
    </article>
  );
}
