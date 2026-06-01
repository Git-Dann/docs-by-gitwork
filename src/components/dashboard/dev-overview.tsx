"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { useClientList } from "@/hooks/use-proposals";
import { MyDay } from "@/components/tasks/my-day";

/**
 * Task-focused dashboard for restricted developers. Replaces the full agency
 * bento grid with their standup ("My Day") plus the clients they're assigned to.
 */
export function DevOverview() {
  const clientsQuery = useClientList();
  const clients = clientsQuery.data?.clients ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <MyDay />

      <div className="space-y-4">
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">02</span>
              {" // MY CLIENTS"}
            </span>
            <Link
              href="/app/portal?tab=tasks"
              className="widget-header__status inline-flex items-center gap-1 transition-colors hover:text-[var(--brand-700)]"
            >
              Task board <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
          <div className="widget-body space-y-1.5">
            {clientsQuery.isPending ? (
              <div className="h-24 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
            ) : clients.length === 0 ? (
              <p className="py-4 text-center text-xs text-[var(--text-4)]">
                No clients assigned yet.
              </p>
            ) : (
              clients.map((c) => (
                <Link
                  key={c.id}
                  href={`/app/portal/${c.slug}`}
                  className="flex items-center justify-between rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 transition hover:bg-[var(--surface-1)]"
                >
                  <span className="truncate text-sm font-medium text-[var(--text-1)]">{c.name}</span>
                  <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
