"use client";

import Link from "next/link";
import { useMyDay, useTaskAttention } from "@/hooks/use-tasks";
import { useMyLeadActions } from "@/hooks/use-crm";
import { cn, formatDate } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/crm/lead-stage-engine";
import type { TaskDTO } from "@/types/tasks";
import type { MyLeadAction } from "@/types/crm";
import { EditorialRow, Stamp, DeskTaskRow, DeskEmpty, DeskSkeleton, RevealList } from "./desk-shared";

/** TASKS tab — the caller's work grouped by urgency as editorial rows. All from
 *  existing scoped queries (attention + my-day), so it matches the Portal board. */
export function DeskTasks() {
  const attention = useTaskAttention({ mine: true });
  const myDay = useMyDay();
  // Sales actions you own on leads (CRM). Shown beside your delivery tasks so a follow-up
  // doesn't depend on someone opening the lead.
  const leadActions = useMyLeadActions();

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
  const followUps = leadActions.data ?? [];

  const isEmpty =
    overdue.length === 0 &&
    doing.length === 0 &&
    upcoming.length === 0 &&
    doneToday.length === 0 &&
    followUps.length === 0;

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

      {followUps.length > 0 ? (
        <EditorialRow
          title="Lead follow-ups"
          count={followUps.length}
          caption="Next steps you own on leads."
          first={overdue.length === 0}
        >
          <RevealList
            items={followUps}
            initial={5}
            renderItem={(a, i) => <LeadActionRow key={a.id} action={a} index={i + 1} />}
          />
        </EditorialRow>
      ) : null}

      {doing.length > 0 ? (
        <EditorialRow
          title="In progress"
          count={attention.data?.doingCount}
          first={overdue.length === 0 && followUps.length === 0}
        >
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

function LeadActionRow({ action, index }: { action: MyLeadAction; index: number }) {
  const overdue = action.dueAt ? new Date(action.dueAt).getTime() < Date.now() : false;
  const meta = `${action.lead.name}${action.lead.stage ? ` · ${STAGE_LABEL[action.lead.stage]}` : ""}`;
  return (
    <Link
      href={`/app/portal/${action.lead.slug}`}
      className="group flex items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3 transition hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]"
    >
      <span className="shrink-0 text-[11px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
        {String(index).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-1)]" title={action.title}>
          {action.title}
        </p>
        <p className="truncate text-xs text-[var(--text-4)]" title={meta}>
          {meta}
          {action.dueAt ? (
            <span className={cn("ml-1.5", overdue && "text-[var(--danger-500)]")}>
              · {overdue ? "Overdue " : "Due "}
              {formatDate(action.dueAt)}
            </span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}
