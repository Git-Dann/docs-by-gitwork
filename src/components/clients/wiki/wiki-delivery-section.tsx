"use client";

/**
 * Delivery — "how are we doing", for the client.
 *
 * Pure presentation. Everything on this page is derived at render from `wiki.timeline`
 * and `wiki.blockers`, which the DTO already carries and which are already scoped
 * client-safe. No loader, no route, no schema beyond the enable flag.
 *
 * The figure that justifies the page is **"waiting on you"** — open blockers with no
 * client reply. It already existed and was never surfaced to the person who could clear it.
 */

import { MONO, SERIF, StatTile } from "@/components/analytics/analytics-widgets";
import {
  phaseRows,
  summariseDelivery,
  type DeliveryBlocker,
  type DeliveryBlock,
  type DeliveryMilestone,
} from "@/lib/wiki-delivery";

function Bar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
      <div
        className="h-full rounded-full bg-[var(--brand-600)]"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

export function WikiDeliverySection({
  blocks,
  milestones,
  blockers,
  unassigned,
}: {
  blocks: DeliveryBlock[];
  milestones: DeliveryMilestone[];
  blockers: DeliveryBlocker[];
  /** Live work on no phase — counts toward done/total. See summariseDelivery. */
  unassigned?: readonly { done: boolean }[];
}) {
  const s = summariseDelivery({ blocks, milestones, blockers, unassigned });
  const rows = phaseRows(blocks);

  if (s.noTimeline) {
    return (
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // DELIVERY"}
          </span>
        </div>
        <p className="p-8 text-center text-sm text-[var(--text-4)]">
          {/* Explicitly "no plan yet", never "0% complete" — they are different facts. */}
          No delivery plan yet. Once the phases are set up, progress shows here.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // WHERE WE ARE"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {s.done} of {s.total} done
          </span>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span
                className="text-[44px] leading-none text-[var(--text-1)]"
                style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: "-0.01em" }}
              >
                {/* Phases exist but none are broken into tasks — "—%" would be a
                    number, and there isn't one. */}
                {s.percent === null ? "—" : `${s.percent}%`}
              </span>
              <span className="text-[12px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                {s.phasesComplete} of {blocks.length} phases complete
              </span>
            </div>
            <Bar percent={s.percent ?? 0} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="In flight" figure={String(s.phasesInFlight)} />
            <StatTile label="Not started" figure={String(s.phasesNotStarted)} />
            <StatTile
              label="Waiting on you"
              figure={String(s.waitingOnClient)}
              // The one number here a client can act on, so it is the one that gets
              // colour — and only when it is non-zero, or the colour means nothing.
              tone={s.waitingOnClient > 0 ? "warning" : undefined}
            />
          </div>

          {s.nextMilestone && (
            <p className="text-[13px] text-[var(--text-2)]">
              <span className="text-[var(--text-4)]">Next milestone:</span>{" "}
              <strong className="font-semibold">{s.nextMilestone.name}</strong>
              {" — "}
              <span style={{ fontFamily: MONO }}>
                {new Date(s.nextMilestone.date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {s.milestonesHit > 0 ? (
                <span className="text-[var(--text-4)]">
                  {" "}
                  · {s.milestonesHit} already hit
                </span>
              ) : null}
            </p>
          )}
        </div>
      </section>

      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">02</span>
            {" // BY PHASE"}
          </span>
        </div>
        <div className="divide-y divide-[var(--border-1)]">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-4 px-5 py-3">
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-1)]" title={row.name}>
                {row.name}
              </span>
              <span
                className="w-[74px] shrink-0 text-right text-[12px] text-[var(--text-3)]"
                style={{ fontFamily: MONO }}
              >
                {row.total === 0 ? "—" : `${row.done}/${row.total}`}
              </span>
              <div className="w-[96px] shrink-0 sm:w-[160px]">
                {/* A phase with no tasks gets no bar at all. A 0%-wide bar is
                    indistinguishable from "not started", and this one means
                    "nobody has broken this down yet" — a different thing. */}
                {row.percent === null ? (
                  <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                    not planned
                  </span>
                ) : (
                  <Bar percent={row.percent} />
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
