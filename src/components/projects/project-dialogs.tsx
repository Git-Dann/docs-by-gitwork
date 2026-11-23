"use client";

/**
 * The project popups on the Portal client page (CLAUDE.md §150): New/Edit project, and the
 * project itself (figures, burn chart and what's linked). Both are the house fixed-height
 * two-column popup (`.app-dialog-fixed`, DESIGN.md), so they never resize as data arrives.
 *
 * Money figures appear only when the server sent them (`money` / `canSeeMoney`); the browser
 * never decides that on its own.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, ArchiveBoxIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { cn, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import {
  PROJECT_LIMITS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  percentText,
  type ProjectStatus,
  type Verdict,
} from "@/lib/project-budget";
import { useFeatureBlocks } from "@/hooks/use-tasks";
import { useArchiveProject, useClientProject, useClientProjects, useCreateProject, useUpdateProject } from "@/hooks/use-projects";
import { BurnChart } from "@/components/projects/burn-chart";
import type { ProjectDTO, ProjectMoney } from "@/types/projects";

const MONO = { fontFamily: "var(--font-mono)" } as const;
const SERIF = { fontFamily: "var(--font-display)" } as const;

export const VERDICT_TONE: Record<Verdict["tone"], string> = {
  neutral: "text-[var(--text-3)]",
  good: "text-[var(--success-500)]",
  warning: "text-[var(--warning-500)]",
  danger: "text-[var(--danger-500)]",
};

export const VERDICT_DOT: Record<Verdict["tone"], string> = {
  neutral: "bg-[var(--text-4)]",
  good: "bg-[var(--success-500)]",
  warning: "bg-[var(--warning-500)]",
  danger: "bg-[var(--danger-500)]",
};

/** "12 Jan 2026 – 30 Jun 2026" or "From 12 Jan 2026". */
export function projectDates(p: { startDate: string; endDate: string | null }): string {
  return p.endDate ? `${formatDate(p.startDate)} – ${formatDate(p.endDate)}` : `From ${formatDate(p.startDate)}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
      {children}
    </span>
  );
}

// ── New / edit ─────────────────────────────────────────────────────────────────

type Draft = {
  name: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  documentId: string;
  budget: string;
  currency: string;
  categories: string[];
};

function draftFrom(p: ProjectDTO | null): Draft {
  return {
    name: p?.name ?? "",
    status: p?.status ?? "PLANNED",
    startDate: p?.startDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    endDate: p?.endDate?.slice(0, 10) ?? "",
    documentId: p?.document?.id ?? "",
    budget: p?.money?.manualBudget ? String(p.money.manualBudget.amount) : "",
    currency: p?.money?.manualBudget?.currency ?? "GBP",
    categories: p?.categories.map((c) => c.id) ?? [],
  };
}

export function ProjectFormDialog({
  slug,
  clientId,
  project,
  onClose,
  onSaved,
}: {
  slug: string;
  clientId: string;
  /** Present = edit. */
  project: ProjectDTO | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const list = useClientProjects(slug, { documents: true });
  const blocks = useFeatureBlocks(clientId);
  const create = useCreateProject(slug);
  const update = useUpdateProject(slug);
  const [d, setD] = useState<Draft>(() => draftFrom(project));
  const [error, setError] = useState<string | null>(null);

  const documents = list.data?.documents ?? [];
  const canSeeMoney = Boolean(list.data?.canSeeMoney);
  const doc = documents.find((x) => x.id === d.documentId) ?? null;
  const datesBackwards = Boolean(d.startDate && d.endDate && d.endDate < d.startDate);
  const budgetNumber = d.budget.trim() ? Number(d.budget) : null;
  const badBudget = budgetNumber != null && (!Number.isFinite(budgetNumber) || budgetNumber <= 0 || budgetNumber > PROJECT_LIMITS.budget);
  const badCurrency = !/^[A-Z]{3}$/.test(d.currency);
  const canSave = d.name.trim().length > 0 && Boolean(d.startDate) && !datesBackwards && !(budgetNumber != null && (badBudget || badCurrency));
  const saving = create.isPending || update.isPending;
  // Categories in another project are shown with its name, so moving one is a decision.
  const otherOwner = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of list.data?.projects ?? []) if (p.id !== project?.id) for (const c of p.categories) m.set(c.id, p.name);
    return m;
  }, [list.data, project?.id]);

  async function save() {
    if (!canSave) return;
    setError(null);
    const body = {
      name: d.name.trim(),
      status: d.status,
      startDate: d.startDate,
      endDate: d.endDate || null,
      documentId: d.documentId || null,
      featureBlockIds: d.categories,
      // A typed budget only goes up when there's no document, and only from someone who can see money.
      ...(canSeeMoney && !d.documentId ? { budgetAmount: budgetNumber, budgetCurrency: budgetNumber != null ? d.currency : null } : {}),
    };
    try {
      const res = project ? await update.mutateAsync({ id: project.id, body }) : await create.mutateAsync(body);
      onSaved?.(res.project.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the project.");
    }
  }

  const field = "app-input mt-1 w-full text-[16px] sm:text-[13px]";

  return (
    <Modal open onClose={onClose} title={project ? "EDIT PROJECT" : "NEW PROJECT"} panelClassName="app-dialog-fixed w-full max-w-3xl">
      <form
        id="project-form"
        className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="min-h-0 space-y-4 overflow-y-auto p-5 md:border-r md:border-[var(--border-2)]">
          <label className="block text-[12px] font-medium text-[var(--text-2)]">
            Name
            <input
              className={field}
              value={d.name}
              maxLength={PROJECT_LIMITS.name}
              placeholder="e.g. Members app, phase 2"
              onChange={(e) => setD({ ...d, name: e.target.value })}
              autoFocus
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-[12px] font-medium text-[var(--text-2)]">
              Status
              <select className="app-select mt-1 w-full text-[16px] sm:text-[13px]" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as ProjectStatus })}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] font-medium text-[var(--text-2)]">
              Starts
              <input type="date" className={field} value={d.startDate} onChange={(e) => setD({ ...d, startDate: e.target.value })} />
            </label>
            <label className="block text-[12px] font-medium text-[var(--text-2)]">
              Ends <span className="font-normal text-[var(--text-4)]">(optional)</span>
              <input type="date" className={field} value={d.endDate} onChange={(e) => setD({ ...d, endDate: e.target.value })} />
            </label>
          </div>
          {datesBackwards ? <p className="text-[12px] text-[var(--danger-500)]">The end date must be on or after the start date.</p> : null}

          <label className="block text-[12px] font-medium text-[var(--text-2)]">
            Accepted document <span className="font-normal text-[var(--text-4)]">(sets the budget)</span>
            <select
              className="app-select mt-1 w-full text-[16px] sm:text-[13px]"
              value={d.documentId}
              onChange={(e) => setD({ ...d, documentId: e.target.value })}
              disabled={list.isPending}
            >
              <option value="">{list.isPending ? "Loading…" : documents.length ? "None" : "No accepted documents on this client"}</option>
              {documents.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>

          {canSeeMoney && !d.documentId ? (
            <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
              <label className="block text-[12px] font-medium text-[var(--text-2)]">
                Budget <span className="font-normal text-[var(--text-4)]">(optional, without a document)</span>
                <input inputMode="decimal" className={field} value={d.budget} placeholder="e.g. 48000" onChange={(e) => setD({ ...d, budget: e.target.value })} />
              </label>
              <label className="block text-[12px] font-medium text-[var(--text-2)]">
                Currency
                <input className={cn(field, "uppercase")} value={d.currency} maxLength={3} onChange={(e) => setD({ ...d, currency: e.target.value.toUpperCase() })} />
              </label>
              {badBudget || (budgetNumber != null && badCurrency) ? (
                <p className="col-span-2 text-[12px] text-[var(--danger-500)]">
                  {badBudget ? "Enter the budget as a positive number." : "Use a three-letter currency code, e.g. GBP."}
                </p>
              ) : null}
            </div>
          ) : null}

          <fieldset>
            <legend className="text-[12px] font-medium text-[var(--text-2)]">
              Categories in this project <span className="font-normal text-[var(--text-4)]">(their tasks count towards it)</span>
            </legend>
            {blocks.isPending ? (
              <Skeleton className="mt-2 h-16 w-full" />
            ) : (blocks.data ?? []).length === 0 ? (
              <p className="mt-1 text-[12px] text-[var(--text-4)]">This client has no categories yet.</p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-[6px] border border-[var(--border-2)] p-2">
                {(blocks.data ?? []).map((b) => {
                  const checked = d.categories.includes(b.id);
                  const owner = otherOwner.get(b.id);
                  return (
                    <li key={b.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1 text-[13px] text-[var(--text-1)] hover:bg-[var(--surface-1)]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setD({ ...d, categories: checked ? d.categories.filter((x) => x !== b.id) : [...d.categories, b.id] })
                          }
                        />
                        <span className="min-w-0 flex-1 truncate" title={b.name}>
                          {b.name}
                        </span>
                        {owner && !checked ? (
                          <span className="shrink-0 text-[11px] text-[var(--text-4)]" title={`In ${owner}. Ticking it moves it here.`}>
                            in {owner}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
          {error ? <p className="text-[12px] text-[var(--danger-500)]">{error}</p> : null}
        </div>

        <aside className="hidden min-h-0 overflow-y-auto bg-[var(--surface-1)] p-5 md:block">
          <Label>Budget</Label>
          {doc ? (
            <>
              <p className="mt-2 text-2xl leading-tight text-[var(--text-1)]" style={SERIF}>
                {doc.total != null && doc.currency ? formatMoney(doc.total, doc.currency) : "From the document"}
              </p>
              <p className="mt-1 text-[12px] text-[var(--text-3)]">
                From <span className="text-[var(--text-2)]">{doc.title}</span>, accepted {formatDate(doc.wonAt)}.
              </p>
            </>
          ) : (
            <p className="mt-2 text-[12px] leading-5 text-[var(--text-3)]">
              {canSeeMoney
                ? "Link an accepted proposal or SOW and its cost lines become the budget, worked out as Money works it out. Without one, you can type a budget."
                : "Link an accepted proposal or SOW and its cost lines become the budget."}
            </p>
          )}
          <div className="mt-5 space-y-2 text-[12px] leading-5 text-[var(--text-3)]">
            <Label>How spend is worked out</Label>
            <p>What the developers on this client cost at rate-card rates, over the project&apos;s dates up to today.</p>
            <p>Work done is the share of the project&apos;s tasks that are done. Tasks join a project from the task form, or through a release or category in it.</p>
          </div>
        </aside>
      </form>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="project-form" disabled={!canSave} loading={saving}>
          {project ? "Save" : "Add project"}
        </Button>
      </div>
    </Modal>
  );
}

// ── The project ────────────────────────────────────────────────────────────────

function Figure({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <p className="mt-1 truncate text-[22px] leading-tight text-[var(--text-1)] tabular-nums" style={SERIF}>
        {value}
      </p>
      {note ? <p className="mt-0.5 text-[11px] text-[var(--text-4)]">{note}</p> : null}
    </div>
  );
}

function MoneyBlock({ m }: { m: ProjectMoney }) {
  const notes: string[] = [];
  if (m.unpricedDevs > 0) notes.push(`${m.unpricedDevs} developer${m.unpricedDevs === 1 ? " has" : "s have"} no rate and ${m.unpricedDevs === 1 ? "is" : "are"} left out of spend.`);
  for (const [cur, amount] of Object.entries(m.unconverted)) notes.push(`${formatMoney(amount, cur)} couldn't be converted (no exchange rate) and is left out.`);
  if (m.budgetProblem) notes.push(m.budgetProblem);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Figure
          label="Budget"
          value={m.budget == null ? "None" : formatMoney(m.budget, m.currency)}
          note={m.budgetSource === "document" ? "From the document" : m.budgetSource === "manual" ? "Typed by hand" : null}
        />
        <Figure label="Spent so far" value={m.spent == null ? "Unknown" : formatMoney(m.spent, m.currency)} note={`${m.pricedDevs} priced developer${m.pricedDevs === 1 ? "" : "s"}`} />
        <Figure label="Burned" value={percentText(m.burned)} note={m.burned == null ? null : "of the budget"} />
      </div>
      <BurnChart points={m.burn} budget={m.budget} currency={m.currency} />
      {notes.length ? (
        <ul className="space-y-1 text-[12px] text-[var(--text-3)]">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ProjectDetailDialog({
  slug,
  clientId,
  projectId,
  canManage,
  onClose,
}: {
  slug: string;
  clientId: string;
  projectId: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const q = useClientProject(slug, projectId);
  const archive = useArchiveProject(slug);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = q.data?.project;

  if (editing && p) {
    return <ProjectFormDialog slug={slug} clientId={clientId} project={p} onClose={() => setEditing(false)} />;
  }

  async function doArchive() {
    setError(null);
    try {
      await archive.mutateAsync(projectId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't archive the project.");
    }
  }

  const tone = p?.money?.verdict.tone ?? "neutral";

  return (
    <Modal open onClose={onClose} title="PROJECT" panelClassName="app-dialog-fixed w-full max-w-4xl">
      {q.isPending ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : q.isError || !p ? (
        <p className="p-5 text-sm text-[var(--text-3)]">
          Couldn&apos;t load the project just now.{" "}
          <button type="button" className="app-button app-button-hyperlink" onClick={() => void q.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
            <div className="min-h-0 space-y-5 overflow-y-auto p-5 md:border-r md:border-[var(--border-2)]">
              <div>
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
                  {PROJECT_STATUS_LABELS[p.status]} · {projectDates(p)}
                </p>
                <h3 className="mt-1 text-2xl leading-tight tracking-[-0.02em] text-[var(--text-1)]" style={SERIF}>
                  {p.name}
                </h3>
                {p.money ? (
                  <p className={cn("mt-2 inline-flex items-center gap-2 text-[13px] font-medium", VERDICT_TONE[tone])}>
                    <span className={cn("h-2 w-2 rounded-full", VERDICT_DOT[tone])} aria-hidden />
                    {p.money.verdict.text}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Figure label="Work done" value={percentText(p.progress.share)} note={p.progress.tasks ? `${p.progress.done} of ${p.progress.tasks} tasks` : "No tasks linked yet"} />
                <Figure label="Time gone" value={percentText(p.timeShare)} note={p.endDate ? `Ends ${formatDate(p.endDate)}` : "No end date"} />
                <Figure
                  label="Estimate"
                  value={p.progress.estimate ? `${p.progress.estimate.remaining}h` : "—"}
                  note={
                    p.progress.estimate
                      ? `left of ${p.progress.estimate.total}h${p.progress.estimate.unestimated ? ` · ${p.progress.estimate.unestimated} unestimated` : ""}`
                      : "No task carries an estimate"
                  }
                />
              </div>

              {p.money ? <MoneyBlock m={p.money} /> : null}

              {p.sharedWith.length ? (
                <p className="text-[12px] text-[var(--text-3)]">
                  Runs at the same time as {p.sharedWith.join(", ")}. Developers are placed on the client, not on a project, so
                  {p.money ? " both are charged for the same team." : " both share the same team."}
                </p>
              ) : null}
              {error ? <p className="text-[12px] text-[var(--danger-500)]">{error}</p> : null}
            </div>

            <aside className="min-h-0 space-y-5 overflow-y-auto border-t border-[var(--border-2)] p-5 md:border-t-0">
              <section>
                <Label>Document</Label>
                {p.document ? (
                  <Link
                    href={`/app/docs/${p.document.id}`}
                    className="mt-1 inline-flex max-w-full items-center gap-1 text-[13px] text-[var(--brand-700)] hover:underline"
                  >
                    <span className="truncate" title={p.document.title}>
                      {p.document.title}
                    </span>
                    <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0" aria-hidden />
                  </Link>
                ) : (
                  <p className="mt-1 text-[12px] text-[var(--text-4)]">None linked.</p>
                )}
              </section>
              <section>
                <Label>Releases</Label>
                {p.releases.length ? (
                  <ul className="mt-1 space-y-0.5 text-[13px] text-[var(--text-2)]">
                    {p.releases.map((r) => (
                      <li key={r.id} className="truncate" title={r.label}>
                        {r.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12px] text-[var(--text-4)]">None. Set one in the Releases dialog on the task board.</p>
                )}
              </section>
              <section>
                <Label>Categories</Label>
                {p.categories.length ? (
                  <ul className="mt-1 space-y-0.5 text-[13px] text-[var(--text-2)]">
                    {p.categories.map((c) => (
                      <li key={c.id} className="truncate" title={c.name}>
                        {c.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12px] text-[var(--text-4)]">None.</p>
                )}
              </section>
              <section>
                <div className="flex items-baseline justify-between gap-2">
                  <Label>Tasks</Label>
                  <Link href={`/app/portal/${slug}/tasks`} className="text-[11px] text-[var(--brand-700)] hover:underline">
                    Task board
                  </Link>
                </div>
                {q.data.project.tasks.length ? (
                  <ul className="mt-1 divide-y divide-[var(--border-1)]">
                    {q.data.project.tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 py-1.5">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.done ? "bg-[var(--success-500)]" : "bg-[var(--border-2)]")} aria-hidden />
                        <Link
                          href={`/app/portal/${slug}/tasks?task=${t.id}`}
                          className={cn("min-w-0 flex-1 truncate text-[13px] hover:text-[var(--brand-700)]", t.done ? "text-[var(--text-4)]" : "text-[var(--text-1)]")}
                          title={t.title}
                        >
                          {t.title}
                        </Link>
                        {t.estimateHours != null ? (
                          <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-4)]" style={MONO}>
                            {t.estimateHours}h
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12px] text-[var(--text-4)]">None yet. Pick this project in a task&apos;s form, or link a release or category.</p>
                )}
              </section>
            </aside>
          </div>
          {canManage ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
              {confirming ? (
                <>
                  <span className="mr-auto text-[12px] text-[var(--text-3)]">Archive it? Its tasks, releases and categories stay.</span>
                  <Button variant="tertiary" onClick={() => setConfirming(false)}>
                    Keep
                  </Button>
                  <Button variant="danger" loading={archive.isPending} onClick={() => void doArchive()}>
                    Archive
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="tertiary" className="mr-auto" onClick={() => setConfirming(true)}>
                    <ArchiveBoxIcon className="h-4 w-4" aria-hidden />
                    Archive
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    <PencilSquareIcon className="h-4 w-4" aria-hidden />
                    Edit
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
