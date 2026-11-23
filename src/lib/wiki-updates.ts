/**
 * Updates: the client wiki's weekly reports and week-by-week record (CLAUDE.md §147).
 *
 * Two things on one page:
 *  - **Published updates.** The weekly email the team wrote, as sent, frozen. The client's record of
 *    what they were told never changes when the board does.
 *  - **What happened.** The same delivery timeline the Portal client page shows
 *    (src/lib/client-delivery-timeline.ts), cut down to the client's copy here.
 *
 * Pure, so the client's copy is tested. The rule for the copy: nothing that names a developer,
 * nothing internal (board tidy-ups), and links only to sections of the client's own wiki.
 */

import {
  weekSummary,
  type DeliveryKind,
  type DeliveryTimeline,
  type DeliveryWeek,
  type NextRelease,
} from "@/lib/client-delivery-timeline";

/** The wiki section an item opens, on either side. Never an /app link. */
export type UpdateSection = "changelog" | "intake" | "board" | "meetings" | "monitors";

export interface ClientDeliveryItem {
  id: string;
  kind: Exclude<DeliveryKind, "tidy">;
  at: string;
  title: string;
  detail: string | null;
  group: string | null;
  section: UpdateSection | null;
}

export interface ClientDeliveryWeek {
  start: string;
  label: string;
  summary: string;
  items: ClientDeliveryItem[];
}

export interface ClientOpenTask {
  id: string;
  title: string;
  group: string | null;
  dueDate: string | null;
}

export interface ClientWaitingItem {
  id: string;
  title: string;
  need: string;
  since: string | null;
  section: UpdateSection | null;
}

export interface ClientDeliveryState {
  inProgress: ClientOpenTask[];
  upNext: ClientOpenTask[];
  waitingOnClient: ClientWaitingItem[];
  nextRelease: NextRelease | null;
}

export interface PublishedUpdate {
  id: string;
  /** YYYY-MM-DD, the Monday. */
  weekStart: string;
  subject: string;
  body: string;
  publishedAt: string;
  /** First name only: who wrote it, as the client would know them. */
  publishedBy: string | null;
}

export interface UpdatesView {
  clientName: string;
  weeks: ClientDeliveryWeek[];
  state: ClientDeliveryState;
  published: PublishedUpdate[];
  from: string;
  readAt: string;
  /** Sources that couldn't be read just now. */
  failed: string[];
}

/** What the wiki DTO carries: enough for the nav, the visibility rule and the dashboard card. */
export interface WikiUpdatesSummary {
  enabled: boolean;
  published: number;
  latest: { subject: string; weekStart: string; publishedAt: string } | null;
}

export const EMPTY_UPDATES_SUMMARY: WikiUpdatesSummary = { enabled: false, published: 0, latest: null };

export const UPDATE_LIMITS = { subject: 200, body: 20_000 } as const;

const SECTION_FOR_KIND: Partial<Record<DeliveryKind, UpdateSection>> = {
  shipped: "changelog",
  request: "intake",
  meeting: "meetings",
  incident: "monitors",
  done: "board",
  started: "board",
  blocked: "board",
};

/** The client's copy of a timeline: no people, no tidy-ups, wiki links only. */
export function forClientTimeline(t: DeliveryTimeline): Omit<UpdatesView, "published" | "failed"> {
  const weeks = t.weeks.map((w): ClientDeliveryWeek => {
    const items = w.items
      .filter((i) => i.kind !== "tidy")
      .map(
        (i): ClientDeliveryItem => ({
          id: i.id,
          kind: i.kind as ClientDeliveryItem["kind"],
          at: i.at,
          title: i.title,
          detail: i.detail,
          group: i.group,
          section: SECTION_FOR_KIND[i.kind] ?? null,
        }),
      );
    const counts: DeliveryWeek["counts"] = {};
    for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
    return { start: w.start, label: w.label, summary: weekSummary(counts), items };
  });
  const open = (o: { id: string; title: string; group: string | null; dueDate: string | null }): ClientOpenTask => ({
    id: o.id,
    title: o.title,
    group: o.group,
    dueDate: o.dueDate,
  });
  return {
    clientName: t.clientName,
    weeks,
    state: {
      inProgress: t.state.inProgress.map(open),
      upNext: t.state.upNext.map(open),
      waitingOnClient: t.state.waitingOnClient.map((w) => ({
        id: w.id,
        title: w.title,
        need: w.need,
        since: w.since,
        section: w.id.startsWith("approve:") ? "changelog" : "board",
      })),
      nextRelease: t.state.nextRelease,
    },
    from: t.from,
    readAt: t.readAt,
  };
}

/** The first word of a name, so the client sees "Dan" rather than a full name or an email. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  if (!first || first.includes("@")) return null;
  return first;
}

/** YYYY-MM-DD for a Monday, else null. */
export function parseWeekStart(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d.getUTCDay() === 1 ? value : null;
}

/** Why a draft can't be published, in a sentence, or null when it can. */
export function publishProblem(
  input: { weekStart: string; subject: string; body: string },
  now: Date,
): string | null {
  const week = parseWeekStart(input.weekStart);
  if (!week) return "The week must be a Monday, written as YYYY-MM-DD.";
  if (new Date(`${week}T00:00:00Z`).getTime() > now.getTime()) return "You can't publish an update for a week that hasn't started.";
  if (!input.subject.trim()) return "Give the update a subject.";
  if (input.subject.length > UPDATE_LIMITS.subject) return `The subject is too long (${UPDATE_LIMITS.subject} characters at most).`;
  if (!input.body.trim()) return "The update is empty.";
  if (input.body.length > UPDATE_LIMITS.body) return `The update is too long (${UPDATE_LIMITS.body.toLocaleString("en-GB")} characters at most).`;
  return null;
}

/** Each week with the update published for it, newest first; published weeks older than the timeline are added. */
export function weeksWithUpdates(
  weeks: readonly ClientDeliveryWeek[],
  published: readonly PublishedUpdate[],
): Array<{ start: string; week: ClientDeliveryWeek | null; update: PublishedUpdate | null }> {
  const byWeek = new Map(published.map((p) => [p.weekStart, p]));
  const rows: Array<{ start: string; week: ClientDeliveryWeek | null; update: PublishedUpdate | null }> = weeks.map((w) => ({ start: w.start, week: w, update: byWeek.get(w.start) ?? null }));
  const shown = new Set(weeks.map((w) => w.start));
  for (const p of published) {
    if (!shown.has(p.weekStart)) rows.push({ start: p.weekStart, week: null, update: p });
  }
  return rows.sort((a, b) => b.start.localeCompare(a.start));
}

/** True when a week has nothing to show and no update: folded into a "quiet weeks" line. */
export function isQuiet(row: { week: ClientDeliveryWeek | null; update: PublishedUpdate | null }): boolean {
  return !row.update && (!row.week || row.week.items.length === 0);
}
