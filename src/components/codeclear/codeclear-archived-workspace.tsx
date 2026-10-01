/**
 * Code → Archived: developers whose person has been archived in Settings → Team.
 *
 * Nothing on this page archives anyone. Archive and Restore live in the Team
 * table, and this tab follows it — a developer appears here when their team
 * member is archived and goes back to Developers the moment they're restored.
 * See src/server/codeclear-archived.ts for how the two are linked (by email).
 *
 * The card is deliberately reduced to name, avatar and specialism: someone who has
 * left has no rate, no current clients and no pipeline state worth showing.
 */

"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { CodeClearTabs, EmptyState } from "@/components/codeclear/codeclear-shared";
import { useCodeClearCandidates } from "@/hooks/use-codeclear";

export function CodeClearArchivedWorkspace() {
  const query = useCodeClearCandidates({
    archived: true,
    // The whole archive at once — it is a short list by nature (people who have
    // left in the last 30 days, plus anyone removed earlier).
    pageSize: 200,
    sortBy: "name",
    sortDir: "asc",
  });
  const items = query.data?.items ?? [];

  return (
    <div className="space-y-6">
      <CodeClearTabs />

      <section className="app-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="widget-data-label">Archived</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-4)]">
            {items.length} dev{items.length === 1 ? "" : "s"}
          </p>
        </div>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Developers whose Foundry access has been removed. Restore someone from{" "}
          <Link href="/app/settings/team" className="text-[var(--brand-600)] hover:underline">
            Settings → Team
          </Link>{" "}
          and they move back to Developers.
        </p>

        {query.isLoading ? (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="Nobody is archived"
              body="When you archive a team member in Settings → Team, their developer card moves here."
            />
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((c) => (
              <Link
                key={c.id}
                href={`/app/codeclear/candidates/${c.id}`}
                // Stacked and centred on purpose — declared here rather than inherited,
                // because `.widget-card` sets its own flex-direction and silently
                // overrode a row layout in the first version of this card.
                className="widget-card flex-col items-center gap-2 p-4 text-center transition-shadow hover:shadow-[rgba(0,0,0,0.06)_0px_4px_16px]"
              >
                <Avatar src={c.avatarUrl} name={c.name} size={40} />
                <div className="w-full min-w-0">
                  <p className="truncate font-semibold leading-snug text-[var(--text-2)]" title={c.name}>
                    {c.name}
                  </p>
                  <p className="mt-0.5 truncate widget-data-label" title={c.primaryStack}>
                    {c.primaryStack}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Honest about the one thing it cannot do. */}
        <p className="mt-5 text-xs text-[var(--text-4)]">
          Matched to Team by email. A developer card with no email, or a different one from the
          address they sign in with, stays under Developers.
        </p>
      </section>
    </div>
  );
}
