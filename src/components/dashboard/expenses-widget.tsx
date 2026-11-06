"use client";

import Link from "next/link";
import { useExpenses } from "@/hooks/use-backstage";
import type { WidgetSize } from "@/components/app-overview";
import { SkeletonWidget } from "@/components/ui/motion/skeleton";

/**
 * `NN // EXPENSES` on Foundry HQ, for whoever reviews expenses (Super Admins and
 * `backstage.expenses`, first Siân, Nov 2026): what's waiting, what it adds up to, and the
 * latest few.
 */
function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function ExpensesWidget({ index }: { size: WidgetSize; index: number }) {
  const num = String(index).padStart(2, "0");
  const waiting = useExpenses("team", "SUBMITTED");
  if (waiting.isPending) return <SkeletonWidget />;

  const rows = waiting.data ?? [];
  // Totals per currency: adding pounds to euros would be a number that means nothing.
  const totals = new Map<string, number>();
  for (const e of rows) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount);
  const totalLabel = [...totals].map(([c, a]) => money(a, c)).join(" + ");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-1)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
          {`${num} // EXPENSES`}
        </span>
        <Link href="/app/backstage?area=expenses" className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          Expenses
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {waiting.isError ? (
          <p className="text-xs text-[var(--text-3)]">Couldn&apos;t load expenses.</p>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-[34px] leading-none text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
                {rows.length}
              </span>
              <span className="text-xs text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
                to review
                {totalLabel ? ` · ${totalLabel}` : ""}
              </span>
            </p>
            <div className="min-h-0 flex-1 overflow-hidden">
              {rows.length === 0 ? (
                <p className="text-xs text-[var(--text-3)]">Nothing waiting.</p>
              ) : (
                <ul className="space-y-1">
                  {rows.slice(0, 3).map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-[var(--text-1)]" title={`${e.user.name}${e.vendor ? ` · ${e.vendor}` : ""}`}>
                        {e.user.name}
                        {e.vendor ? <span className="text-[var(--text-3)]"> · {e.vendor}</span> : null}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-[var(--text-2)]">{money(e.amount, e.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
