"use client";

/**
 * Support & SLA — the client's own Care figures, in their wiki.
 *
 * Every number here is one the monthly Care report already emails them, so this is the
 * same information on a page they can open whenever they like rather than once a month.
 * What is excluded and why is documented in `src/server/wiki-support.ts`.
 */

import { BarMeter, MONO, StatTile, TrendBadge } from "@/components/analytics/analytics-widgets";
import type { WikiSupportSection as SupportData } from "@/server/wiki-support";

/** Hours and minutes, because "4.2h" is not how anyone says a response time. */
function duration(ms: number | null): string {
  if (ms === null) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * `TrendBadge` takes a FRACTION plus a direction, and colours it against `goodWhen`.
 *
 * ⚠️ For a duration, `goodWhen="down"` — without it "we replied 40 minutes faster" paints
 * green-for-up and reads as a regression. The component already has the knob; inverting
 * the sign by hand instead would have hidden the intent inside a minus.
 */
function trend(now: number | null, before: number | null) {
  if (now === null || before === null || before === 0) return null;
  const deltaPct = (now - before) / before;
  return {
    deltaPct,
    direction: (deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat") as "up" | "down" | "flat",
  };
}

export function WikiSupportSectionView({ support }: { support: SupportData }) {
  if (!support.linked) {
    return (
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // SUPPORT"}
          </span>
        </div>
        <p className="p-8 text-center text-sm text-[var(--text-4)]">
          {/* Explicitly "not connected", never an empty chart — an empty chart here would
              read as "nobody contacted support", which is a different and untrue thing. */}
          Support reporting isn&rsquo;t connected for this client yet.
        </p>
      </section>
    );
  }

  const c = support.current;
  const p = support.previous;
  if (!c) return null;

  const monthName = new Date(`${c.month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const categoryTotal = c.categories.reduce((a, x) => a + x.count, 0) || 1;

  return (
    <div className="space-y-4">
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // THIS MONTH"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {monthName}
          </span>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Tickets"
            figure={String(c.totalTickets)}
            sub={<TrendBadge delta={trend(c.totalTickets, p?.totalTickets ?? null)} goodWhen="neutral" />}
          />
          <StatTile
            label="Resolved"
            figure={`${Math.round(c.resolutionRate)}%`}
            sub={<TrendBadge delta={trend(c.resolutionRate, p?.resolutionRate ?? null)} goodWhen="up" />}
          />
          <StatTile
            label="First reply"
            figure={duration(c.medianFirstResponseMs)}
            sub={<TrendBadge delta={trend(c.medianFirstResponseMs, p?.medianFirstResponseMs ?? null)} goodWhen="down" />}
          />
          <StatTile
            label="Time to resolve"
            figure={duration(c.medianResolutionMs)}
            sub={<TrendBadge delta={trend(c.medianResolutionMs, p?.medianResolutionMs ?? null)} goodWhen="down" />}
          />
        </div>
        {c.slaCompliancePct !== null && (
          <div className="border-t border-[var(--border-1)] px-5 py-3">
            <p className="text-[13px] text-[var(--text-2)]">
              <strong className="font-semibold">{Math.round(c.slaCompliancePct)}%</strong> of
              tickets got a first reply inside the 4-hour target.
            </p>
          </div>
        )}
      </section>

      {c.categories.length > 0 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">02</span>
              {" // WHAT PEOPLE ASKED ABOUT"}
            </span>
          </div>
          <div className="space-y-3 p-5">
            {c.categories.map((cat) => (
              <BarMeter key={cat.label} label={cat.label} value={cat.count} total={categoryTotal} />
            ))}
          </div>
        </section>
      )}

      {support.daysAllowance !== null && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">03</span>
              {" // SUPPORT DAYS"}
            </span>
          </div>
          <div className="p-5">
            <BarMeter
              label="Used this month"
              value={support.daysUsed ?? 0}
              total={support.daysAllowance}
            />
            <p className="mt-2 text-[12px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {support.daysUsed ?? 0} of {support.daysAllowance} days
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
