"use client";

import { useMyDay, useTaskAttention } from "@/hooks/use-tasks";
import type { TaskDTO } from "@/types/tasks";
import { EditorialRow, Stamp, DeskTaskRow, DeskEmpty, DeskSkeleton, RevealList } from "./desk-shared";

/** TASKS tab — the caller's work grouped by urgency as editorial rows. All from
 *  existing scoped queries (attention + my-day), so it matches the Portal board. */
export function DeskTasks() {
  const attention = useTaskAttention({ mine: true });
  const myDay = useMyDay();

  if (attention.isPending || myDay.isPending) {
    return (
      <div className="space-y-3">
        <DeskSkeleton />
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
    return (
      <EditorialRow
        title="Your tasks"
        caption="Everything assigned to you, by urgency."
        stamp={<Stamp label="My tasks" href="/app" />}
        first
      >
        <DeskEmpty>No tasks assigned to you right now — enjoy the calm.</DeskEmpty>
      </EditorialRow>
    );
  }

  return (
    <div>
      {overdue.length > 0 ? (
        <EditorialRow
          title="Overdue"
          count={attention.data?.overdueCount}
          caption="Past their due date — clear these first."
          stamp={<Stamp label="My tasks" href="/app" />}
          first
        >
          <TaskList tasks={overdue} />
        </EditorialRow>
      ) : null}

      {doing.length > 0 ? (
        <EditorialRow title="In progress" count={attention.data?.doingCount} first={overdue.length === 0}>
          <TaskList tasks={doing} />
        </EditorialRow>
      ) : null}

      {upcoming.length > 0 ? (
        <EditorialRow title="Up next" caption="Ready to pick up.">
          <TaskList tasks={upcoming} />
        </EditorialRow>
      ) : null}

      {doneToday.length > 0 ? (
        <EditorialRow title="Done today" count={doneToday.length}>
          <TaskList tasks={doneToday} showStatus={false} />
        </EditorialRow>
      ) : null}
    </div>
  );
}

function TaskList({ tasks, showStatus = true }: { tasks: TaskDTO[]; showStatus?: boolean }) {
  return (
    <RevealList
      items={tasks}
      initial={5}
      renderItem={(t, i) => (
        <DeskTaskRow key={t.id} task={t} index={i + 1} showStatus={showStatus} />
      )}
    />
  );
}
