// Pure mapper: live Foundry data → the Brief shape. No React, no fetching — just a
// deterministic transform, so it's trivial to test and reason about. Mirrors the
// section order of Dia's brief: greeting → push-forward → to-dos → updates → your day.

import type { CalendarEvent } from "@/lib/api";
import type { DeskActionItemDTO, DeskSlackResult } from "@/types/desk";
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
  if (messages.length > 0) {
    return messages.slice(0, 4).map((m) => ({
      id: m.id,
      title: m.author,
      body: truncate(m.text, 220),
      label: m.clientName,
      labelStyle: "outline" as const,
      href: `/app/portal/${m.clientSlug}`,
      source: "slack" as const,
    }));
  }

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
