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
  /** Where the lists came from. Absent on rows written before this field existed → "live". */
  source?: StandupSource;
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
export function standupGroups(
  d: DevStandup,
  opts: { past?: boolean } = {},
): Array<{ label: string; tasks: StandupTask[] }> {
  const doneLabel = opts.past ? "Done that day" : "Done today";
  // ⚠️ A past day with no saved snapshot can only establish what was FINISHED
  // that day. Showing its empty "In progress" would claim nothing was.
  if (d.source === "history") {
    return d.doneToday.length > 0 ? [{ label: doneLabel, tasks: d.doneToday }] : [];
  }
  const groups =
    phaseLabel(d) === "PM"
      ? [
          { label: doneLabel, tasks: d.doneToday },
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

/** How many task lines a dev's column shows before deferring to the count. */
export const COLUMN_TASK_LIMIT = 3;

/**
 * The lines to render for one group in a column, plus how many were held back.
 *
 * ⚠️ The overflow is REPORTED, never silently cut. "3 shown of 7" and "3" are
 * different claims about how much work there was, and a client reading the
 * second would understate the week.
 */
export function columnTasks<T>(tasks: readonly T[], limit = COLUMN_TASK_LIMIT): {
  shown: T[];
  hidden: number;
} {
  return { shown: tasks.slice(0, limit), hidden: Math.max(0, tasks.length - limit) };
}

/**
 * "+3 vs last week" / "same as last week" — the honest reading of a delta.
 *
 * ⚠️ Returns null when there is no previous window to compare against, rather
 * than claiming "+12". A first week is not an improvement on anything.
 */
export function deliveredDelta(
  delivered: number,
  previous: number,
  hasPrevious: boolean,
): string | null {
  if (!hasPrevious) return null;
  const d = delivered - previous;
  if (d === 0) return "same as last week";
  return `${d > 0 ? "+" : ""}${d} vs last week`;
}

// ─── History ──────────────────────────────────────────────────────────────────

/**
 * Where a dev's task lists came from — shown to the reader, because the three
 * are not equally trustworthy and pretending otherwise is the failure this
 * module exists to avoid.
 *
 *   reported — saved at push time. Exactly what the dev sent.
 *   live     — today, from the board, for an update pushed before snapshots
 *              existed. Minutes of drift at most.
 *   history  — a past day with no saved snapshot. Only "Done that day" can be
 *              established (from `completedAt`); what was in progress or in
 *              review THEN cannot be recovered from the board NOW, so it is
 *              left empty rather than guessed.
 */
export type StandupSource = "reported" | "live" | "history";

export interface StandupFeed {
  /** Today, always present — possibly with no devs. */
  today: StandupDay;
  /** Earlier days that had at least one update for this client, newest first. */
  history: StandupDay[];
}

/** How far back history reaches. Two working weeks: enough to answer "what happened last week". */
export const STANDUP_HISTORY_DAYS = 14;

/** A task as the snapshot and the grouping need it — plain, no Prisma types. */
export interface StandupSourceTask {
  id: string;
  title: string;
  status: string;
  /** ISO or Date. */
  completedAt: string | Date | null;
  parentTitle?: string | null;
}

export interface StandupGroupsFor {
  inProgress: StandupTask[];
  inReview: StandupTask[];
  doneToday: StandupTask[];
}

const DAY_MS = 86_400_000;

/**
 * The AM/PM groups for one dev's tasks on one work day.
 *
 * ⚠️ The SAME rule as `partition()` in `tasks-standup.ts`, and used for the
 * snapshot, for today's live view and for history alike — so a day can never be
 * described one way when it was pushed and another when it is read back.
 */
export function groupTasksForDay(
  tasks: readonly StandupSourceTask[],
  workDate: Date,
): StandupGroupsFor {
  const start = workDate.getTime();
  const end = start + DAY_MS;
  const toTask = (t: StandupSourceTask): StandupTask => ({
    id: t.id,
    title: t.title,
    parentTitle: t.parentTitle ?? null,
  });
  return {
    inProgress: tasks.filter((t) => t.status === "DOING").map(toTask),
    inReview: tasks.filter((t) => t.status === "IN_REVIEW" || t.status === "UI_DONE").map(toTask),
    doneToday: tasks
      .filter((t) => {
        if (t.status !== "DONE" || !t.completedAt) return false;
        const c = new Date(t.completedAt).getTime();
        return c >= start && c < end;
      })
      .map(toTask),
  };
}

/** One phase's saved snapshot: what a dev reported, per client. */
export interface StandupSnapshot {
  v: 1;
  /** ISO — when it was pushed. */
  at: string;
  clients: Record<string, StandupGroupsFor>;
}

/** Defensive read of a stored snapshot — a malformed row is treated as absent, never thrown. */
export function readSnapshot(raw: unknown): StandupSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<StandupSnapshot>;
  if (s.v !== 1 || !s.clients || typeof s.clients !== "object") return null;
  return s as StandupSnapshot;
}

/**
 * The snapshot that describes a dev's day for a client: PM if they pushed it,
 * else AM. ⚠️ Keyed on the PUSH stamp, not on which snapshot exists — a PM that
 * was retracted leaves its stamp null, and its snapshot must not be read back.
 */
export function snapshotForClient(
  row: {
    amPushedAt: unknown;
    pmPushedAt: unknown;
    amSnapshot: unknown;
    pmSnapshot: unknown;
  },
  clientId: string,
): StandupGroupsFor | null {
  const raw = row.pmPushedAt ? row.pmSnapshot : row.amPushedAt ? row.amSnapshot : null;
  const snap = readSnapshot(raw);
  if (!snap) return null;
  // ⚠️ A snapshot with no entry for this client is a REPORTED empty day ("nothing
  // on this project"), not a missing snapshot — the push only records clients it
  // had tasks for. Returning null here would fall back to the board and invent
  // a report the dev never sent.
  const g = snap.clients[clientId];
  return {
    inProgress: g?.inProgress ?? [],
    inReview: g?.inReview ?? [],
    doneToday: g?.doneToday ?? [],
  };
}

/** "Fri 9 Oct" — the chip label for a past day. */
export function dayChipLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Unknown day";
  return new Date(t).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Which empty state the card is in. Four distinct situations, because a brand-new
 * client and a client whose team simply hasn't posted yet this morning need
 * different sentences — "no updates yet today" on a client that has never had one
 * implies a rhythm that has not started.
 */
export type StandupEmptyState = "none" | "never" | "not-yet-today";

export function standupEmptyState(feed: StandupFeed | null | undefined): StandupEmptyState {
  const today = visibleStandups(feed?.today);
  if (today.length > 0) return "none";
  const anyHistory = (feed?.history ?? []).some((d) => visibleStandups(d).length > 0);
  return anyHistory ? "not-yet-today" : "never";
}
