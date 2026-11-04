/**
 * Commitments — the pure rules. No database, no network, so all of it is unit-tested.
 *
 * A commitment is a promise one person has made ("I'll send the revised quote by Friday").
 * It is either typed in by hand, or SUGGESTED from what they wrote (sent Gmail, their own Slack
 * messages), a Scribe action item, or a meeting on their calendar. A suggestion is never acted
 * on and never joins their list until they accept it.
 *
 * The one rule that keeps the AI honest: a suggestion read from a message must quote words that
 * are actually in that message (`quoteAppearsIn`). The model can rephrase the title; it cannot
 * invent the promise.
 */

export const COMMITMENT_STATES = ["suggested", "open", "done", "dismissed"] as const;
export type CommitmentState = (typeof COMMITMENT_STATES)[number];

export const COMMITMENT_SOURCES = ["manual", "gmail", "slack", "meeting", "calendar"] as const;
export type CommitmentSource = (typeof COMMITMENT_SOURCES)[number];

export const SOURCE_LABEL: Record<CommitmentSource, string> = {
  manual: "Added by you",
  gmail: "Your sent email",
  slack: "Your Slack message",
  meeting: "Meeting notes",
  calendar: "Your calendar",
};

export const TITLE_MAX = 140;
export const QUOTE_MAX = 280;
/** Most suggestions one read may return. A wall of suggestions is worse than none. */
export const MAX_SUGGESTIONS_PER_READ = 20;
/** Calendar follow-ups only for meetings that ended this recently. */
export const FOLLOW_UP_WINDOW_DAYS = 3;
/** Working days after a meeting that a follow-up is due. */
export const FOLLOW_UP_DUE_WORKING_DAYS = 2;

const DAY_MS = 86_400_000;

export function clipText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Lower-case, letters and digits only, single spaces — for comparing titles and quotes. */
export function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The dedupe key of a suggestion: same source + same message + same promise = same row. */
export function suggestionKey(source: CommitmentSource, refId: string, title: string): string {
  return `${source}:${refId}:${normaliseForMatch(title).slice(0, 80)}`;
}

/**
 * Whether `quote` is really in `text`. Case, punctuation and spacing are ignored, because
 * models tidy those; words are not. Under four words is not a quote, it is a guess.
 */
export function quoteAppearsIn(quote: string, text: string): boolean {
  const q = normaliseForMatch(quote);
  if (q.split(" ").filter(Boolean).length < 4) return false;
  return normaliseForMatch(text).includes(q);
}

/**
 * The part of an email the sender actually wrote: drops the quoted reply chain, forwarded
 * headers and the signature. Commitments are read from this only, so a promise someone ELSE
 * made further down the thread is never attributed to the sender.
 */
export function stripQuotedEmail(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^-- ?$/.test(line)) break; // RFC 3676 signature delimiter
    if (/^-{2,}\s*(original message|forwarded message)/i.test(trimmed)) break;
    if (/^_{5,}$/.test(trimmed)) break; // Outlook's rule above the quoted message
    if (/^On .{4,200}wrote:$/i.test(trimmed)) break;
    // Gmail wraps "On … wrote:" across two lines.
    if (/^On .{4,200}$/i.test(trimmed) && /wrote:$/i.test((lines[i + 1] ?? "").trim())) break;
    if (/^From: .+/i.test(trimmed) && /^(Sent|Date): .+/i.test((lines[i + 1] ?? "").trim())) break;
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** "YYYY-MM-DD" (or an ISO date-time) → a date at 17:00 UTC, kept only if it is plausible. */
export function parseDueDate(input: unknown, now: Date): Date | null {
  if (typeof input !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 17, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  // Rejects 2026-02-31 rolling into March, and dates nobody means.
  if (d.getUTCMonth() !== Number(m[2]) - 1) return null;
  if (d.getTime() < now.getTime() - 30 * DAY_MS) return null;
  if (d.getTime() > now.getTime() + 400 * DAY_MS) return null;
  return d;
}

export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

// ── AI extraction, validated ─────────────────────────────────────────────────

export interface ExtractionMessage {
  id: string;
  /** What the person wrote, already stripped of quoted replies. */
  text: string;
}

export interface ValidatedSuggestion {
  messageId: string;
  title: string;
  quote: string;
  dueAt: Date | null;
  counterpart: string | null;
  reason: string | null;
}

/**
 * Turns the model's reply into suggestions we can stand behind. Dropped: anything citing a
 * message it wasn't shown, a quote that isn't in that message, an empty title, and duplicates.
 */
export function normaliseExtraction(
  raw: unknown,
  messages: ReadonlyArray<ExtractionMessage>,
  now: Date,
): ValidatedSuggestion[] {
  const list = (raw as { commitments?: unknown } | null)?.commitments;
  if (!Array.isArray(list)) return [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const out: ValidatedSuggestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const messageId = typeof r.messageId === "string" ? r.messageId : "";
    const message = byId.get(messageId);
    if (!message) continue;
    const title = typeof r.title === "string" ? clipText(r.title, TITLE_MAX) : "";
    if (title.length < 3) continue;
    const quote = typeof r.quote === "string" ? r.quote : "";
    if (!quoteAppearsIn(quote, message.text)) continue;
    const key = `${messageId}:${normaliseForMatch(title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const to = typeof r.to === "string" && r.to.trim() ? clipText(r.to, 80) : null;
    const reason = typeof r.reason === "string" && r.reason.trim() ? clipText(r.reason, 200) : null;
    out.push({
      messageId,
      title,
      quote: clipText(quote, QUOTE_MAX),
      dueAt: parseDueDate(r.due, now),
      counterpart: to,
      reason,
    });
    if (out.length >= MAX_SUGGESTIONS_PER_READ) break;
  }
  return out;
}

// ── Calendar follow-ups ──────────────────────────────────────────────────────

export interface CalendarAttendee {
  email?: string | null;
  displayName?: string | null;
  responseStatus?: string | null;
  self?: boolean | null;
  organizer?: boolean | null;
  resource?: boolean | null;
}

export interface CalendarEventLike {
  id: string;
  summary?: string | null;
  status?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  attendees?: CalendarAttendee[] | null;
  htmlLink?: string | null;
  /** Set on every occurrence of a repeating event. */
  recurringEventId?: string | null;
}

export interface FollowUpSuggestion {
  title: string;
  counterpart: string;
  dueAt: Date;
  endedAt: Date;
}

function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

/**
 * A follow-up for a meeting the person was in with someone outside their own organisation,
 * that ended in the last few days. Deterministic, no AI. Skipped: all-day events, cancelled
 * ones, ones they declined, and internal-only meetings (nothing to follow up with).
 */
export function followUpFromEvent(
  event: CalendarEventLike,
  opts: {
    userEmail: string;
    internalDomains: ReadonlyArray<string>;
    now: Date;
    /** People who are on our side whatever their address (teammates and developers on gmail.com). */
    internalEmails?: ReadonlySet<string>;
  },
): FollowUpSuggestion | null {
  if (event.status === "cancelled") return null;
  // A stand-up or a weekly call isn't something you follow up after each time.
  if (event.recurringEventId) return null;
  const endIso = event.end?.dateTime;
  if (!endIso || !event.start?.dateTime) return null; // all-day events have no time
  const endedAt = new Date(endIso);
  if (Number.isNaN(endedAt.getTime())) return null;
  if (endedAt.getTime() > opts.now.getTime()) return null;
  if (endedAt.getTime() < opts.now.getTime() - FOLLOW_UP_WINDOW_DAYS * DAY_MS) return null;

  const attendees = event.attendees ?? [];
  const me = attendees.find(
    (a) => a.self || (a.email ?? "").toLowerCase() === opts.userEmail.toLowerCase(),
  );
  if (me?.responseStatus === "declined") return null;

  const internal = new Set(
    [...opts.internalDomains, domainOf(opts.userEmail)].map((d) => d.toLowerCase()).filter(Boolean),
  );
  const external = attendees.filter((a) => {
    const email = (a.email ?? "").toLowerCase();
    if (!email || a.self || a.resource) return false;
    if (email.endsWith("calendar.google.com")) return false;
    if (a.responseStatus === "declined") return false;
    if (opts.internalEmails?.has(email)) return false;
    return !internal.has(domainOf(email));
  });
  if (external.length === 0) return null;

  const first = external[0];
  const firstName = first.displayName?.trim() || (first.email ?? "");
  const counterpart =
    external.length === 1 ? firstName : `${firstName} and ${external.length - 1} other${external.length > 2 ? "s" : ""}`;
  const meeting = clipText(event.summary?.trim() || "your meeting", 60);
  return {
    title: clipText(`Follow up with ${counterpart} after “${meeting}”`, TITLE_MAX),
    counterpart: clipText(counterpart, 80),
    dueAt: addWorkingDays(endedAt, FOLLOW_UP_DUE_WORKING_DAYS),
    endedAt,
  };
}

// ── Which suggestions are worth showing ─────────────────────────────────────

/** New suggestions saved per person per day, at most. More than this and nobody reads them. */
export const MAX_SUGGESTIONS_PER_DAY = 5;
/** A suggestion nobody acted on is let go after this long. */
export const SUGGESTION_TTL_DAYS = 7;

function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a meeting action item's free-text owner ("Dan", "Dan Lindsay", "dan@gitwork.co.uk",
 * "Dan and Harry") is this person. A first name only counts when it stands as a whole word,
 * so "Dan" never matches "Daniela". No owner means nobody was named, which is not "me".
 */
export function actionItemIsMine(owner: string | null | undefined, me: { email: string | null; name: string | null }): boolean {
  if (!owner?.trim()) return false;
  const o = normaliseName(owner);
  if (me.email && o.includes(me.email.toLowerCase())) return true;
  const name = me.name ? normaliseName(me.name) : "";
  if (!name) return false;
  const words = ` ${o} `;
  if (words.includes(` ${name} `)) return true;
  const first = name.split(" ")[0];
  return first.length >= 2 && words.includes(` ${first} `);
}

// ── State changes ────────────────────────────────────────────────────────────

export interface CommitmentStateFields {
  state: CommitmentState;
  doneAt: Date | null;
  snoozedUntil: Date | null;
}

/**
 * Moving between states. Anything can be reopened; nothing goes BACK to "suggested", because a
 * suggestion is an unread claim and a person has now looked at it. Reopening clears done.
 */
export function transition(
  from: CommitmentStateFields,
  to: CommitmentState,
  now: Date,
): CommitmentStateFields | { error: string } {
  if (to === "suggested" && from.state !== "suggested") {
    return { error: "A commitment can't go back to being a suggestion." };
  }
  if (to === from.state) return from;
  return {
    state: to,
    doneAt: to === "done" ? now : null,
    snoozedUntil: to === "open" ? from.snoozedUntil : null,
  };
}

// ── Grouping for the list ────────────────────────────────────────────────────

export interface ListableCommitment {
  id: string;
  state: CommitmentState;
  dueAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
}

export type CommitmentGroupId = "overdue" | "today" | "week" | "later" | "someday";

export const GROUP_LABEL: Record<CommitmentGroupId, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "Next 7 days",
  later: "Later",
  someday: "No date",
};

function endOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
}

/**
 * Open commitments in the order a person works through them: overdue, today, this week, later,
 * then undated. A snoozed one is hidden until its snooze ends. Within a group, soonest first,
 * then oldest first.
 */
export function groupOpenCommitments<T extends ListableCommitment>(
  items: ReadonlyArray<T>,
  now: Date,
): Array<{ id: CommitmentGroupId; label: string; items: T[] }> {
  const groups: Record<CommitmentGroupId, T[]> = { overdue: [], today: [], week: [], later: [], someday: [] };
  const todayEnd = endOfUtcDay(now);
  for (const item of items) {
    if (item.state !== "open") continue;
    if (item.snoozedUntil && new Date(item.snoozedUntil).getTime() > now.getTime()) continue;
    if (!item.dueAt) {
      groups.someday.push(item);
      continue;
    }
    const due = new Date(item.dueAt).getTime();
    const dueDayEnd = endOfUtcDay(new Date(due));
    if (dueDayEnd < endOfUtcDay(now)) groups.overdue.push(item);
    else if (due <= todayEnd) groups.today.push(item);
    else if (due <= todayEnd + 7 * DAY_MS) groups.week.push(item);
    else groups.later.push(item);
  }
  const byDue = (a: T, b: T) =>
    (a.dueAt ?? "").localeCompare(b.dueAt ?? "") || a.createdAt.localeCompare(b.createdAt);
  return (Object.keys(groups) as CommitmentGroupId[])
    .map((id) => ({ id, label: GROUP_LABEL[id], items: groups[id].sort(byDue) }))
    .filter((g) => g.items.length > 0);
}

/** How many open commitments are snoozed right now (shown so a hidden one isn't forgotten). */
export function countSnoozed(items: ReadonlyArray<ListableCommitment>, now: Date): number {
  return items.filter(
    (i) => i.state === "open" && i.snoozedUntil && new Date(i.snoozedUntil).getTime() > now.getTime(),
  ).length;
}

/** Snooze presets: later today (+3h), tomorrow 09:00 UTC, next Monday 09:00 UTC. */
export function snoozeUntil(preset: "later" | "tomorrow" | "next-week", now: Date): Date {
  if (preset === "later") return new Date(now.getTime() + 3 * 3_600_000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0));
  if (preset === "tomorrow") {
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  const daysToMonday = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysToMonday);
  return d;
}

// ── To-do fields: tags, priority, checklist, when/someday, repeating ─────────
// Pure rules shared by the server (and the Mac app's contract). Each `normalise*` returns either
// the cleaned value or `{ error }` with a sentence, which the server turns into a 400.

export const MAX_TAGS = 20;
export const TAG_MAX = 40;
export const MAX_CHECKLIST_ITEMS = 100;
export const CHECKLIST_TEXT_MAX = 200;
export const CHECKLIST_ID_MAX = 64;
export const MAX_LISTS_PER_PERSON = 200;
export const MAX_REORDER_IDS = 500;
export const COMMITMENT_PRIORITIES = [0, 1, 2, 3] as const;
export type CommitmentPriority = (typeof COMMITMENT_PRIORITIES)[number];

export const LIST_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "mint",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "gray",
] as const;
export type ListColor = (typeof LIST_COLORS)[number];
/** An SF Symbol name, e.g. "folder.fill". */
export const LIST_SYMBOL_RE = /^[a-z0-9.]+$/;
export const LIST_SYMBOL_MAX = 60;
export const LIST_AREA_MAX = 60;
export const LIST_NAME_MAX = 80;

type Result<T> = { value: T } | { error: string };

/** Trimmed, lowercased, leading '#' stripped, deduped (first spelling wins), empties dropped. */
export function normaliseTags(input: ReadonlyArray<string>): Result<string[]> {
  const out: string[] = [];
  for (const raw of input) {
    const tag = raw.trim().replace(/^#+/, "").trim().toLowerCase();
    if (!tag) continue;
    if (tag.length > TAG_MAX) return { error: `A tag can be at most ${TAG_MAX} characters.` };
    if (!out.includes(tag)) out.push(tag);
  }
  if (out.length > MAX_TAGS) return { error: `A to-do can have at most ${MAX_TAGS} tags.` };
  return { value: out };
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export function normaliseChecklist(
  input: ReadonlyArray<{ id?: string | null; text: string; done?: boolean | null }>,
  newId: () => string,
): Result<ChecklistItem[]> {
  if (input.length > MAX_CHECKLIST_ITEMS) {
    return { error: `A checklist can have at most ${MAX_CHECKLIST_ITEMS} items.` };
  }
  const seen = new Set<string>();
  const out: ChecklistItem[] = [];
  for (const item of input) {
    const text = item.text.trim();
    if (!text) return { error: "A checklist item needs some text." };
    if (text.length > CHECKLIST_TEXT_MAX) {
      return { error: `A checklist item can be at most ${CHECKLIST_TEXT_MAX} characters.` };
    }
    let id = item.id?.trim() || newId();
    if (id.length > CHECKLIST_ID_MAX) return { error: `A checklist item id can be at most ${CHECKLIST_ID_MAX} characters.` };
    if (seen.has(id)) id = newId();
    seen.add(id);
    out.push({ id, text, done: item.done === true });
  }
  return { value: out };
}

/** Reads a stored checklist defensively: anything malformed is dropped, never thrown. */
export function readChecklist(stored: unknown): ChecklistItem[] {
  if (!Array.isArray(stored)) return [];
  const out: ChecklistItem[] = [];
  for (const item of stored) {
    if (!item || typeof item !== "object") continue;
    const { id, text, done } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof text !== "string") continue;
    out.push({ id, text, done: done === true });
  }
  return out;
}

export function isPriority(n: unknown): n is CommitmentPriority {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 3;
}

const FIXED_RULES = ["daily", "weekdays", "weekly", "fortnightly", "monthly", "yearly"] as const;
const EVERY_RE = /^every:(\d{1,3}):(day|week|month)$/;

/** "daily" · "weekdays" · "weekly" · "fortnightly" · "monthly" · "yearly" · "every:N:day|week|month" (N 1–365). */
export function isValidRecurrence(rule: string): boolean {
  if ((FIXED_RULES as readonly string[]).includes(rule)) return true;
  const m = EVERY_RE.exec(rule);
  if (!m) return false;
  const n = Number(m[1]);
  return n >= 1 && n <= 365;
}

export const RECURRENCE_ERROR =
  'A repeat must be "daily", "weekdays", "weekly", "fortnightly", "monthly", "yearly", or "every:N:day", "every:N:week" or "every:N:month" with N from 1 to 365.';

function addUtcDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Same day-of-month N months on, clamped to the end of a shorter month (31 Jan → 28/29 Feb). Keeps the time. */
function addUtcMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(d.getUTCDate(), lastDay),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
}

/**
 * The next time a repeating to-do falls after `from`, keeping its time of day. Days are UTC
 * calendar days. Throws on a rule `isValidRecurrence` rejects: callers validate first.
 */
export function nextOccurrence(rule: string, from: Date): Date {
  switch (rule) {
    case "daily":
      return addUtcDays(from, 1);
    case "weekdays": {
      let next = addUtcDays(from, 1);
      while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next = addUtcDays(next, 1);
      return next;
    }
    case "weekly":
      return addUtcDays(from, 7);
    case "fortnightly":
      return addUtcDays(from, 14);
    case "monthly":
      return addUtcMonths(from, 1);
    case "yearly":
      return addUtcMonths(from, 12);
  }
  const m = EVERY_RE.exec(rule);
  if (!m || !isValidRecurrence(rule)) throw new Error(`Unknown repeat rule: ${rule}`);
  const n = Number(m[1]);
  if (m[2] === "day") return addUtcDays(from, n);
  if (m[2] === "week") return addUtcDays(from, n * 7);
  return addUtcMonths(from, n);
}

export interface WhenFields {
  startAt: Date | null;
  evening: boolean;
  someday: boolean;
}

/**
 * Applies a change to when a to-do is planned. Someday and a start date exclude each other:
 * `someday: true` clears startAt and evening; setting a startAt clears someday. Asking for both
 * at once is an error rather than a guess.
 */
export function applyWhen(
  current: WhenFields,
  patch: { startAt?: Date | null; evening?: boolean; someday?: boolean },
): Result<WhenFields> {
  if (patch.someday === true && patch.startAt) {
    return { error: "A to-do can't be both someday and planned for a date." };
  }
  if (patch.someday === true && patch.evening === true) {
    return { error: "A to-do can't be both someday and this evening." };
  }
  const next: WhenFields = { ...current };
  if (patch.startAt !== undefined) next.startAt = patch.startAt;
  if (patch.evening !== undefined) next.evening = patch.evening;
  if (patch.someday !== undefined) next.someday = patch.someday;
  if (patch.someday === true) {
    next.startAt = null;
    next.evening = false;
  } else if (patch.startAt) {
    next.someday = false;
  }
  return { value: next };
}

export interface RepeatSource {
  dueAt: Date | null;
  startAt: Date | null;
  remindAt: Date | null;
  checklist: ChecklistItem[];
}

/**
 * The dates and checklist of the next occurrence of a repeating to-do just completed. Each date
 * is moved on from its own old value; when none was set, dueAt is the next occurrence from now.
 */
export function nextOccurrenceFields(rule: string, from: RepeatSource, now: Date): RepeatSource {
  const shift = (d: Date | null) => (d ? nextOccurrence(rule, d) : null);
  const next: RepeatSource = {
    dueAt: shift(from.dueAt),
    startAt: shift(from.startAt),
    remindAt: shift(from.remindAt),
    checklist: from.checklist.map((item) => ({ ...item, done: false })),
  };
  if (!from.dueAt && !from.startAt && !from.remindAt) next.dueAt = nextOccurrence(rule, now);
  return next;
}
