"use client";

import { useMyDay, useTaskAttention } from "@/hooks/use-tasks";
import type { TaskDTO } from "@/types/tasks";
import { DeskSectionLabel, DeskTaskRow, DeskEmpty, DeskSkeleton } from "./desk-shared";

/** TASKS tab — the caller's work grouped by urgency. All from existing scoped
 *  queries (attention + my-day), so it matches the Portal board exactly. */
export function DeskTasks() {
  const attention = useTaskAttention({ mine: true });
  const myDay = useMyDay();

  const loading = attention.isPending || myDay.isPending;

  if (loading) {
    return (
      <div className="space-y-4">
        <DeskSkeleton />
        <DeskSkeleton />
      </div>
    );
  }

  const overdue = attention.data?.overdue ?? [];
  const doing = attention.data?.doing ?? [];
  const upcoming = myDay.data?.upcoming ?? [];
  const doneToday = myDay.data?.done ?? [];

  const isEmpty =
    overdue.length === 0 && doing.length === 0 && upcoming.length === 0 && doneToday.length === 0;

  if (isEmpty) {
    return <DeskEmpty>No tasks assigned to you right now.</DeskEmpty>;
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-5">
        <Group label="Overdue" tasks={overdue} count={attention.data?.overdueCount} emptyHidden />
        <Group label="In progress" tasks={doing} count={attention.data?.doingCount} emptyHidden />
      </div>
      <div className="space-y-5">
        <Group label="Up next" tasks={upcoming} emptyHidden />
        <Group label="Done today" tasks={doneToday} emptyHidden showStatus={false} />
      </div>
    </div>
  );
}

function Group({
  label,
  tasks,
  count,
  emptyHidden,
  showStatus = true,
}: {
  label: string;
  tasks: TaskDTO[];
  count?: number;
  emptyHidden?: boolean;
  showStatus?: boolean;
}) {
  if (tasks.length === 0 && emptyHidden) return null;
  return (
    <div>
      <DeskSectionLabel count={count ?? tasks.length}>{label}</DeskSectionLabel>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <DeskTaskRow key={t.id} task={t} showStatus={showStatus} />
        ))}
      </div>
    </div>
  );
}
