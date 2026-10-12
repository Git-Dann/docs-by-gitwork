/**
 * The client's own view of each developer's **AM and PM standup** — the updates
 * devs already push from Foundry, so a client can read them without being in
 * Slack.
 *
 * Pure: the grouping and the honesty rules live here so they can be proved with
 * no database. `src/server/wiki-standups.ts` does the fetching.
 *
 * ## ⚠️ A standup is reported only when it was actually PUSHED
 *
 * The task state is always readable; the push is the event. Deriving "what Sian
 * is doing" from the live board and presenting it as her standup would put words
 * in her mouth on a page the client reads — and it would show an update on a day
 * she never sent one. `amPushedAt` / `pmPushedAt` on `DailyUpdate` is the
 * evidence, and a dev with neither does not appear.
 *
 * The AM / PM split mirrors `tasks-standup.ts` exactly, because the wiki and the
 * Slack post must never describe the same day differently:
 *
 *   AM — In progress · In review (waiting on sign-off)
 *   PM — Done today · In review (waiting on sign-off) · Still in progress
 */

export interface StandupTask {
  id: string;
  title: string;
  /** "Parent → Subtask" context, as the Slack card renders it. */
  parentTitle?: string | null;
}

export interface DevStandup {
  userId: string;
  name: string;
  /** ISO, or null when that phase was not pushed. */
  amPushedAt: string | null;
  pmPushedAt: string | null;
  inProgress: StandupTask[];
  inReview: StandupTask[];
  doneToday: StandupTask[];
}

export interface StandupDay {
  /** UTC midnight of the day these updates cover. */
  workDate: string;
  devs: DevStandup[];
}

/** A dev who pushed neither phase has not given an update. */
export function hasPushed(d: Pick<DevStandup, "amPushedAt" | "pmPushedAt">): boolean {
  return Boolean(d.amPushedAt || d.pmPushedAt);
}

/**
 * The phase a row represents, for the label on the card.
 *
 * ⚠️ "PM" only once the PM push has happened. A morning update relabelled as an
 * end-of-day one would tell a client work was finished when it was started.
 */
export function phaseLabel(d: Pick<DevStandup, "amPushedAt" | "pmPushedAt">): "AM" | "PM" | null {
  if (d.pmPushedAt) return "PM";
  if (d.amPushedAt) return "AM";
  return null;
}

/**
 * The groups to render for a dev, in the order their own standup reports them.
 *
 * Empty groups are dropped rather than shown as a heading with nothing under it,
 * and a dev whose every group is empty still appears when they pushed — "pushed
 * an update with nothing in it" is a fact, and silently hiding them would make
 * the card disagree with the standup roster.
 */
export function standupGroups(d: DevStandup): Array<{ label: string; tasks: StandupTask[] }> {
  const groups =
    phaseLabel(d) === "PM"
      ? [
          { label: "Done today", tasks: d.doneToday },
          { label: "In review", tasks: d.inReview },
          { label: "Still in progress", tasks: d.inProgress },
        ]
      : [
          { label: "In progress", tasks: d.inProgress },
          { label: "In review", tasks: d.inReview },
        ];
  return groups.filter((g) => g.tasks.length > 0);
}

/** Devs who pushed, most recently first. */
export function visibleStandups(day: StandupDay | null | undefined): DevStandup[] {
  if (!day) return [];
  return day.devs
    .filter(hasPushed)
    .sort((a, b) => {
      const at = Date.parse(a.pmPushedAt ?? a.amPushedAt ?? "");
      const bt = Date.parse(b.pmPushedAt ?? b.amPushedAt ?? "");
      if (Number.isNaN(at) && Number.isNaN(bt)) return a.name.localeCompare(b.name);
      if (Number.isNaN(at)) return 1;
      if (Number.isNaN(bt)) return -1;
      return bt - at;
    });
}

/** "09:12" — the time the update went out, in the reader's locale. */
export function formatPushTime(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** A task line, with its parent for context. */
export function taskLine(t: StandupTask): string {
  return t.parentTitle ? `${t.parentTitle} → ${t.title}` : t.title;
}
