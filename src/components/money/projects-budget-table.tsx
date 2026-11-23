"use client";

/**
 * Money's per-project table (CLAUDE.md §150): every live project's budget against what has been
 * spent, with how far the work has got. Reads /api/money/projects, which has Money's own gate.
 * Rules in src/lib/project-budget.ts.
 */

import Link from "next/link";
import { cn } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { PROJECT_STATUS_LABELS, percentText } from "@/lib/project-budget";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { TileHeader } from "@/components/dashboard/tile-header";
import { useMoneyProjects } from "@/hooks/use-projects";
import { VERDICT_DOT, VERDICT_TONE, projectDates } from "@/components/projects/project-dialogs";
import type { ProjectBudgetRow } from "@/types/projects";

const MONO = { fontFamily: "var(--font-mono)" } as const;

function money(v: number | null, currency: string, empty: string): string {
  return v == null ? empty : formatMoney(v, currency);
}

function Verdict({ r }: { r: ProjectBudgetRow }) {
  const v = r.money.verdict;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", VERDICT_TONE[v.tone])}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", VERDICT_DOT[v.tone])} aria-hidden />
      {v.text}
    </span>
  );
}

export function ProjectsBudgetTable({ index }: { index: number }) {
  const q = useMoneyProjects();
  const rows = q.data?.projects ?? [];
  const unpriced = rows.reduce((s, r) => s + r.money.unpricedDevs, 0);

  return (
    <section className="widget-card" aria-label="Projects" data-money-projects>
      <TileHeader index={index} label="Projects" />
      {q.isPending ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : q.isError ? (
        <p className="px-4 py-6 text-sm text-[var(--text-3)]">
          Projects couldn&apos;t be loaded just now.{" "}
          <button type="button" className="app-button app-button-hyperlink" onClick={() => void q.refetch()}>
            Try again
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--text-3)]">
          No projects yet. Add one on a client&apos;s page in Portal and link the accepted proposal: its budget appears here against what has been spent.
        </p>
      ) : (
        <>
          {/* Phones: one card per project. */}
          <ul className="divide-y divide-[var(--border-1)] md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <Link href={`/app/portal/${r.clientSlug}`} className="text-sm font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">
                  {r.name}
                </Link>
                <p className="text-[11px] text-[var(--text-4)]">
                  {r.clientName} · {PROJECT_STATUS_LABELS[r.status]}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <Pair label="Budget" value={money(r.money.budget, r.money.currency, "None")} />
                  <Pair label="Spent" value={money(r.money.spent, r.money.currency, "Unknown")} />
                  <Pair label="Burned" value={percentText(r.money.burned)} />
                  <Pair label="Work done" value={percentText(r.progress.share)} />
                </dl>
                <div className="mt-2">
                  <Verdict r={r} />
                </div>
              </li>
            ))}
          </ul>

          {/* From md: a table in its own scroller (the card clips, it doesn't scroll). */}
          <div className="hidden overflow-x-auto md:block">
            <table className="app-table app-table--dense min-w-[900px]">
              <thead>
                <tr>
                  <th className="text-left">Project</th>
                  <th className="text-left">Dates</th>
                  <th className="text-right">Budget</th>
                  <th className="text-right" title="What the developers on the client cost at rate-card rates over the project's dates so far">
                    Spent
                  </th>
                  <th className="text-right">Burned</th>
                  <th className="text-right">Time gone</th>
                  <th className="text-right">Work done</th>
                  <th className="text-left">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/portal/${r.clientSlug}`} className="font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">
                        {r.name}
                      </Link>
                      <span className="block text-[11px] text-[var(--text-4)]">
                        {r.clientName} · {PROJECT_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="text-[12px] text-[var(--text-3)]">{projectDates(r)}</td>
                    <td className="text-right tabular-nums">{money(r.money.budget, r.money.currency, "—")}</td>
                    <td className="text-right tabular-nums">
                      {money(r.money.spent, r.money.currency, "Unknown")}
                      {r.money.unpricedDevs > 0 ? (
                        <span className="ml-1 text-[var(--text-4)]" title={`${r.money.unpricedDevs} developer(s) with no rate, left out`}>
                          +{r.money.unpricedDevs}
                        </span>
                      ) : null}
                    </td>
                    <td className={cn("text-right tabular-nums", r.money.burned != null && r.money.burned > 1 && "text-[var(--danger-500)]")}>
                      {percentText(r.money.burned)}
                    </td>
                    <td className="text-right tabular-nums">{percentText(r.timeShare)}</td>
                    <td className="text-right tabular-nums">{percentText(r.progress.share)}</td>
                    <td>
                      <Verdict r={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--border-1)] px-4 py-2.5 text-xs text-[var(--text-3)]">
            Budgets come from each project&apos;s accepted document. Spent is what the developers on the client cost at rate-card rates
            over the project&apos;s dates so far, at today&apos;s rates.
            {unpriced > 0 ? ` ${unpriced} developer placement${unpriced === 1 ? " has" : "s have"} no rate and ${unpriced === 1 ? "is" : "are"} left out.` : ""}
          </p>
        </>
      )}
    </section>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
        {label}
      </dt>
      <dd className="tabular-nums text-[var(--text-1)]">{value}</dd>
    </div>
  );
}
