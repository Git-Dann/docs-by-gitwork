/**
 * A client's delivery timeline: what actually happened on their work, week by week, plus where
 * things stand now. Pure, so the grouping and the honesty rules are tested.
 *
 * It feeds two things: the Timeline card on the Portal client page, and the weekly update draft
 * (src/lib/weekly-update.ts). Nothing here is new data; every item is a date Foundry already holds
 * (a task finished, a release approved, a request raised, a meeting held, an outage, a document).
 *
 * Weeks start on Monday, in UTC, like the rest of the task board.
 */

export type DeliveryKind =
  | "done"
  | "started"
  | "shipped"
  | "request"
  | "meeting"
  | "incident"
  | "document"
  | "blocked";

export const DELIVERY_KIND_LABEL: Record<DeliveryKind, string> = {
  done: "Done",
  started: "Started",
  shipped: "Released",
  request: "Request",
  meeting: "Meeting",
  incident: "Outage",
  document: "Document",
  blocked: "Blocked",
};

export interface DeliveryItem {
  id: string;
  kind: DeliveryKind;
  /** ISO. */
  at: string;
  title: string;
  detail: string | null;
  href: string | null;
  /** First names of the people on it. Internal only. */
  people: string[];
  /** The release or category it belongs to, if any. */
  group: string | null;
}

export interface DeliveryWeek {
  /** YYYY-MM-DD, the Monday. */
  start: string;
  label: string;
  items: DeliveryItem[];
  counts: Partial<Record<DeliveryKind, number>>;
}

export interface OpenTask {
  id: string;
  title: string;
  group: string | null;
  people: string[];
  dueDate: string | null;
}

export interface WaitingItem {
  id: string;
  title: string;
  /** What we need, in the words the team wrote. */
  need: string;
  since: string | null;
  href: string | null;
}

export interface NextRelease {
  label: string;
  endDate: string | null;
  done: number;
  total: number;
}

export interface DeliveryState {
  inProgress: OpenTask[];
  upNext: OpenTask[];
  waitingOnClient: WaitingItem[];
  nextRelease: NextRelease | null;
}

export interface DeliveryTimeline {
  clientName: string;
  /** First names of the client's people we write to, primary contact first. */
  contacts: Array<{ name: string; email: string | null }>;
  weeks: DeliveryWeek[];
  state: DeliveryState;
  /** The window that was read, so the page can say it. */
  from: string;
  readAt: string;
}

export interface LoadedTimeline extends DeliveryTimeline {
  /** Sources that couldn't be read just now. */
  failed: string[];
}

const DAY = 86_400_000;

/** The Monday (00:00 UTC) of the week `d` falls in. */
export function weekStart(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const back = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function weekLabel(start: Date, now: Date): string {
  const thisWeek = weekStart(now).getTime();
  const diff = Math.round((thisWeek - start.getTime()) / (7 * DAY));
  if (diff === 0) return "This week";
  if (diff === 1) return "Last week";
  return `Week of ${shortDay(start)}`;
}

/** Order inside a day: what got done reads first. */
const KIND_ORDER: Record<DeliveryKind, number> = {
  shipped: 0,
  done: 1,
  incident: 2,
  document: 3,
  meeting: 4,
  blocked: 5,
  request: 6,
  started: 7,
};

function valid(at: string | null | undefined): at is string {
  return Boolean(at) && !Number.isNaN(Date.parse(at as string));
}

/**
 * Items grouped into Monday-start weeks, newest week first, newest item first. Every week from
 * `from` to now is returned, including empty ones, so a quiet week shows as quiet rather than
 * vanishing. Items outside the window, or with no valid date, are dropped.
 */
export function groupByWeek(items: DeliveryItem[], from: Date, now: Date): DeliveryWeek[] {
  const first = weekStart(from).getTime();
  const last = weekStart(now).getTime();
  const weeks = new Map<number, DeliveryItem[]>();
  for (let t = last; t >= first; t -= 7 * DAY) weeks.set(t, []);
  const seen = new Set<string>();
  for (const item of items) {
    if (!valid(item.at) || seen.has(item.id)) continue;
    const at = new Date(item.at);
    if (at.getTime() > now.getTime() || at.getTime() < first) continue;
    const key = weekStart(at).getTime();
    const list = weeks.get(key);
    if (!list) continue;
    seen.add(item.id);
    list.push(item);
  }
  return [...weeks.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([t, list]) => {
      list.sort((a, b) => {
        const day = (x: DeliveryItem) => x.at.slice(0, 10);
        return day(b).localeCompare(day(a)) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id);
      });
      const counts: Partial<Record<DeliveryKind, number>> = {};
      for (const i of list) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
      const start = new Date(t);
      return { start: start.toISOString().slice(0, 10), label: weekLabel(start, now), items: list, counts };
    });
}

/** "3 done · 1 released · 2 meetings": a week's shape in a few words, most telling first. */
export function weekSummary(counts: Partial<Record<DeliveryKind, number>>): string {
  const parts: string[] = [];
  const add = (k: DeliveryKind, one: string, many: string) => {
    const n = counts[k] ?? 0;
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add("done", "done", "done");
  add("shipped", "release", "releases");
  add("incident", "outage", "outages");
  add("meeting", "meeting", "meetings");
  add("request", "request", "requests");
  add("document", "document", "documents");
  add("blocked", "blocker", "blockers");
  return parts.length ? parts.join(" · ") : "Nothing recorded";
}

/** "Harry Brown" → "Harry". Empty and duplicate names dropped. */
export function firstNames(names: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const n of names) {
    const first = (n ?? "").trim().split(/\s+/)[0];
    if (first && !out.includes(first)) out.push(first);
  }
  return out;
}

/** The first sentence of a meeting summary, capped, for a one-line detail. */
export function firstSentence(text: string | null | undefined, max = 160): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const s = m ? m[1] : t;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** How long an outage lasted, in plain words; null while it's still going. */
export function outageLength(startedAt: string, resolvedAt: string | null): string | null {
  if (!resolvedAt) return null;
  const mins = Math.max(1, Math.round((Date.parse(resolvedAt) - Date.parse(startedAt)) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
