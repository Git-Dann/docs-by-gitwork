"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightCircleIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useMyDay, usePushDailyUpdate, useUpdateTask } from "@/hooks/use-tasks";
import type { TaskDTO } from "@/types/tasks";

function timeOf(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MyDay() {
  const { data, isPending } = useMyDay();
  const update = useUpdateTask();
  const push = usePushDailyUpdate();

  const [weekPlan, setWeekPlan] = useState("");
  const [note, setNote] = useState("");
  const [pushed, setPushed] = useState<null | "AM" | "PM">(null);

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

  async function pushUpdate(phase: "AM" | "PM") {
    await push.mutateAsync({
      phase,
      weekPlan: data!.isMonday ? weekPlan : undefined,
      note: note.trim() || undefined,
    });
    setPushed(phase);
    setTimeout(() => setPushed(null), 2500);
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
              <Row key={t.id} task={t}>
                <button
                  type="button"
                  onClick={() => markDone(t)}
                  disabled={update.isPending}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 transition hover:text-emerald-800"
                >
                  <CheckCircleIcon className="h-4 w-4" /> Done
                </button>
              </Row>
            ))
          )}
        </Group>

        {/* Up next */}
        {data.upcoming.length > 0 ? (
          <Group title="Up next" count={data.upcoming.length}>
            {data.upcoming.slice(0, 8).map((t) => (
              <Row key={t.id} task={t}>
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

        {/* Push actions */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-2)] pt-4">
          <Button
            type="button"
            variant="secondary"
            leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
            onClick={() => pushUpdate("AM")}
            loading={push.isPending && pushed !== "PM"}
          >
            Push morning
          </Button>
          <Button
            type="button"
            variant="primary"
            leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
            onClick={() => pushUpdate("PM")}
            loading={push.isPending && pushed !== "AM"}
          >
            Push end of day
          </Button>
          <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
            {amTime ? `AM ✓ ${amTime}` : "AM —"} · {pmTime ? `PM ✓ ${pmTime}` : "PM —"}
          </span>
          {pushed ? (
            <span className="text-[11px] font-medium text-emerald-600">Pushed to Slack</span>
          ) : null}
        </div>
      </div>
    </section>
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

function Row({ task, children }: { task: TaskDTO; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--text-1)]">{task.title}</p>
        <p className="truncate text-[11px] text-[var(--text-4)]">{task.client.name}</p>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-2 text-xs text-[var(--text-4)]">{children}</p>;
}
