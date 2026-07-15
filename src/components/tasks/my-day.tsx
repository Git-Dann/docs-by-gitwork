"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRightCircleIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useMyDay, usePushDailyUpdate, useDeleteStandupUpdate, useUpdateTask } from "@/hooks/use-tasks";
import { TaskPriorityBadge, TaskLabelBadge } from "@/components/tasks/task-badges";
import { TASK_STATUS_LABELS, type TaskDTO } from "@/types/tasks";

function timeOf(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MyDay() {
  const { data, isPending } = useMyDay();
  const update = useUpdateTask();
  const push = usePushDailyUpdate();
  const del = useDeleteStandupUpdate();

  const [weekPlan, setWeekPlan] = useState("");
  const [note, setNote] = useState("");
  const [pushed, setPushed] = useState<null | "AM" | "PM">(null);
  // Phase awaiting confirmation in the pre-send modal (null = modal closed).
  const [confirm, setConfirm] = useState<null | "AM" | "PM">(null);
  const [pushMsg, setPushMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Task the Quick View modal is showing (null = closed).
  const [viewTask, setViewTask] = useState<TaskDTO | null>(null);
  // Synchronous guard against duplicate submits — React's `disabled` prop only
  // takes effect after a re-render commits, which leaves a window for a fast
  // double-click (or a retried click after an error) to fire mutateAsync twice.
  const pushingRef = useRef(false);

  // Seed the editable "This week" from the saved plan, falling back to the suggestion.
  useEffect(() => {
    if (!data) return;
    setWeekPlan(data.update.weekPlan ?? data.suggestedWeekPlan ?? "");
    setNote(data.update.note ?? "");
  }, [data]);

  if (isPending || !data) {
    return <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  async function start(task: TaskDTO) {
    await update.mutateAsync({ id: task.id, input: { status: "DOING" } });
  }
  async function markDone(task: TaskDTO) {
    await update.mutateAsync({ id: task.id, input: { status: "DONE" } });
  }

  function deleteUpdate(phase: "AM" | "PM") {
    setPushMsg(null);
    del.mutate(phase, {
      onSuccess: () => setPushMsg({ text: `${phase} update deleted from Slack`, ok: false }),
      onError: (e) =>
        setPushMsg({ text: e instanceof Error ? e.message : "Delete failed", ok: false }),
    });
  }

  async function pushUpdate(phase: "AM" | "PM") {
    if (pushingRef.current) return;
    pushingRef.current = true;
    setConfirm(null);
    setPushMsg(null);
    try {
      const res = await push.mutateAsync({
        phase,
        weekPlan: data!.isMonday ? weekPlan : undefined,
        note: note.trim() || undefined,
      });
      setPushed(phase);
      const posted = res?.posted ?? 0;
      const slackFailures = res?.slackFailures ?? [];
      // Honest feedback: the standup only posts to a client's channel when there's
      // something for that client (in-progress tasks for AM, done-today for PM).
      // If nothing matched, say so rather than a misleading "Pushed to Slack". Surface
      // any channel that rejected the post (e.g. the bot isn't in a Slack Connect channel).
      setPushMsg(
        slackFailures.length > 0
          ? {
              text: `Pushed to ${posted} · couldn't post to ${slackFailures.join("; ")} — check the bot is in that channel`,
              ok: false,
            }
          : posted > 0
            ? { text: `Pushed to ${posted} ${posted === 1 ? "channel" : "channels"}`, ok: true }
            : {
                text:
                  phase === "PM"
                    ? "Saved — no tasks marked done today to post"
                    : "Saved — nothing in progress to post",
                ok: false,
              },
      );
      setTimeout(() => {
        setPushed(null);
        setPushMsg(null);
      }, 4000);
    } catch (err) {
      setPushMsg({
        text: err instanceof Error ? err.message : "Push failed",
        ok: false,
      });
    } finally {
      pushingRef.current = false;
    }
  }

  const amTime = timeOf(data.update.amPushedAt);
  const pmTime = timeOf(data.update.pmPushedAt);

  return (
    <section className="widget-card self-start w-full">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>
          {" // MY DAY"}
        </span>
        <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
          {new Date(data.date).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}
        </span>
      </div>

      <div className="widget-body space-y-5">
        {/* Doing */}
        <Group title="Doing" count={data.doing.length}>
          {data.doing.length === 0 ? (
            <Empty>Nothing in progress yet — start something from “Up next”.</Empty>
          ) : (
            data.doing.map((t) => (
              <Row key={t.id} task={t} onOpen={() => setViewTask(t)}>
                <button
                  type="button"
                  onClick={() => markDone(t)}
                  disabled={update.isPending}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 transition hover:text-emerald-800"
                >
                  <CheckCircleIcon className="h-4 w-4" /> Mark as Done
                </button>
              </Row>
            ))
          )}
        </Group>

        {/* Up next */}
        {data.upcoming.length > 0 ? (
          <Group title="Up next" count={data.upcoming.length}>
            {data.upcoming.slice(0, 8).map((t) => (
              <Row key={t.id} task={t} onOpen={() => setViewTask(t)}>
                <button
                  type="button"
                  onClick={() => start(t)}
                  disabled={update.isPending}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-700)] transition hover:text-[var(--brand-800)]"
                >
                  <ArrowRightCircleIcon className="h-4 w-4" /> Start
                </button>
              </Row>
            ))}
          </Group>
        ) : null}

        {/* Done today */}
        <Group title="Done today" count={data.done.length}>
          {data.done.length === 0 ? (
            <Empty>No tasks completed yet today.</Empty>
          ) : (
            data.done.map((t) => (
              <Row key={t.id} task={t}>
                <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
              </Row>
            ))
          )}
        </Group>

        {/* Monday: this week */}
        {data.isMonday ? (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-2)]">This week</p>
            <textarea
              className="app-textarea w-full"
              rows={3}
              value={weekPlan}
              onChange={(e) => setWeekPlan(e.target.value)}
              placeholder="What's the plan this week?"
            />
            <p className="mt-1 text-[11px] text-[var(--text-4)]">
              Pre-filled from tasks due this week — edit before pushing.
            </p>
          </div>
        ) : null}

        {/* Optional note */}
        <div>
          <p className="mb-1 text-xs font-medium text-[var(--text-2)]">
            Note <span className="text-[var(--text-4)]">(optional)</span>
          </p>
          <input
            className="app-input w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything to flag?"
          />
        </div>

        {/* Push actions — clicking opens a confirmation preview before anything posts. */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-2)] pt-4">
          <Button
            type="button"
            variant="secondary"
            leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
            onClick={() => setConfirm("AM")}
            loading={push.isPending && pushed !== "PM"}
          >
            Push morning
          </Button>
          <Button
            type="button"
            variant="primary"
            leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
            onClick={() => setConfirm("PM")}
            loading={push.isPending && pushed !== "AM"}
          >
            Push end of day
          </Button>
          <PhaseStatus label="AM" time={amTime} onDelete={() => deleteUpdate("AM")} deleting={del.isPending} />
          <PhaseStatus label="PM" time={pmTime} onDelete={() => deleteUpdate("PM")} deleting={del.isPending} />
          {pushMsg ? (
            <span
              className={
                pushMsg.ok
                  ? "text-[11px] font-medium text-emerald-600"
                  : "text-[11px] font-medium text-[var(--text-4)]"
              }
            >
              {pushMsg.text}
            </span>
          ) : null}
        </div>
      </div>

      {/* Pre-send confirmation — preview exactly what will post before it goes out. */}
      <PushConfirmModal
        phase={confirm}
        tasks={confirm === "AM" ? data.doing : confirm === "PM" ? data.done : []}
        note={note.trim()}
        weekPlan={confirm === "AM" && data.isMonday ? weekPlan.trim() : ""}
        sending={push.isPending}
        onCancel={() => setConfirm(null)}
        onSend={() => confirm && pushUpdate(confirm)}
      />

      {/* Quick View — details + status action for a Doing/Up next task, no navigation away. */}
      <TaskQuickViewModal
        task={viewTask}
        busy={update.isPending}
        onClose={() => setViewTask(null)}
        onStart={(t) => start(t).then(() => setViewTask(null))}
        onMarkDone={(t) => markDone(t).then(() => setViewTask(null))}
      />
    </section>
  );
}

/** Lightweight details + status-change modal for a task in the Doing/Up next lists. */
function TaskQuickViewModal({
  task,
  busy,
  onClose,
  onStart,
  onMarkDone,
}: {
  task: TaskDTO | null;
  busy: boolean;
  onClose: () => void;
  onStart: (task: TaskDTO) => void;
  onMarkDone: (task: TaskDTO) => void;
}) {
  return (
    <Modal open={task !== null} onClose={onClose} title="Task details">
      {task ? (
        <div className="space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">{task.title}</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-4)]">{task.client.name}</p>
          </div>

          {task.description ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-2)]">
              {task.description}
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px]">
            <div>
              <dt className="app-eyebrow mb-1">Status</dt>
              <dd className="text-[var(--text-1)]">{TASK_STATUS_LABELS[task.status]}</dd>
            </div>
            <div>
              <dt className="app-eyebrow mb-1">Priority</dt>
              <dd><TaskPriorityBadge priority={task.priority} /></dd>
            </div>
            <div>
              <dt className="app-eyebrow mb-1">Label</dt>
              <dd>
                {task.label ? <TaskLabelBadge label={task.label} /> : <span className="text-[var(--text-4)]">—</span>}
              </dd>
            </div>
            <div>
              <dt className="app-eyebrow mb-1">Due</dt>
              <dd className="text-[var(--text-1)]">
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No due date"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="app-eyebrow mb-1">Assignees</dt>
              <dd className="text-[var(--text-1)]">
                {task.assignees.length ? task.assignees.map((a) => a.name).join(", ") : "Unassigned"}
              </dd>
            </div>
          </dl>

          <div className="flex justify-end gap-2 border-t border-[var(--border-2)] pt-3">
            <Button type="button" variant="tertiary" onClick={onClose}>
              Close
            </Button>
            {task.status === "DOING" || task.status === "IN_REVIEW" || task.status === "UI_DONE" ? (
              <Button
                type="button"
                variant="primary"
                leadingIcon={<CheckCircleIcon className="h-4 w-4" />}
                loading={busy}
                onClick={() => onMarkDone(task)}
              >
                Mark as Done
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                leadingIcon={<ArrowRightCircleIcon className="h-4 w-4" />}
                loading={busy}
                onClick={() => onStart(task)}
              >
                Start
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/** AM/PM status chip — shows the push time and, once pushed, a delete (retract) action. */
function PhaseStatus({
  label,
  time,
  onDelete,
  deleting,
}: {
  label: "AM" | "PM";
  time: string | null;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-[var(--text-4)]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {time ? `${label} ✓ ${time}` : `${label} —`}
      {time ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          title={`Delete the ${label} update from Slack`}
          aria-label={`Delete ${label} update`}
          className="rounded-[4px] p-0.5 text-[var(--text-4)] transition hover:text-[var(--danger-500)] disabled:opacity-50"
        >
          <TrashIcon className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

/** Confirmation modal previewing the standup before it posts to Slack. */
function PushConfirmModal({
  phase,
  tasks,
  note,
  weekPlan,
  sending,
  onCancel,
  onSend,
}: {
  phase: "AM" | "PM" | null;
  tasks: TaskDTO[];
  note: string;
  weekPlan: string;
  sending: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  const clients = [...new Set(tasks.map((t) => t.client.name))];
  const heading = phase === "AM" ? "In progress" : "Done today";
  const nothing = tasks.length === 0 && !weekPlan;
  return (
    <Modal
      open={phase !== null}
      onClose={onCancel}
      title={phase === "AM" ? "Send morning standup" : "Send end-of-day update"}
    >
      <div className="space-y-4 p-5">
        <p className="text-[13px] text-[var(--text-3)]">
          {clients.length > 0
            ? `Posts to ${clients.length} client ${clients.length === 1 ? "channel" : "channels"}: ${clients.join(", ")}.`
            : "This won't post to any client channel — nothing here belongs to a client with a linked Slack channel."}
        </p>

        {weekPlan ? (
          <div>
            <p className="app-eyebrow mb-1">This week</p>
            <p className="whitespace-pre-wrap text-sm text-[var(--text-2)]">{weekPlan}</p>
          </div>
        ) : null}

        <div>
          <p className="app-eyebrow mb-1.5">{heading} · {tasks.length}</p>
          {tasks.length === 0 ? (
            <p className="text-[13px] text-[var(--text-4)]">
              {phase === "AM" ? "Nothing in progress." : "No tasks marked done today."}
            </p>
          ) : (
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-baseline gap-2 text-sm text-[var(--text-1)]">
                  <span className="text-[var(--text-4)]">•</span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.title}
                    <span className="ml-1.5 text-[11px] text-[var(--text-4)]">{t.client.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {note ? (
          <div>
            <p className="app-eyebrow mb-1">One thing I need</p>
            <p className="whitespace-pre-wrap text-sm text-[var(--text-2)]">{note}</p>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-[var(--border-2)] pt-3">
          <Button type="button" variant="tertiary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
            onClick={onSend}
            loading={sending}
            disabled={nothing}
          >
            {nothing ? "Nothing to send" : "Send to Slack"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text-1)]">{title}</span>
        <span className="rounded-full bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-3)]">
          {count}
        </span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  task,
  children,
  onOpen,
}: {
  task: TaskDTO;
  children: React.ReactNode;
  /** When set, the row (excluding the action button) opens the Quick View on click. */
  onOpen?: () => void;
}) {
  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      className={`flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 ${
        onOpen ? "cursor-pointer transition hover:border-[var(--brand-300)]" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--text-1)]">{task.title}</p>
        <p className="truncate text-[11px] text-[var(--text-4)]">{task.client.name}</p>
      </div>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-2 text-xs text-[var(--text-4)]">{children}</p>;
}
