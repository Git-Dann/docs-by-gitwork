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
  opts: { userEmail: string; internalDomains: ReadonlyArray<string>; now: Date },
): FollowUpSuggestion | null {
  if (event.status === "cancelled") return null;
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
