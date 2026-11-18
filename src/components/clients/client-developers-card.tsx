"use client";

/**
 * The developers on a Portal client: one card per person (photo or initials, job title, stack,
 * how long they've been on it, and whether they're off today), linked to their Staff profile.
 * Rules in src/lib/client-developers.ts. Rates are never shown here.
 */

import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Avatar } from "@/components/ui/avatar";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { useClientActiveCovers } from "@/hooks/use-backstage";
import { formatDate } from "@/lib/format";
import { developerCards } from "@/lib/client-developers";
import { cardBasis, cardsPerRow } from "@/lib/client-portal-layout";
import type { ClientPlacementRecord } from "@/types/client";

/** Grows to fill its row; on a narrow screen it wraps at 240px rather than squeezing. */
const devCell = "min-w-[min(100%,240px)] flex-1";

const MONO = "var(--font-mono)";
const sinceLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function ClientDevelopersCard({
  number,
  clientId,
  placements,
}: {
  number: string;
  clientId: string;
  placements: ClientPlacementRecord[];
}) {
  const covers = useClientActiveCovers(clientId);
  // The demo's catch-all can answer {} here; only a list is a list.
  const coverList = Array.isArray(covers.data) ? covers.data : [];
  const { active, past, standIns } = developerCards(placements, coverList);
  const basis = cardBasis(cardsPerRow(active.length + standIns.length), 8);

  return (
    <section className="widget-card flex flex-col">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {" // DEVELOPERS"}
        </span>
        {active.length > 0 || past.length > 0 ? (
          <span className="widget-header__status">
            {active.length} active{past.length > 0 ? ` · ${past.length} past` : ""}
          </span>
        ) : (
          <Link href="/app/codeclear/candidates" className="widget-header__status transition-colors hover:text-[var(--brand-700)]">
            Assign in Staff →
          </Link>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {active.length === 0 && standIns.length === 0 ? (
          <p className="text-sm text-[var(--text-4)]">
            Nobody is placed on this client.{" "}
            <Link href="/app/codeclear/candidates" className="text-[var(--brand-700)] hover:underline">
              Place a developer
            </Link>
          </p>
        ) : (
          // Wrapping flex rather than a fixed grid: the per-row count comes from how many there are,
          // and every card grows, so a short last row stretches instead of leaving a hole.
          <ul className="flex flex-wrap gap-2" data-dev-grid>
            {active.map((d) => (
              <li key={d.candidateId} className={devCell} style={{ flexBasis: basis }}>
                <Link
                  href={`/app/staff/${d.candidateId}`}
                  className="group flex h-full items-start gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3 transition hover:border-[var(--brand-400)] hover:bg-[var(--surface-1)]"
                >
                  <span className="relative">
                    <Avatar src={d.avatarUrl} name={d.name} size={36} />
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[var(--surface-0)] p-[2px]">
                      {d.onLeave ? <StatusDot tone="warning" size="xs" label="On leave" /> : <StatusDot tone="success" size="xs" label="On this client" />}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-[13px] font-semibold text-[var(--text-1)]" title={d.name}>
                        {d.name}
                      </span>
                      <ChevronRightIcon className="h-3 w-3 shrink-0 text-[var(--text-4)] opacity-0 transition group-hover:opacity-100" />
                    </span>
                    <span className="block truncate text-[12px] text-[var(--text-3)]" title={d.jobTitle ?? undefined}>
                      {d.jobTitle ?? "Developer"}
                    </span>
                    {d.stack.length > 0 ? (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {d.stack.slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="inline-flex h-[18px] items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 text-[10px] text-[var(--text-2)]"
                            style={{ fontFamily: MONO }}
                          >
                            {s}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span
                      className="mt-1.5 block truncate text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
                      style={{ fontFamily: MONO }}
                      title={[`Since ${sinceLabel(d.since)}`, d.allocationPercent < 100 ? `${d.allocationPercent}%` : null, d.projects.join(", ") || null].filter(Boolean).join(" · ")}
                    >
                      Since {sinceLabel(d.since)}
                      {d.allocationPercent < 100 ? ` · ${d.allocationPercent}%` : ""}
                      {d.projects.length > 0 ? ` · ${d.projects.join(", ")}` : ""}
                    </span>
                    {d.onLeave ? (
                      <span className="mt-1.5 block text-[11px] text-amber-700">
                        Off{d.onLeave.until ? ` until ${dayLabel(d.onLeave.until)}` : " today"}
                        {d.onLeave.coveredBy ? ` · ${d.onLeave.coveredBy} covering` : ""}
                      </span>
                    ) : d.covering.length > 0 ? (
                      <span className="mt-1.5 block text-[11px] text-[var(--brand-700)]">Covering for {d.covering.join(", ")}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
            {standIns.map((c) => (
              <li key={c.absenceId} className={devCell} style={{ flexBasis: basis }}>
                <div className="flex h-full items-start gap-3 rounded-[8px] border border-dashed border-amber-300 bg-amber-50 p-3">
                  <Avatar name={c.coverUserName ?? "Cover"} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-amber-900">{c.coverUserName ?? "Cover"}</span>
                    <span className="block text-[12px] text-amber-800">
                      Covering for {c.absentUserName.split(" ")[0]}
                      {c.endDate ? ` until ${dayLabel(c.endDate)}` : " today"}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {past.length > 0 ? (
          <details className="group/past mt-auto rounded-[6px] border border-[var(--border-2)]">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]" style={{ fontFamily: MONO }}>
              <ChevronRightIcon className="h-3 w-3 transition group-open/past:rotate-90" />
              {past.length} past
            </summary>
            <ul className="divide-y divide-[var(--border-3)] border-t border-[var(--border-2)]">
              {past.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/staff/${p.candidateId}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-1)]">
                    <Avatar src={p.candidateAvatarUrl} name={p.candidateName} size={22} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-2)]" title={p.candidateName}>
                      {p.candidateName}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                      {formatDate(p.startDate)} – {p.endDate ? formatDate(p.endDate) : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
