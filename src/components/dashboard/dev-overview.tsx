"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import { useClientList } from "@/hooks/use-proposals";
import { useTasks } from "@/hooks/use-tasks";
import { MyDay } from "@/components/tasks/my-day";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { AskDispatchIcon } from "@/components/dispatch/ask-dispatch";
import { cn, formatDate } from "@/lib/format";
import type { TaskStatus } from "@/types/tasks";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { FadeIn } from "@/components/ui/motion/fade-in";
import { HqTodayBand } from "@/components/dashboard/hq-today-band";

const PAGE_SIZE = 5;

const STATUS_RANK: Partial<Record<TaskStatus, number>> = { DOING: 0, IN_REVIEW: 1, UI_DONE: 2, TODO: 3, BACKLOG: 4 };
const SPLIT_COLOUR: Partial<Record<TaskStatus, string>> = {
  DOING: "var(--brand-500)",
  IN_REVIEW: "var(--warning-500)",
  UI_DONE: "var(--text-3)",
  TODO: "var(--text-4)",
  BACKLOG: "var(--border-1)",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  BACKLOG:   "bg-[var(--surface-2)] text-[var(--text-3)]",
  TODO:      "bg-[var(--surface-2)] text-[var(--text-3)]",
  DOING:     "bg-blue-50 text-blue-700",
  IN_REVIEW: "bg-amber-50 text-amber-700",
  UI_DONE:   "bg-teal-50 text-teal-700",
  DONE:      "bg-emerald-50 text-emerald-700",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG:   "Backlog",
  TODO:      "To do",
  DOING:     "Doing",
  IN_REVIEW: "In review",
  UI_DONE:   "UI done",
  DONE:      "Done",
};

function Pager({
  page,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex items-center justify-between border-t border-[var(--border-2)] px-4 py-2">
      <span
        className="text-[11px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {start}–{end} of {total}
      </span>
      <div className="flex gap-0.5">
        <button
          onClick={onPrev}
          disabled={page === 0}
          className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] disabled:opacity-30"
        >
          <ChevronUpIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onNext}
          disabled={page >= totalPages - 1}
          className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] disabled:opacity-30"
        >
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Task-focused dashboard for restricted developers.
 * Three cards: My Day (standup) · My Tasks (paginated) · My Clients (paginated).
 */
export function DevOverview() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const clientsQuery = useClientList();
  const clients = clientsQuery.data?.clients ?? [];

  // Passive dashboard summary: cap the fetch (safety ceiling) and don't refetch
  // on every window focus — this widget doesn't need the board's live self-correct.
  const tasksQuery = useTasks({ assigneeId: userId ?? "", limit: 100 }, { refetchOnFocus: false });
  // Doing first, then in review, then to do and backlog; soonest due within each.
  const allTasks = (tasksQuery.data ?? [])
    .filter((t) => t.status !== "DONE")
    .sort((a, b) => {
      const r = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
      if (r !== 0) return r;
      const da = a.dueDate ? Date.parse(a.dueDate) : Infinity;
      const db = b.dueDate ? Date.parse(b.dueDate) : Infinity;
      return da - db;
    });
  const today = new Date().toISOString().slice(0, 10);

  const [clientsPage, setClientsPage] = useState(0);

  const clientsTotalPages = Math.ceil(clients.length / PAGE_SIZE);

  const pageClients = clients.slice(clientsPage * PAGE_SIZE, (clientsPage + 1) * PAGE_SIZE);

  return (
    // ⚠️ `grid-cols-1` is load-bearing below lg, and its absence clipped this
    // dashboard on every phone. With columns declared only at `lg:`, the grid
    // falls back to `grid-template-columns: none` — ONE implicit track sized to
    // its content's max-content, not to the grid. My Day's rows do not shrink,
    // so the track measured 383.8px inside a 327px grid and the `w-full` cards
    // ran to x=408 in a 375px viewport. `.widget-card` is `overflow: hidden`
    // and <main> does not scroll sideways, so those 33px were not merely
    // off-screen, they were UNREACHABLE — and a page-X check reports clean,
    // because the page itself never overflows. Measured in the browser before
    // and after: card right edge 408px → 351px.
    //
    // `grid-cols-1` is `repeat(1, minmax(0,1fr))`, which bounds the track to
    // the grid. The `lg:` columns still win at ≥1024px, so desktop is untouched.
    <div className="space-y-4">
    {/* What needs you now: your tasks, your standup and your next meeting. */}
    <HqTodayBand access={{ tasks: true, tasksHref: "#dev-tasks", myStandup: true, rollup: false, care: false, pulse: false, calendar: true }} />
    <div className="grid items-stretch gap-4 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {/* Left — My Day standup */}
      <FadeIn>
        <div id="dev-myday" className="scroll-mt-4" data-hq-card="myday">
          <MyDay />
        </div>
      </FadeIn>

      {/* Right — My Tasks + My Clients stacked */}
      {/* My Day sets the row's height; this column fills it, with My Tasks scrolling inside, so
          the row ends level and nothing is left empty under either column (§130). */}
      <FadeIn delayMs={60} className="h-full lg:relative lg:min-h-[480px]">
      <div className="flex flex-col gap-4 lg:absolute lg:inset-0">
        {/* 02 // MY TASKS */}
        <section id="dev-tasks" className="widget-card flex min-h-0 flex-1 scroll-mt-4 flex-col" data-hq-card="mytasks">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">02</span>
              {" // MY TASKS"}
            </span>
            {allTasks.length > 0 && (
              <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
                {allTasks.length} open
              </span>
            )}
          </div>

          {tasksQuery.isPending || !userId ? (
            <div className="widget-body">
              <Skeleton className="h-24 rounded-[8px]" />
            </div>
          ) : allTasks.length === 0 ? (
            <div className="widget-body">
              <p className="py-4 text-center text-xs text-[var(--text-4)]">
                No open tasks assigned to you.
              </p>
            </div>
          ) : (
            <>
              <div className="widget-body max-h-[420px] min-h-0 flex-1 space-y-1.5 overflow-y-auto lg:max-h-none">
                <TaskSplit tasks={allTasks} />
                {allTasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/app/portal/${t.client.slug}/tasks?task=${t.id}`}
                    className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 transition hover:bg-[var(--surface-1)]"
                  >
                    {/* ⚠️ `title` is the recovery a truncated value needs, and it
                        matters MORE after the grid fix above: one column makes the
                        card narrower (384px → 327px measured at 375px), so a task
                        name that used to just fit now ellipses. Truncated with no
                        title and no scroll means the full value is unreadable
                        anywhere — `audit:clipping` flags exactly that, and it
                        already flags these two on production at 375 and 390.
                        `desk-tasks.tsx` is the precedent. */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]" title={t.title}>{t.title}</p>
                      <p className="truncate text-xs text-[var(--text-4)]" title={t.client.name}>
                        {t.client.name}
                        {t.dueDate ? (
                          <span className={cn(t.dueDate.slice(0, 10) < today && "font-medium text-[var(--danger-500)]")}>
                            {` · due ${formatDate(t.dueDate)}`}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium", STATUS_STYLES[t.status])}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>

        {/* 03 // MY CLIENTS */}
        <section className="widget-card shrink-0" data-hq-card="myclients">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">03</span>
              {" // MY CLIENTS"}
            </span>
            <Link
              href="/app/portal"
              className="widget-header__status inline-flex items-center gap-1 transition-colors hover:text-[var(--brand-700)]"
            >
              Portal <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>

          {clientsQuery.isPending ? (
            <div className="widget-body">
              <Skeleton className="h-24 rounded-[8px]" />
            </div>
          ) : clients.length === 0 ? (
            <div className="widget-body">
              <p className="py-4 text-center text-xs text-[var(--text-4)]">
                No clients assigned yet.
              </p>
            </div>
          ) : (
            <>
              <div className="widget-body space-y-1.5">
                {pageClients.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 transition hover:bg-[var(--surface-1)]"
                  >
                    <Link
                      href={`/app/portal/${c.slug}/tasks`}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2"
                    >
                      <span className="truncate text-sm font-medium text-[var(--text-1)]" title={c.name}>{c.name}</span>
                      <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
                    </Link>
                    <AskDispatchIcon clientSlug={c.slug} clientName={c.name} />
                    <NewTaskButton clientId={c.id} clientName={c.name} />
                  </div>
                ))}
              </div>
              {clients.length > PAGE_SIZE && (
                <Pager
                  page={clientsPage}
                  total={clients.length}
                  onPrev={() => setClientsPage((p) => Math.max(0, p - 1))}
                  onNext={() => setClientsPage((p) => Math.min(clientsTotalPages - 1, p + 1))}
                />
              )}
            </>
          )}
        </section>
      </div>
      </FadeIn>
    </div>
    </div>
  );
}

/** Your open tasks by status as one proportional bar, with counts. */
function TaskSplit({ tasks }: { tasks: Array<{ status: TaskStatus }> }) {
  const order: TaskStatus[] = ["DOING", "IN_REVIEW", "UI_DONE", "TODO", "BACKLOG"];
  const parts = order.map((s) => ({ s, n: tasks.filter((t) => t.status === s).length })).filter((p) => p.n > 0);
  if (parts.length === 0) return null;
  return (
    <div className="pb-1.5">
      <div className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-[2px]" aria-hidden>
        {parts.map((p) => (
          <span key={p.s} className="h-full" style={{ width: `${(p.n / tasks.length) * 100}%`, background: SPLIT_COLOUR[p.s] }} />
        ))}
      </div>
      <p
        className="mt-1 truncate text-[10px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
        title={parts.map((p) => `${p.n} ${STATUS_LABEL[p.s]}`).join(" · ")}
      >
        {parts.map((p) => `${p.n} ${STATUS_LABEL[p.s].toUpperCase()}`).join(" · ")}
      </p>
    </div>
  );
}
