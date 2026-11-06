"use client";

/** HQ's first-run checklist for a new business (src/lib/getting-started.ts). Hidden once done. */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { apiFetch } from "@/lib/api";
import type { GettingStartedStep } from "@/lib/getting-started";

export function GettingStartedCard() {
  const { data } = useQuery({
    queryKey: ["workspace", "getting-started"],
    queryFn: () => apiFetch<{ show: boolean; steps: GettingStartedStep[] }>("/api/workspace/getting-started"),
    staleTime: 60_000,
  });
  if (!data?.show || !Array.isArray(data.steps)) return null;
  const done = data.steps.filter((s) => s.done).length;

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">Getting started</span>
        <span className="widget-header__status">
          {done} of {data.steps.length} done
        </span>
      </div>
      <ul className="widget-body grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {data.steps.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              className="flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] px-3 py-2.5 text-sm text-[var(--text-1)] transition hover:bg-[var(--surface-1)]"
            >
              {s.done ? (
                <CheckCircleIcon className="h-4 w-4 shrink-0 text-[var(--success-500)]" aria-label="Done" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-[var(--border-2)]" aria-hidden />
              )}
              <span className={s.done ? "text-[var(--text-3)] line-through" : undefined}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
