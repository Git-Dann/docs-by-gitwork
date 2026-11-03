"use client";

/**
 * RoundUp — the weekly summary pack, for the client.
 *
 * Pure presentation over `wiki.timeline` + `wiki.blockers`, exactly like Delivery: no
 * loader, no route beyond the enable flag. Every figure is derived at render, so the
 * page is never stale and costs nothing per client — which is what makes it viable for
 * all thirteen rather than one.
 *
 * ⚠️ Because it is always-live, "last week" is a SLIDING seven-day window, not a frozen
 * week. The panel states its own dates rather than saying "last week" and leaving the
 * reader to assume which one. If a frozen weekly record is ever wanted — something you
 * send and archive — that is a Docs REPORT built on this same derivation, not a change
 * to this page.
 */

import { MONO, SERIF, StatTile } from "@/components/analytics/analytics-widgets";
import { InsightVennChart } from "@/components/clients/insights/insight-charts";
import { GanttChart, type GanttBlock, type GanttMilestone } from "@/components/tasks/gantt-chart";
import {
  summariseDelivery,
  type DeliveryBlock,
  type DeliveryBlocker,
  type DeliveryMilestone,
} from "@/lib/wiki-delivery";
import { summariseRoundup, type RoundupBlock, type RoundupItem } from "@/lib/wiki-roundup";

/** `d MMM`, in UTC so the label cannot drift by a day with the reader's timezone. */
function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function ItemRow({ item, showDate }: { item: RoundupItem; showDate: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-[var(--border-1)] py-2 last:border-b-0">
      <span className="min-w-0">
        <span className="block text-[14px] text-[var(--text-1)]">{item.title}</span>
        {item.block && (
          <span
            className="mt-0.5 block text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
            style={{ fontFamily: MONO }}
          >
            {item.block}
          </span>
        )}
      </span>
      {showDate && item.at && (
        <span
          className="shrink-0 text-[12px] whitespace-nowrap text-[var(--text-4)] tabular-nums"
          style={{ fontFamily: MONO }}
        >
          {shortDay(item.at)}
        </span>
      )}
    </li>
  );
}

function Panel({
  number,
  label,
  status,
  children,
}: {
  number: string;
  label: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">{number}</span>
          {` // ${label}`}
        </span>
        {status && (
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {status}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export function WikiRoundupSection({
  blocks,
  milestones,
  blockers,
  unassigned,
  now,
}: {
  /**
   * The DTO's timeline block satisfies both shapes. Typed as the intersection so the
   * section cannot be handed something that only one of the two derivations can read.
   */
  blocks: (RoundupBlock & DeliveryBlock & GanttBlock)[];
  milestones: (DeliveryMilestone & GanttMilestone)[];
  blockers: DeliveryBlocker[];
  /**
   * Live work on no phase. ⚠️ Not decoration: on GAIA Bloom both in-progress tasks
   * were here, so without it "ON NOW" renders empty while the team is working.
   */
  unassigned?: readonly import("@/lib/wiki-roundup").RoundupTask[];
  /** Injected so a test or a screenshot can pin the window. Defaults to render time. */
  now?: Date;
}) {
  const at = now ?? new Date();
  const r = summariseRoundup(blocks, at, { unassigned });
  const d = summariseDelivery({ blocks, milestones, blockers, unassigned });

  // ⚠️ "more than last week" is only sayable when BOTH weeks are measurable. With
  // undated completions the comparison is meaningless, so it is not drawn at all.
  const comparable = r.deliveredUndated === 0;

  /** Work the Venn cannot show, because a circle counts workstreams and this has none. */
  const loose = unassigned ?? [];
  const looseCounts = {
    total: loose.length,
    inFlight: loose.filter((t) => !t.done && t.startedAt).length,
  };
  const delta = r.delivered.length - r.deliveredPrevious;

  return (
    <div className="space-y-4">
      <Panel
        number="01"
        label="THIS WEEK"
        status={`${shortDay(r.window.fromISO)} – ${shortDay(r.window.toISO)}`}
      >
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p
                className="text-[11px] tracking-[0.12em] text-[var(--text-4)] uppercase"
                style={{ fontFamily: MONO }}
              >
                Delivered
              </p>
              <p
                className="mt-1 text-[36px] leading-none text-[var(--text-1)]"
                style={{ fontFamily: SERIF }}
              >
                {r.delivered.length}
              </p>
              {comparable && (
                <p className="mt-1 text-[12px] text-[var(--text-4)]">
                  {delta === 0
                    ? `same as the ${r.window.days} days before`
                    : `${delta > 0 ? "+" : ""}${delta} on the ${r.window.days} days before (${r.deliveredPrevious})`}
                </p>
              )}
            </div>
            <StatTile label="In flight" figure={String(r.totals.inFlight)} />
            <StatTile label="Still to do" figure={String(r.totals.planned)} />
            <StatTile
              label="Waiting on you"
              figure={String(d.waitingOnClient)}
              tone={d.waitingOnClient > 0 ? "warning" : "default"}
            />
          </div>

          {r.blindSpots.length > 0 && (
            <div className="mt-5 space-y-2 border-t border-[var(--border-1)] pt-4">
              <p
                className="text-[11px] tracking-[0.12em] text-[var(--warning-500)] uppercase"
                style={{ fontFamily: MONO }}
              >
                What this does not cover
              </p>
              {r.blindSpots.map((b) => (
                <p key={b.kind} className="text-[13px] leading-relaxed text-[var(--text-3)]">
                  {b.message}
                </p>
              ))}
            </div>
          )}

          {r.delivered.length > 0 ? (
            <ul className="mt-5 border-t border-[var(--border-1)] pt-2">
              {r.delivered.map((item, i) => (
                <ItemRow key={`${item.title}-${i}`} item={item} showDate />
              ))}
            </ul>
          ) : (
            <p className="mt-5 border-t border-[var(--border-1)] pt-4 text-[13px] text-[var(--text-4)]">
              {/* Never "nothing was delivered" when the truth is "we cannot tell". */}
              {r.deliveredUndated > 0
                ? "No completions can be placed in this window — see above."
                : "Nothing was completed in this window."}
            </p>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel number="02" label="ON NOW" status={`${r.totals.inFlight} IN FLIGHT`}>
          <div className="p-5 sm:p-6">
            {r.inFlight.length > 0 ? (
              <ul>
                {r.inFlight.map((item, i) => (
                  <ItemRow key={`${item.title}-${i}`} item={item} showDate={false} />
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[var(--text-4)]">Nothing is marked as started.</p>
            )}
          </div>
        </Panel>

        <Panel number="03" label="UP NEXT" status={`${r.totals.planned} TO DO`}>
          <div className="p-5 sm:p-6">
            {r.upNext.length > 0 ? (
              <>
                <ul>
                  {r.upNext.map((item, i) => (
                    <ItemRow key={`${item.title}-${i}`} item={item} showDate={false} />
                  ))}
                </ul>
                {r.totals.planned > r.upNext.length && (
                  <p className="mt-3 text-[12px] text-[var(--text-4)]">
                    and {r.totals.planned - r.upNext.length} more
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13px] text-[var(--text-4)]">Nothing queued up.</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel number="04" label="THE WORK TIMELINE" status={`${blocks.length} PHASES`}>
        <div className="p-5 sm:p-6">
          {blocks.length > 0 ? (
            <>
              {/* Client-facing, so no slip overlay — same call the Timeline section
                  makes. A client seeing "behind schedule" bars is a conversation, not
                  a status page. */}
              <GanttChart
                blocks={blocks}
                milestones={milestones}
                slippage={false}
                emptyHint="The timeline will appear once phases are scheduled."
              />
              {r.totals.planned + r.totals.inFlight + r.totals.delivered >
                blocks.reduce((sum, b) => sum + (b.tasks?.length ?? 0), 0) && (
                <p className="mt-3 text-[12px] text-[var(--text-4)]">
                  {/* Says WHY the bars do not add up to the figures above, rather than
                      leaving a reader to reconcile two numbers that cannot match. */}
                  Some work is not attached to a phase yet, so it is counted in the
                  figures above but does not appear on this timeline.
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-[var(--text-4)]">
              No phases are scheduled yet, so there is no timeline to draw.
            </p>
          )}
        </div>
      </Panel>

      <Panel number="05" label="WHERE THE WORK SITS" status={`${r.venn.items.length} WORKSTREAMS`}>
        <div className="p-5 sm:p-6">
          <p className="mb-4 text-[13px] leading-relaxed text-[var(--text-3)]">
            {/* ⚠️ States the unit. A reader who assumes these are tasks would read the
                overlaps as impossible — a task holds one state, so only a workstream
                can sit in more than one circle. */}
            Each <strong className="font-semibold">workstream</strong>, by what it
            currently contains — not a count of items. A workstream that is part-built
            sits in an overlap.
          </p>

          {/* ⚠️ Without this the page contradicts itself, and on GAIA Bloom it did:
              panel 01 read "2 in flight" while this diagram read "In flight 0", because
              both of her in-progress tasks belong to no phase and a phase is what a
              circle counts. Stating the gap is the fix; quietly folding loose work into
              a circle would misdescribe the plan. */}
          {looseCounts.total > 0 && (
            <p className="mb-4 text-[13px] leading-relaxed text-[var(--warning-600,var(--text-3))]">
              {looseCounts.inFlight > 0
                ? `${looseCounts.total} item${looseCounts.total === 1 ? " is" : "s are"} not attached to a workstream — including ${looseCounts.inFlight} of the ${r.totals.inFlight} in flight — so ${looseCounts.total === 1 ? "it does" : "they do"} not appear in this diagram.`
                : `${looseCounts.total} item${looseCounts.total === 1 ? " is" : "s are"} not attached to a workstream, so ${looseCounts.total === 1 ? "it does" : "they do"} not appear in this diagram.`}
            </p>
          )}
          {r.venn.items.length > 0 ? (
            <InsightVennChart
              sets={r.venn.sets.map((s, i) => ({
                ...s,
                color: (["blue", "emerald", "amber"] as const)[i],
              }))}
              items={r.venn.items}
              unit="workstreams"
              // The regions are fixed here and most are empty most of the time; the
              // diagram already prints a muted 0 for each, so listing five em-dashes
              // below it is duplication that doubles the panel's height.
              hideEmptyRegions
              // One panel among six, not the page's subject.
              maxWidth={340}
            />
          ) : (
            <p className="text-[13px] text-[var(--text-4)]">
              No workstreams are broken down into tasks yet.
            </p>
          )}
        </div>
      </Panel>

      <Panel
        number="06"
        label="THE BIGGER PICTURE"
        status={d.percent === null ? "NO PLAN YET" : `${d.percent}% COMPLETE`}
      >
        <div className="p-5 sm:p-6">
          {d.noTimeline ? (
            <p className="text-[13px] text-[var(--text-4)]">
              {/* §49.1: no plan is not a plan at 0%. */}
              No delivery plan has been built yet, so there is no overall progress to show.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
              <StatTile
                label="Complete"
                figure={d.percent === null ? "—" : `${d.percent}%`}
                sub={
                  <span className="text-[12px] text-[var(--text-4)]">
                    {d.done} of {d.total} items
                  </span>
                }
              />
              <StatTile label="Phases done" figure={`${d.phasesComplete}/${d.phasesComplete + d.phasesInFlight + d.phasesNotStarted}`} />
              <StatTile
                label="Next milestone"
                figure={d.nextMilestone ? shortDay(d.nextMilestone.date) : "—"}
                sub={
                  d.nextMilestone ? (
                    <span className="text-[12px] text-[var(--text-4)]">{d.nextMilestone.name}</span>
                  ) : undefined
                }
              />
              <StatTile label="Milestones hit" figure={String(d.milestonesHit)} />
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
