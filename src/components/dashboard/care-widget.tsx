"use client";

import Link from "next/link";
import { LifebuoyIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useSupportClients, useClientQueueSummaries } from "@/hooks/use-support";
import { formatAge, isLongWait } from "@/components/care/care-constants";
import type { WidgetSize } from "@/components/app-overview";
import { SkeletonRows } from "@/components/ui/motion/skeleton";
import { TileHeader } from "@/components/dashboard/tile-header";

/**
 * Care on HQ: which client is being let down right now.
 *
 * Three things were wrong with this tile, all of them the same three the Care module itself had:
 *
 * 1. **It reported the wrong number.** Open tickets and unread messages — but tickets are dormant in
 *    the cockpit, and `unread` was climbing on our own replies until it was fixed (§42.2). Whether a
 *    customer is *waiting on us* is the fact a dashboard exists to surface, and it wasn't here.
 * 2. **N+1.** A `useSupportTickets` + `useSupportConversations` pair PER ROW — and the conversation
 *    read pulled up to 100 full rows purely to count the unread ones. One workspace-wide roll-up
 *    replaces the lot, so the tile costs the same with 3 clients or 30.
 * 3. **Raw hex.** `#0F172A`, `#94A3B8`, `#475569`, `#1D4ED8`, `rgba(0,0,0,0.08)` — none of which
 *    flip in dark mode, so the tile was unreadable there while every token-driven tile beside it
 *    was fine.
 *
 * The tile's card, border and radius come from the dashboard grid in `app-overview.tsx`, so this
 * renders the `widget-header` strip and body only — adding `widget-card` here would double the
 * border.
 */
export default function CareWidget({ index }: { size: WidgetSize; index: number }) {
  const clientsQ = useSupportClients();
  const summariesQ = useClientQueueSummaries();

  if (clientsQ.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <TileHeader index={index} label="CARE" href="/app/care" />
        <SkeletonRows count={3} className="p-4" />
      </div>
    );
  }

  const clients = clientsQ.data?.clients ?? [];
  const summaries = summariesQ.data?.summaries ?? {};

  // Worst first — the same rule as Care home. A tile that lists clients alphabetically makes you do
  // the triage it exists to do for you.
  const ordered = [...clients].sort((a, b) => {
    const oa = summaries[a.id]?.oldestAwaitingAt ? Date.parse(summaries[a.id].oldestAwaitingAt!) : Infinity;
    const ob = summaries[b.id]?.oldestAwaitingAt ? Date.parse(summaries[b.id].oldestAwaitingAt!) : Infinity;
    if (oa !== ob) return oa - ob;
    const wa = summaries[a.id]?.awaiting ?? 0;
    const wb = summaries[b.id]?.awaiting ?? 0;
    if (wa !== wb) return wb - wa;
    return a.name.localeCompare(b.name);
  });

  const totalAwaiting = Object.values(summaries).reduce((n, s) => n + s.awaiting, 0);
  const maxAwaiting = Object.values(summaries).reduce((n, s) => Math.max(n, s.awaiting), 0);

  return (
    <div className="flex h-full flex-col">
      <TileHeader
        index={index}
        label="CARE"
        href="/app/care"
        hrefLabel="Open"
        status={summariesQ.isLoading ? "·" : totalAwaiting > 0 ? `${totalAwaiting} AWAITING` : "ALL REPLIED"}
        statusTone={totalAwaiting > 0 ? "warning" : "success"}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {clients.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
              <LifebuoyIcon className="h-6 w-6 text-[var(--text-4)]" />
              <p className="text-xs text-[var(--text-3)]">No support clients yet</p>
              <Link href="/app/care" className="text-xs font-medium text-[var(--brand-700)] hover:underline">
                Add a client →
              </Link>
            </div>
          ) : (
            <div className="space-y-0.5">
              {ordered.slice(0, 7).map((c) => {
                const s = summaries[c.id];
                const oldest = s?.oldestAwaitingAt ?? null;
                const stale = oldest ? isLongWait(oldest) : false;
                const awaiting = s?.awaiting ?? 0;
                // Bars are relative to the busiest client, so the worst queue reads at a glance.
                const width = maxAwaiting > 0 ? Math.max(awaiting > 0 ? 4 : 0, (awaiting / maxAwaiting) * 100) : 0;
                return (
                  <Link
                    key={c.id}
                    href="/app/care"
                    className="block rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
                    title={`${awaiting} awaiting a reply${oldest ? ` · longest ${formatAge(oldest)}` : ""}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-[var(--text-1)]">{c.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {oldest && (
                          <span className={cn("widget-data-label", stale && "text-[var(--warning-500)]")}>
                            {formatAge(oldest)}
                          </span>
                        )}
                        <span
                          className={cn(
                            "w-8 text-right font-mono text-[11px] tabular-nums",
                            awaiting > 0 ? "font-semibold text-[var(--warning-500)]" : "text-[var(--text-4)]",
                          )}
                        >
                          {summariesQ.isLoading ? "·" : awaiting}
                        </span>
                      </span>
                    </span>
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-[2px] bg-[var(--surface-2)]" aria-hidden>
                      <span
                        className={cn("block h-full transition-[width] duration-500", stale ? "bg-[var(--warning-500)]" : "bg-[var(--brand-500)]")}
                        style={{ width: `${width}%` }}
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
