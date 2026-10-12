"use client";

/**
 * "Daily updates" — each developer's AM/PM standup for this client, so a client
 * can read what the team is doing without being in Slack.
 *
 * Shown to BOTH audiences and identical for each: these are the same updates
 * the devs already push to the client's channel, rendered from Foundry's own
 * records rather than scraped back out of Slack.
 *
 * ⚠️ Only devs who actually PUSHED appear. The card never derives a standup from
 * the live board — see `src/lib/wiki-standups.ts`.
 */

import {
  formatPushTime,
  phaseLabel,
  standupGroups,
  taskLine,
  visibleStandups,
  type StandupDay,
} from "@/lib/wiki-standups";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

export function WikiStandupsCard({ standups, numeral }: { standups: StandupDay; numeral: string }) {
  const devs = visibleStandups(standups);

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">{numeral}</span>
          {" // DAILY UPDATES"}
        </span>
        <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
          {devs.length} {devs.length === 1 ? "UPDATE" : "UPDATES"}
        </span>
      </div>

      <div className="p-5">
        {devs.length === 0 ? (
          /* ⚠️ "Nobody has pushed yet today" — NOT "no activity". The team may be
             deep in work that simply has not been reported at 10am, and a card
             reading "no updates" on a client's own page says something harsher
             and less true than the facts support. */
          <p className="text-[13px] text-[var(--text-3)]">
            No updates pushed yet today. The team posts a morning and an end-of-day update.
          </p>
        ) : (
          <ul className="space-y-5">
            {devs.map((dev) => {
              const groups = standupGroups(dev);
              const phase = phaseLabel(dev);
              const at = formatPushTime(dev.pmPushedAt ?? dev.amPushedAt);
              return (
                <li key={dev.userId} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="truncate text-[11px] tracking-[0.08em] text-[var(--text-2)] uppercase"
                      style={{ fontFamily: MONO }}
                      title={dev.name}
                    >
                      {dev.name}
                    </span>
                    <span
                      className="shrink-0 text-[10px] text-[var(--text-4)]"
                      style={{ fontFamily: MONO }}
                    >
                      {phase}
                      {at ? ` · ${at}` : ""}
                    </span>
                  </div>

                  {groups.length === 0 ? (
                    /* They pushed, and had nothing to report. Saying so is more
                       honest than omitting them from a list of who updated. */
                    <p className="mt-1 text-[13px] text-[var(--text-4)]">
                      Nothing to report on this project.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {groups.map((g) => (
                        <div key={g.label}>
                          <p
                            className="text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
                            style={{ fontFamily: MONO }}
                          >
                            {g.label}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {g.tasks.map((t) => (
                              <li
                                key={t.id}
                                className="flex gap-2 text-[13px] leading-5 text-[var(--text-2)]"
                              >
                                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--brand-600)]" />
                                <span className="min-w-0">{taskLine(t)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
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
