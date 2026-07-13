// Pure mapper: live Foundry data → the Brief shape. No React, no fetching — just a
// deterministic transform, so it's trivial to test and reason about. Mirrors the
// section order of Dia's brief: greeting → push-forward → to-dos → updates → your day.

import type { CalendarEvent } from "@/lib/api";
import type { DeskActionItemDTO, DeskSlackMessage, DeskSlackResult } from "@/types/desk";
import type { MyDayDTO, TaskAttentionDTO, TaskDTO } from "@/types/tasks";
import type {
  Brief,
  BriefEvent,
  BriefTodo,
  BriefUpdate,
  BriefPushForward,
} from "@/types/brief";
import { paintingForDate } from "./paintings";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface BuildBriefInput {
  now: Date;
  firstName: string;
  myDay?: MyDayDTO;
  attention?: TaskAttentionDTO;
  calendar?: { connected: boolean; events: CalendarEvent[] };
  slack?: DeskSlackResult;
  actionItems?: DeskActionItemDTO[];
}

export function buildBrief(input: BuildBriefInput): Brief {
  const { now, firstName } = input;
  const weekday = WEEKDAYS[now.getDay()];

  const events = buildEvents(input.calendar?.events ?? [], now);
  const pushForward = buildPushForward(input);
  const todos = buildTodos(input, pushForward);
  const updates = buildUpdates(input);

  const sources: string[] = ["Tasks"];
  if (input.calendar?.connected) sources.push("Google Calendar");
  if (input.slack?.configured) sources.push("Slack");

  return {
    dateISO: now.toISOString(),
    weekday,
    greeting: buildGreeting({ weekday, firstName, events, attention: input.attention }),
    pushForward,
    todos,
    updates,
    events,
    sources,
    painting: paintingForDate(now),
  };
}

// ── Greeting ────────────────────────────────────────────────────────────────

function buildGreeting({
  weekday,
  firstName,
  events,
  attention,
}: {
  weekday: string;
  firstName: string;
  events: BriefEvent[];
  attention?: TaskAttentionDTO;
}): string {
  const meetings = events.length;
  const overdue = attention?.overdueCount ?? 0;
  const dueSoon = attention?.dueSoonCount ?? 0;

  const agenda =
    meetings === 0
      ? "a clear runway ahead"
      : `${meetings} ${meetings === 1 ? "meeting" : "meetings"} on the calendar`;

  const tasks =
    overdue > 0
      ? `${overdue} overdue to clear`
      : dueSoon > 0
        ? `${dueSoon} due soon`
        : "nothing pressing on the board";

  const closer = overdue > 0 || meetings >= 4 ? " Pace yourself — you've got this." : "";

  return `${weekday}, ${firstName} — ${agenda}, ${tasks}.${closer}`;
}

// ── Push forward ──────────────────────────────────────────────────────────────

function buildPushForward(input: BuildBriefInput): BriefPushForward | null {
  const overdue = input.attention?.overdue?.[0];
  const doing = input.myDay?.doing?.[0];
  const upcoming = input.myDay?.upcoming?.[0];

  if (overdue) {
    return {
      title: overdue.title,
      body: `${clientName(overdue)}${dueClause(overdue)} — it's overdue. Clearing this first unblocks the rest of your day.`,
      href: boardHref(overdue),
      ctaLabel: "Open board",
    };
  }
  if (doing) {
    return {
      title: doing.title,
      body: `You're mid-flight on this for ${clientName(doing)}. Keep the momentum before anything else lands.`,
      href: boardHref(doing),
      ctaLabel: "Open board",
    };
  }
  if (upcoming) {
    return {
      title: upcoming.title,
      body: `Next up for ${clientName(upcoming)}${dueClause(upcoming)}. A good one to start the day on.`,
      href: boardHref(upcoming),
      ctaLabel: "Open board",
    };
  }
  return null;
}

// ── To-dos ─────────────────────────────────────────────────────────────────

function buildTodos(input: BuildBriefInput, pushForward: BriefPushForward | null): BriefTodo[] {
  const overdue = input.attention?.overdue ?? [];
  const doing = input.myDay?.doing ?? [];
  const upcoming = input.myDay?.upcoming ?? [];

  // Overdue first, then in-flight, then what's next — deduped by id, and skipping
  // whatever the push-forward card already champions (title match is enough).
  const seen = new Set<string>();
  const pool: { task: TaskDTO; overdue: boolean }[] = [
    ...overdue.map((task) => ({ task, overdue: true })),
    ...doing.map((task) => ({ task, overdue: false })),
    ...upcoming.map((task) => ({ task, overdue: false })),
  ];

  const todos: BriefTodo[] = [];
  for (const { task, overdue: isOverdue } of pool) {
    if (seen.has(task.id)) continue;
    if (pushForward && task.title === pushForward.title) continue;
    seen.add(task.id);
    todos.push({
      id: task.id,
      title: task.title,
      body: `${clientName(task)}${dueClause(task)}.`,
      label: task.client?.name,
      labelStyle: isOverdue ? "active" : "outline",
      href: boardHref(task),
    });
    if (todos.length >= 3) break;
  }
  return todos;
}

// ── Updates ─────────────────────────────────────────────────────────────────

function buildUpdates(input: BuildBriefInput): BriefUpdate[] {
  const messages = input.slack?.messages ?? [];
  if (messages.length > 0) return collateSlack(messages);

  // No Slack chatter (or Slack not configured) → surface recent meeting action items.
  const items = input.actionItems ?? [];
  return items.slice(0, 4).map((it) => ({
    id: it.id,
    title: it.title,
    body: `From ${it.meetingTitle}.`,
    label: it.clientName ?? "Meeting",
    labelStyle: "outline" as const,
    href: it.clientSlug ? `/app/portal/${it.clientSlug}` : undefined,
    source: "scribe" as const,
  }));
}

/** Low-signal one-liners we don't want to headline an update with. */
const CHATTER =
  /^(thanks?|thank you|ok(ay)?|sure|on it|great|perfect|done|got it|noted|yes|yep|nope?|no problem|np|will do|cool|sounds good|awesome|nice|ty|👍|🙏|🎉)\b/i;

function isSubstantive(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length >= 15 && !CHATTER.test(t);
}

/**
 * Collate raw Slack messages into one update per client (channel), most-recent-first.
 * Each entry leads with the client, a message count, and the single most substantive
 * recent line — so the section reads as "what's happening per client", not a dump of
 * every "thanks"/"on it" reply.
 */
function collateSlack(messages: DeskSlackMessage[]): BriefUpdate[] {
  type Group = { clientName: string; clientSlug: string; msgs: DeskSlackMessage[]; latest: number };
  const groups = new Map<string, Group>();
  for (const m of messages) {
    const g = groups.get(m.clientSlug) ?? {
      clientName: m.clientName,
      clientSlug: m.clientSlug,
      msgs: [],
      latest: 0,
    };
    g.msgs.push(m);
    g.latest = Math.max(g.latest, +new Date(m.ts));
    groups.set(m.clientSlug, g);
  }

  return [...groups.values()]
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 4)
    .map((g) => {
      const recent = g.msgs.slice().sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
      const lead = recent.find((m) => isSubstantive(m.text)) ?? recent[0];
      const authors = [...new Set(g.msgs.map((m) => firstName(m.author)))];
      const body = lead
        ? `${firstName(lead.author)}: ${truncate(lead.text, 200)}`
        : `${g.msgs.length} quick ${g.msgs.length === 1 ? "reply" : "replies"} from ${authors.join(", ")}.`;
      return {
        id: g.clientSlug,
        title: g.clientName,
        body,
        label: `${g.msgs.length} ${g.msgs.length === 1 ? "message" : "messages"}`,
        labelStyle: "outline" as const,
        href: `/app/portal/${g.clientSlug}`,
        source: "slack" as const,
      };
    });
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// ── Your day ─────────────────────────────────────────────────────────────────

function buildEvents(events: CalendarEvent[], now: Date): BriefEvent[] {
  const today = events
    .filter((ev) => ev.start && new Date(ev.start).toDateString() === now.toDateString())
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));

  const nextStart = today.find((e) => new Date(e.start) >= now)?.start ?? null;

  return today.map((ev) => {
    const start = new Date(ev.start);
    const end = new Date(ev.end || ev.start);
    return {
      id: ev.id,
      time: fmtTime(start),
      endTime: ev.end ? fmtTime(end) : undefined,
      title: ev.summary || "(no title)",
      note: buildEventNote(ev),
      attendees: ev.attendees ?? [],
      joinUrl: ev.meetLink ?? undefined,
      section: start.getHours() < 12 ? "morning" : "afternoon",
      isNext: ev.start === nextStart,
      isNow: start <= now && now < end,
    };
  });
}

function buildEventNote(ev: CalendarEvent): string | undefined {
  const parts: string[] = [];
  const n = ev.attendees?.length ?? 0;
  if (n > 0) parts.push(`${n} ${n === 1 ? "attendee" : "attendees"}`);
  if (ev.location) parts.push(ev.location);
  if (ev.meetLink) parts.push("Google Meet");
  return parts.length ? parts.join(" · ") : undefined;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clientName(task: TaskDTO): string {
  return task.client?.name ?? "Internal";
}

function boardHref(task: TaskDTO): string | undefined {
  return task.client?.slug ? `/app/portal/${task.client.slug}/tasks` : undefined;
}

function dueClause(task: TaskDTO): string {
  if (!task.dueDate) return "";
  const due = new Date(task.dueDate);
  const label = due.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const overdue = due < new Date() && task.status !== "DONE";
  return ` · ${overdue ? "was due" : "due"} ${label}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}
