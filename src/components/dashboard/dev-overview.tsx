"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import { useClientList } from "@/hooks/use-proposals";
import { useTasks } from "@/hooks/use-tasks";
import { MyDay } from "@/components/tasks/my-day";
import { cn } from "@/lib/format";
import type { TaskStatus } from "@/types/tasks";

const PAGE_SIZE = 5;

const STATUS_STYLES: Record<TaskStatus, string> = {
  BACKLOG:   "bg-[var(--surface-2)] text-[var(--text-3)]",
  TODO:      "bg-[var(--surface-2)] text-[var(--text-3)]",
  DOING:     "bg-blue-50 text-blue-700",
  IN_REVIEW: "bg-amber-50 text-amber-700",
  DONE:      "bg-emerald-50 text-emerald-700",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG:   "Backlog",
  TODO:      "To do",
  DOING:     "Doing",
  IN_REVIEW: "In review",
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

  const tasksQuery = useTasks({ assigneeId: userId ?? "" });
  const allTasks = (tasksQuery.data ?? []).filter((t) => t.status !== "DONE");

  const [tasksPage, setTasksPage] = useState(0);
  const [clientsPage, setClientsPage] = useState(0);

  const tasksTotalPages = Math.ceil(allTasks.length / PAGE_SIZE);
  const clientsTotalPages = Math.ceil(clients.length / PAGE_SIZE);

  const pageTasks = allTasks.slice(tasksPage * PAGE_SIZE, (tasksPage + 1) * PAGE_SIZE);
  const pageClients = clients.slice(clientsPage * PAGE_SIZE, (clientsPage + 1) * PAGE_SIZE);

  return (
    <div className="grid gap-4 lg:items-start lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {/* Left — My Day standup */}
      <MyDay />

      {/* Right — My Tasks + My Clients stacked */}
      <div className="space-y-4">
        {/* 02 // MY TASKS */}
        <section className="widget-card">
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
              <div className="h-24 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
            </div>
          ) : allTasks.length === 0 ? (
            <div className="widget-body">
              <p className="py-4 text-center text-xs text-[var(--text-4)]">
                No open tasks assigned to you.
              </p>
            </div>
          ) : (
            <>
              <div className="widget-body space-y-1.5">
                {pageTasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/app/portal/${t.client.slug}/tasks`}
                    className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 transition hover:bg-[var(--surface-1)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">{t.title}</p>
                      <p className="truncate text-xs text-[var(--text-4)]">{t.client.name}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium", STATUS_STYLES[t.status])}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </Link>
                ))}
              </div>
              {allTasks.length > PAGE_SIZE && (
                <Pager
                  page={tasksPage}
                  total={allTasks.length}
                  onPrev={() => setTasksPage((p) => Math.max(0, p - 1))}
                  onNext={() => setTasksPage((p) => Math.min(tasksTotalPages - 1, p + 1))}
                />
              )}
            </>
          )}
        </section>

        {/* 03 // MY CLIENTS */}
        <section className="widget-card">
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
              <div className="h-24 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
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
                  <Link
                    key={c.id}
                    href={`/app/portal/${c.slug}/tasks`}
                    className="flex items-center justify-between rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 transition hover:bg-[var(--surface-1)]"
                  >
                    <span className="truncate text-sm font-medium text-[var(--text-1)]">{c.name}</span>
                    <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
                  </Link>
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
    </div>
  );
}
