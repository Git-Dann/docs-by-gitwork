"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";
import { useBatchUpdateTasks } from "@/hooks/use-tasks";
import { suggestCategory } from "@/lib/tasks/plan-match";
import { computePlanHealth, planHealthWorthShowing } from "@/lib/tasks/plan-health";
import { TASK_STATUS_LABELS, type FeatureBlockDTO, type TaskDTO } from "@/types/tasks";

export type PlanFilter = "stale" | "unplanned" | null;

/**
 * The plan's health in one line at the end of the filter row: how much of the last 30 days'
 * work landed on the plan, and two chips that filter to what's off it or left alone. Silent on
 * a healthy board — see `planHealthWorthShowing`. The explanations live in the tooltips, so the
 * board keeps the room.
 */
export function PlanHealthStrip({
  tasks,
  blocks,
  clientName,
  filter,
  onFilter,
}: {
  tasks: TaskDTO[];
  blocks: FeatureBlockDTO[];
  clientName: string;
  filter: PlanFilter;
  onFilter: (f: PlanFilter, ids: string[]) => void;
}) {
  const [sorting, setSorting] = useState(false);
  const health = useMemo(() => computePlanHealth(tasks, new Date()), [tasks]);
  if (blocks.length === 0 || (!planHealthWorthShowing(health) && filter === null)) return null;

  const share =
    health.doneInWindow === 0 ? null : Math.round((health.donePlanned / health.doneInWindow) * 100);
  const offPlan = health.unplannedIds.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Plan health" data-plan-health>
      <span
        className="widget-data-label whitespace-nowrap"
        title={`Of the ${health.doneInWindow} tasks done in the last ${health.windowDays} days, ${health.donePlanned} were in a category.`}
      >
        {share !== null ? `PLAN · ${share}% ON IT` : "PLAN"}
      </span>
      {offPlan > 0 ? (
        <>
          <Chip
            active={filter === "unplanned"}
            onClick={() => onFilter(filter === "unplanned" ? null : "unplanned", health.unplannedIds)}
            title={`${health.doneUnplanned} done in the last ${health.windowDays} days and ${health.unplannedOpen} open, in no category. Work in no category doesn't count toward phase progress, the timeline or the client's Delivery page.`}
          >
            {offPlan} off plan
          </Chip>
          <button
            type="button"
            onClick={() => setSorting(true)}
            aria-label="Sort into categories"
            title="Sort into categories"
            className="rounded-[6px] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
          >
            <SparklesIcon className="h-4 w-4" />
          </button>
        </>
      ) : null}
      {health.plannedStale > 0 ? (
        <Chip
          active={filter === "stale"}
          onClick={() => onFilter(filter === "stale" ? null : "stale", health.staleIds)}
          title={`${health.plannedStale} of ${health.plannedOpen} planned tasks haven't been touched in ${health.staleDays}+ days. Pick them up, close the ones already done, or remove them if the plan changed.`}
        >
          {health.plannedStale} untouched {health.staleDays}d+
        </Chip>
      ) : null}
      {sorting ? (
        <PlanSortModal
          tasks={tasks.filter((t) => health.unplannedIds.includes(t.id))}
          allTasks={tasks}
          blocks={blocks}
          clientName={clientName}
          onClose={() => setSorting(false)}
        />
      ) : null}
    </div>
  );
}

/** A filter toggle that reads as a count. Active shows an × to clear it. */
function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] border px-2 py-1 font-mono text-[11px] tracking-[0.02em] transition",
        active
          ? "border-[var(--brand-400)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
          : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)] hover:border-[var(--brand-400)] hover:text-[var(--brand-700)]",
      )}
    >
      {children}
      {active ? <XMarkIcon className="h-3.5 w-3.5" aria-hidden /> : null}
    </button>
  );
}

const LEAVE = "";

/**
 * Bulk-sort unplanned tasks into the categories they belong in. Every row comes with a
 * suggestion where one is clear (the same rule the task form uses) and nothing is moved
 * until it is reviewed — a confident wrong category is harder to spot later than no
 * category at all.
 */
function PlanSortModal({
  tasks,
  allTasks,
  blocks,
  clientName,
  onClose,
}: {
  tasks: TaskDTO[];
  allTasks: TaskDTO[];
  blocks: FeatureBlockDTO[];
  clientName: string;
  onClose: () => void;
}) {
  const batch = useBatchUpdateTasks();
  const suggestions = useMemo(() => {
    const planned = allTasks
      .filter((t) => t.featureBlock)
      .map((t) => ({ title: t.title, categoryId: t.featureBlock!.id }));
    const cats = blocks.map((b) => ({ id: b.id, name: b.name }));
    return new Map(
      tasks.map((t) => [t.id, suggestCategory(t.title, cats, planned, { ignoreWords: clientName })] as const),
    );
  }, [tasks, allTasks, blocks, clientName]);

  // Rows with a suggestion first, strongest first; the rest keep the board's order.
  const ordered = useMemo(
    () =>
      [...tasks].sort(
        (a, b) => (suggestions.get(b.id)?.score ?? 0) - (suggestions.get(a.id)?.score ?? 0),
      ),
    [tasks, suggestions],
  );
  const [choice, setChoice] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    setChoice(new Map(tasks.map((t) => [t.id, suggestions.get(t.id)?.categoryId ?? LEAVE])));
  }, [tasks, suggestions]);

  const withSuggestion = tasks.filter((t) => suggestions.get(t.id)).length;
  const toApply = [...choice.entries()].filter(([, v]) => v !== LEAVE);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setError(null);
    const byCategory = new Map<string, string[]>();
    for (const [id, cat] of toApply) byCategory.set(cat, [...(byCategory.get(cat) ?? []), id]);
    try {
      for (const [featureBlockId, ids] of byCategory) {
        await batch.mutateAsync({ ids, patch: { featureBlockId } });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't move those tasks. Nothing after the error was changed.");
    }
  }

  return (
    <Modal open onClose={onClose} title="Sort work into categories" panelClassName="app-dialog-fixed w-full max-w-3xl">
      <div className="shrink-0 border-b border-[var(--border-2)] px-5 py-3">
        <p className="text-[13px] text-[var(--text-2)]">
          {tasks.length} {tasks.length === 1 ? "task is" : "tasks are"} outside the plan.{" "}
          {withSuggestion > 0
            ? `${withSuggestion} ${withSuggestion === 1 ? "has" : "have"} a suggested category, based on its title and the tasks already in each category.`
            : "None has a clear match — choose categories by hand, or leave them."}{" "}
          Nothing moves until you apply.
        </p>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-[var(--border-2)] overflow-y-auto">
        {ordered.map((t) => {
          const s = suggestions.get(t.id);
          const value = choice.get(t.id) ?? LEAVE;
          return (
            <li key={t.id} className="grid gap-2 px-5 py-2.5 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-[var(--text-1)]" title={t.title}>
                  {t.title}
                </p>
                <p
                  className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]"
                  title={s ? s.reason : undefined}
                >
                  {TASK_STATUS_LABELS[t.status]}
                  {s ? ` · ${value === s.categoryId ? "suggested" : "suggestion changed"} · ${s.reason}` : " · no clear match"}
                </p>
              </div>
              <select
                aria-label={`Category for ${t.title}`}
                className="app-select w-full"
                value={value}
                onChange={(e) =>
                  setChoice((prev) => {
                    const next = new Map(prev);
                    next.set(t.id, e.target.value);
                    return next;
                  })
                }
              >
                <option value={LEAVE}>Leave outside the plan</option>
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        {error ? <p className="mr-auto text-[12px] text-[var(--danger-500)]">{error}</p> : null}
        <Button type="button" variant="tertiary" onClick={onClose} disabled={batch.isPending}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          leadingIcon={<CheckIcon className="h-4 w-4" />}
          loading={batch.isPending}
          disabled={toApply.length === 0}
          onClick={() => void apply()}
        >
          {toApply.length === 0 ? "Nothing to move" : `Move ${toApply.length} ${toApply.length === 1 ? "task" : "tasks"}`}
        </Button>
      </div>
    </Modal>
  );
}
