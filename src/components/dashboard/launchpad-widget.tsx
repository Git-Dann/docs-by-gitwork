"use client";

import Link from "next/link";
import { RocketLaunchIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useClientList } from "@/hooks/use-proposals";
import type { WidgetSize } from "@/components/app-overview";

/**
 * Launchpad on HQ: which client is holding a build up, and on what.
 *
 * **Renders nothing when no client has a Launchpad.** That is the "shown only when
 * enabled" rule — a tile reading "0 outstanding" for a workspace that has never used
 * the feature is worse than absent, because it looks like a healthy signal rather
 * than no signal. Same shape as CareWidget: the card, border and radius come from the
 * dashboard grid in `app-overview.tsx`, so this renders the header strip and body
 * only — adding `widget-card` here would double the border.
 *
 * No new fetch: `useClientList` already carries the completeness, attached
 * server-side by `listDerivedClients`.
 */
export default function LaunchpadWidget({ index }: { size: WidgetSize; index: number }) {
  const { data, isLoading } = useClientList();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const withKits = (data?.clients ?? []).filter((c) => c.launchpad);
  // The whole tile is conditional on the feature being in use.
  if (withKits.length === 0) return null;

  // Worst first, then most-outstanding — a tile listing clients alphabetically makes
  // you do the triage it exists to do for you.
  const ordered = [...withKits].sort(
    (a, b) =>
      (a.launchpad!.percent - b.launchpad!.percent) ||
      b.launchpad!.needed - a.launchpad!.needed ||
      a.name.localeCompare(b.name),
  );

  const totalOutstanding = withKits.reduce((n, c) => n + (c.launchpad?.needed ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{String(index).padStart(2, "0")}</span>
          {" // LAUNCHPAD"}
        </span>
        {/* Coloured only when it is a call to action — amber, not red: this is work we
            are waiting on the CLIENT for, not a fault on our side. */}
        <span
          className={cn(
            "widget-header__status",
            totalOutstanding > 0 && "text-[var(--warning-500)]",
          )}
        >
          {totalOutstanding > 0 ? `${totalOutstanding} OUTSTANDING` : "ALL IN"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {ordered.map((client) => {
            const lp = client.launchpad!;
            const done = lp.needed === 0;
            return (
              <Link
                key={client.id}
                href={`/app/portal/${client.slug}/wiki#launchpad`}
                className="block rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] px-2.5 py-2 transition-colors hover:border-[var(--border-2)] hover:bg-[var(--surface-1)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-1)]">
                    {client.name}
                  </span>
                  <span
                    className={cn(
                      "widget-data-label shrink-0",
                      done ? "text-[var(--success-500)]" : "text-[var(--warning-500)]",
                    )}
                  >
                    {lp.percent}%
                  </span>
                </div>
                <div className="mt-1.5 widget-progress" aria-hidden="true">
                  <div className="widget-progress__fill" style={{ width: `${lp.percent}%` }} />
                </div>
                {/* The outstanding items are the actionable part — "60%" tells you
                    there is a problem, "app icons, Apple Developer account" tells you
                    what to chase. Truncated with a title so it stays reachable
                    (audit:clipping treats an ellipsis with no title as a defect). */}
                {!done ? (
                  <p
                    className="mt-1 truncate text-[11px] text-[var(--text-4)]"
                    title={lp.outstanding.join(", ")}
                  >
                    {lp.outstanding.slice(0, 3).join(", ")}
                    {lp.outstanding.length > 3 ? ` +${lp.outstanding.length - 3} more` : ""}
                  </p>
                ) : null}
              </Link>
            );
          })}
        </div>

        <Link
          href="/app/portal"
          className="mt-2 flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-4)] transition-colors hover:text-[var(--brand-700)]"
        >
          <RocketLaunchIcon className="h-3 w-3" />
          All clients
        </Link>
      </div>
    </div>
  );
}
