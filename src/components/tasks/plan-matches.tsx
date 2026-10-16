"use client";

import { Fragment } from "react";
import { ArrowRightCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { useAccount } from "@/hooks/use-account";
import { useUpdateTask } from "@/hooks/use-tasks";
import { useToast } from "@/components/ui/toast";
import { stem, type PlanMatch } from "@/lib/tasks/plan-match";
import { TASK_STATUS_LABELS, type TaskDTO } from "@/types/tasks";

/**
 * "Already on the board?" — the tasks a draft title most likely refers to, each with a
 * one-click pick-up. Shared by the task form and My Day's quick add, so both offer the
 * same tasks for the same words.
 *
 * Picking a task up assigns it to you and moves it to Doing, which is exactly what
 * creating a duplicate was standing in for: the work gets reported against the task the
 * project's progress, timeline and Delivery page actually count.
 */
export function PlanMatchList({
  matches,
  onPickedUp,
  onDismiss,
  className,
}: {
  matches: PlanMatch<TaskDTO>[];
  /** Called once a task has been picked up (the caller usually closes its form). */
  onPickedUp?: (task: TaskDTO) => void;
  /** "None of these — it's new." Hides the list for this draft. */
  onDismiss?: () => void;
  className?: string;
}) {
  const me = useAccount().data?.id ?? null;
  const update = useUpdateTask();
  const { success, error } = useToast();
  if (matches.length === 0) return null;

  async function pickUp(task: TaskDTO) {
    const assigneeIds = [...new Set([...task.assignees.map((a) => a.id), ...(me ? [me] : [])])];
    const alreadyMoving = task.status === "DOING" || task.status === "IN_REVIEW" || task.status === "UI_DONE";
    try {
      await update.mutateAsync({
        id: task.id,
        input: { assigneeIds, ...(alreadyMoving ? {} : { status: "DOING" }) },
      });
      success("Picked up", task.title);
      onPickedUp?.(task);
    } catch (e) {
      error("Couldn't pick that up", e instanceof Error ? e.message : "Please try again.");
    }
  }

  return (
    <div
      className={cn(
        "rounded-[8px] border border-[var(--brand-200)] bg-[var(--surface-brand)] px-3 py-2.5",
        className,
      )}
      data-plan-matches
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="widget-data-label text-[var(--brand-700)]">ALREADY ON THE BOARD?</p>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-3)]">
            {matches.length === 1 ? "This looks like a task" : "These look like tasks"} we&apos;ve
            already planned. Pick one up instead of adding a duplicate.
          </p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11px] font-medium text-[var(--text-4)] transition hover:text-[var(--text-1)]"
            title="None of these — it's new work"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
            It&apos;s new
          </button>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1.5">
        {matches.map(({ item: task, matchedWords }) => {
          const mine = me ? task.assignees.some((a) => a.id === me) : false;
          const others = task.assignees.filter((a) => a.id !== me);
          const owner =
            others.length === 0
              ? mine
                ? "Yours"
                : "Unassigned"
              : others.length === 1
                ? others[0].name
                : `${others[0].name} +${others.length - 1}`;
          const moving = task.status === "DOING" || task.status === "IN_REVIEW" || task.status === "UI_DONE";
          const done = mine && moving;
          return (
            <li
              key={task.id}
              className="flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[var(--text-1)]" title={task.title}>
                  <Highlighted text={task.title} words={matchedWords} />
                </p>
                <p
                  className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]"
                  title={`${task.featureBlock?.name ?? "No category"} · ${TASK_STATUS_LABELS[task.status]} · ${owner}`}
                >
                  {task.featureBlock?.name ?? "No category"} · {TASK_STATUS_LABELS[task.status]} · {owner}
                </p>
              </div>
              {done ? (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
                  In your Doing
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  leadingIcon={<ArrowRightCircleIcon className="h-4 w-4" />}
                  loading={update.isPending && update.variables?.id === task.id}
                  disabled={update.isPending}
                  onClick={() => void pickUp(task)}
                >
                  {mine ? "Start" : others.length > 0 ? "Join" : "Pick up"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The title with the words that matched set in the text colour, so "why this one?" is visible. */
function Highlighted({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const stems = new Set(words.map((w) => stem(w.toLowerCase())));
  const parts = text.split(/([A-Za-z0-9]+)/);
  return (
    <>
      {parts.map((part, i) =>
        /^[A-Za-z0-9]+$/.test(part) && stems.has(stem(part.toLowerCase())) ? (
          <mark key={i} className="bg-transparent font-semibold text-[var(--text-1)]">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
