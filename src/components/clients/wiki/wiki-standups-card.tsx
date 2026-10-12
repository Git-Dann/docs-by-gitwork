"use client";

/**
 * "Daily updates" — the week at a glance, then each developer's AM/PM standup
 * side by side, so a client can see where the project is without being in Slack.
 *
 * Shown to BOTH audiences and identical for each: the standups are the same ones
 * the devs push to the client's channel, and the week figures are the same
 * `summariseRoundup` call the RoundUp tile makes — so this card, that tile and the
 * RoundUp section can never report different numbers for one week.
 *
 * ⚠️ Only devs who actually PUSHED appear. See `src/lib/wiki-standups.ts`.
 */

import {
  columnTasks,
  deliveredDelta,
  formatPushTime,
  phaseLabel,
  standupGroups,
  taskLine,
  visibleStandups,
  type StandupDay,
} from "@/lib/wiki-standups";
import type { RoundupSummary } from "@/lib/wiki-roundup";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const SERIF = "var(--font-fraunces), var(--font-display), 'Times New Roman', Georgia, serif";

function WeekFigure({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div>
      <div
        className={`text-[26px] leading-none ${muted ? "text-[var(--text-3)]" : "text-[var(--text-1)]"}`}
        style={{ fontFamily: SERIF, fontWeight: 600 }}
      >
        {value}
      </div>
      <div
        className="mt-1.5 text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
        style={{ fontFamily: MONO }}
      >
        {label}
      </div>
    </div>
  );
}

export function WikiStandupsCard({
  standups,
  roundup,
  numeral,
}: {
  standups: StandupDay;
  /** Null when there is no plan to summarise — the strip is then omitted, not zeroed. */
  roundup: RoundupSummary | null;
  numeral: string;
}) {
  const devs = visibleStandups(standups);
  const delta = roundup
    ? deliveredDelta(roundup.delivered.length, roundup.deliveredPrevious, roundup.deliveredPrevious > 0)
    : null;

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">{numeral}</span>
          {" // DAILY UPDATES"}
        </span>
        <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
          {devs.length} TODAY
        </span>
      </div>

      {/* ── The week — RoundUp's own figures, not a re-derivation. ── */}
      {roundup && (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-[var(--border-1)] px-5 py-4">
          <div className="min-w-0">
            <p
              className="mb-2 text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
              style={{ fontFamily: MONO }}
            >
              This week
            </p>
            <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
              <WeekFigure value={roundup.delivered.length} label="Delivered" />
              <WeekFigure value={roundup.totals.inFlight} label="In flight" />
              <WeekFigure value={roundup.totals.planned} label="Planned" muted />
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            {delta && (
              <p className="text-[12px] text-[var(--text-3)]" style={{ fontFamily: MONO }}>
                {delta}
              </p>
            )}
            {/* ⚠️ Undated completions cannot be placed in ANY week. Folding them
                into "delivered this week" would inflate it; dropping them silently
                would under-report. Saying so is the only honest option. */}
            {roundup.deliveredUndated > 0 && (
              <p className="text-[11px] text-[var(--text-4)]">
                +{roundup.deliveredUndated} finished with no date recorded
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Today — one column per dev who pushed. ── */}
      <div className="p-5">
        {devs.length === 0 ? (
          /* ⚠️ "Nobody has pushed yet today" — NOT "no activity". At 10am the
             team may be deep in work nobody has reported, and the harsher
             sentence is also the less true one. */
          <p className="text-[13px] text-[var(--text-3)]">
            No updates pushed yet today. The team posts a morning and an end-of-day update.
          </p>
        ) : (
          <ul
            className="grid items-start gap-4"
            /* Columns, not a long list: auto-fit puts devs side by side and
               collapses to one column on a phone, where side by side would be
               unreadable. Same idiom as the dashboard's own tile grid. */
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
          >
            {devs.map((dev) => {
              const groups = standupGroups(dev);
              const phase = phaseLabel(dev);
              const at = formatPushTime(dev.pmPushedAt ?? dev.amPushedAt);
              return (
                <li
                  key={dev.userId}
                  className="min-w-0 rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)] p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="truncate text-[11px] tracking-[0.08em] text-[var(--text-1)] uppercase"
                      style={{ fontFamily: MONO }}
                      title={dev.name}
                    >
                      {dev.name}
                    </span>
                    <span
                      className="shrink-0 rounded-[4px] bg-[var(--brand-50)] px-1.5 py-0.5 text-[10px] text-[var(--brand-700)]"
                      style={{ fontFamily: MONO }}
                    >
                      {phase}
                      {at ? ` · ${at}` : ""}
                    </span>
                  </div>

                  {groups.length === 0 ? (
                    <p className="mt-2 text-[12px] text-[var(--text-4)]">
                      Nothing to report on this project.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2.5">
                      {groups.map((g) => {
                        const { shown, hidden } = columnTasks(g.tasks);
                        return (
                          <div key={g.label}>
                            <p
                              className="text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
                              style={{ fontFamily: MONO }}
                            >
                              {g.label}
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {shown.map((t) => (
                                <li
                                  key={t.id}
                                  className="line-clamp-2 text-[12.5px] leading-5 text-[var(--text-2)]"
                                  title={taskLine(t)}
                                >
                                  {taskLine(t)}
                                </li>
                              ))}
                            </ul>
                            {hidden > 0 && (
                              <p
                                className="mt-0.5 text-[10px] text-[var(--text-4)]"
                                style={{ fontFamily: MONO }}
                              >
                                +{hidden} more
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
