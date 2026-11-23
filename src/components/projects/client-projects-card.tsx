"use client";

/**
 * The Portal client page's Projects card (CLAUDE.md §150): each piece of work for the client with
 * its dates, how far the work has got and, for people who may see money, its budget against what
 * has been spent. Full width at its natural height, so it never leaves a gap beside another card.
 */

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { PROJECT_STATUS_LABELS, percentText, type ProjectStatus } from "@/lib/project-budget";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { useClientProjects } from "@/hooks/use-projects";
import { ProjectDetailDialog, ProjectFormDialog, VERDICT_DOT, VERDICT_TONE, projectDates } from "@/components/projects/project-dialogs";
import type { ProjectDTO } from "@/types/projects";

const MONO = { fontFamily: "var(--font-mono)" } as const;

const STATUS_TONE: Record<ProjectStatus, string> = {
  PLANNED: "text-[var(--text-3)]",
  ACTIVE: "text-[var(--brand-700)]",
  ON_HOLD: "text-[var(--warning-500)]",
  DONE: "text-[var(--success-500)]",
};

function Bar({ share, tone = "brand", label }: { share: number | null; tone?: "brand" | "muted" | "danger"; label: string }) {
  const pct = share == null ? 0 : Math.min(1, Math.max(0, share)) * 100;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]" role="img" aria-label={`${label}: ${percentText(share)}`}>
      <span
        className={cn(
          "block h-full rounded-full",
          tone === "brand" ? "bg-[var(--brand-500)]" : tone === "danger" ? "bg-[var(--danger-500)]" : "bg-[var(--text-4)]",
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

function Meter({ label, share, tone }: { label: string; share: number | null; tone?: "brand" | "muted" | "danger" }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
          {label}
        </span>
        <span className="text-[12px] tabular-nums text-[var(--text-2)]">{percentText(share)}</span>
      </div>
      <Bar share={share} tone={tone} label={label} />
    </div>
  );
}

function ProjectRow({ p, onOpen }: { p: ProjectDTO; onOpen: () => void }) {
  const m = p.money;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full gap-x-6 gap-y-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-1)] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]"
        data-project-row
      >
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-[var(--text-1)]" title={p.name}>
            {p.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-4)]">
            <span className={cn("uppercase tracking-[0.08em]", STATUS_TONE[p.status])} style={MONO}>
              {PROJECT_STATUS_LABELS[p.status]}
            </span>
            <span>{projectDates(p)}</span>
          </p>
          {m ? (
            <p className={cn("mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium", VERDICT_TONE[m.verdict.tone])}>
              <span className={cn("h-1.5 w-1.5 rounded-full", VERDICT_DOT[m.verdict.tone])} aria-hidden />
              {m.verdict.text}
            </p>
          ) : null}
        </div>
        <div className="grid min-w-0 content-start gap-2.5">
          <Meter label={p.progress.tasks ? `Work done · ${p.progress.done}/${p.progress.tasks}` : "Work done · no tasks"} share={p.progress.share} />
          <Meter label="Time gone" share={p.timeShare} tone="muted" />
        </div>
        {m ? (
          <div className="grid min-w-0 content-start gap-2.5">
            <Meter label="Budget burned" share={m.burned} tone={m.burned != null && m.burned > 1 ? "danger" : "brand"} />
            <p className="text-[12px] tabular-nums text-[var(--text-3)]">
              {m.spent == null ? "Spend unknown" : formatMoney(m.spent, m.currency)}
              <span className="text-[var(--text-4)]"> of </span>
              {m.budget == null ? "no budget" : formatMoney(m.budget, m.currency)}
            </p>
          </div>
        ) : (
          <div className="hidden min-w-0 content-start md:grid">
            <p className="text-[12px] text-[var(--text-4)]">
              {p.document ? `From ${p.document.title}` : p.releases.length ? `${p.releases.length} release${p.releases.length === 1 ? "" : "s"}` : " "}
            </p>
          </div>
        )}
      </button>
    </li>
  );
}

export function ClientProjectsCard({
  number,
  slug,
  clientId,
  canManage,
}: {
  number: string;
  slug: string;
  clientId: string;
  canManage: boolean;
}) {
  const q = useClientProjects(slug);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const projects = q.data?.projects ?? [];

  return (
    <section className="widget-card flex flex-col" data-projects-card aria-label="Projects">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {" // PROJECTS"}
        </span>
        {canManage ? (
          <button type="button" onClick={() => setCreating(true)} className="app-button app-button-secondary app-button-xs">
            <PlusIcon className="h-3.5 w-3.5" />
            New project
          </button>
        ) : null}
      </div>

      {q.isPending ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : q.isError ? (
        <p className="px-4 py-5 text-sm text-[var(--text-3)]">
          Couldn&apos;t load the projects just now.{" "}
          <button type="button" onClick={() => void q.refetch()} className="app-button app-button-hyperlink">
            Try again
          </button>
        </p>
      ) : projects.length === 0 ? (
        <p className="px-4 py-5 text-sm text-[var(--text-3)]">
          No projects yet. A project ties a piece of work together: the proposal it came from, its dates, its releases and tasks
          {q.data?.canSeeMoney ? ", and its budget against what's been spent." : "."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-1)]">
          {projects.map((p) => (
            <ProjectRow key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
          ))}
        </ul>
      )}

      {q.data?.canSeeMoney && projects.length > 0 ? (
        <p className="border-t border-[var(--border-1)] px-4 py-2.5 text-[11px] text-[var(--text-4)]">
          Spend is what the developers on this client cost at rate-card rates over each project&apos;s dates up to today. Not invoices.
        </p>
      ) : null}

      {creating ? (
        <ProjectFormDialog slug={slug} clientId={clientId} project={null} onClose={() => setCreating(false)} onSaved={(id) => setOpenId(id)} />
      ) : null}
      {openId ? <ProjectDetailDialog slug={slug} clientId={clientId} projectId={openId} canManage={canManage} onClose={() => setOpenId(null)} /> : null}
    </section>
  );
}
