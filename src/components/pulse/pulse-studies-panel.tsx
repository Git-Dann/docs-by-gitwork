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
 * Optional Study research tool, surfaced from within Pulse. Study is no longer a top-level
 * module — it lives here as a tool you *can* reach for when validating a project. Lists the
 * workspace's studies and lets a pulse.manage holder start a new one.
 */
export function PulseStudiesPanel() {
  const { canManageStudy } = usePermissions();
  // Study is an admin-only tool — hide the whole panel from everyone else, and don't even
  // fire the (now admin-gated) studies fetch for non-admins.
  const { data: studies, isLoading } = useStudyList(canManageStudy);

  if (!canManageStudy) return null;

  const list = studies ?? [];

  return (
    <div className="app-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-1)]">
            Research studies <span className="font-normal text-[var(--text-4)]">· optional</span>
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-4)]">
            AI persona interviews to validate assumptions about a project. Not automatic — run one when a scan raises questions worth testing with users.
          </p>
        </div>
        <Link href="/app/study/new" className="shrink-0">
          <Button variant="secondary" size="sm">New research study</Button>
        </Link>
      </div>

      {isLoading ? null : list.length === 0 ? (
        <p className="rounded-[6px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-xs text-[var(--text-4)]">
          No studies yet. Start one to interview AI personas about a project.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-2)]">
          {list.slice(0, 6).map((study) => (
            <Link
              key={study.id}
              href={`/app/study/${study.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 transition hover:opacity-80"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-1)]">{study.title}</p>
                <p className="truncate text-xs text-[var(--text-4)]">
                  {study.workspaceClientName ? `${study.workspaceClientName} · ` : ""}
                  {study.completedSessionCount}/{study.sessionCount} session{study.sessionCount !== 1 ? "s" : ""}
                </p>
              </div>
              <span className={cn("font-mono text-[10px] font-semibold uppercase tracking-[0.08em]", statusTone(study.status))}>
                {study.status.replace(/_/g, " ")}
              </span>
            </Link>
          ))}
          {list.length > 6 && (
            <Link
              href="/app/study"
              className="block py-2.5 text-center text-xs font-medium text-[var(--brand-700)] hover:underline"
            >
              View all {list.length} studies →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
