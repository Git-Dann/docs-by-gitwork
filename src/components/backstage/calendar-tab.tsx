"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  GlobeAltIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import {
  useBackstageCalendar,
  useBackstageCalendarTimeline,
  useCalendarConnections,
  useTeamCalendarEvents,
} from "@/hooks/use-backstage";
import { usePermissions } from "@/hooks/use-permissions";
import { BackstagePanel } from "@/components/backstage/panel";
import { cn } from "@/lib/format";
import type {
  CalendarDay,
  CalendarLeaveBar,
  CalendarTimelineBlock,
  CalendarTimelineMilestone,
  LeaveType,
  TeamCalendarEvent,
} from "@/types/backstage";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

const DAY_HEADING_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Viewer's hidden-holiday-country preference. Workspace-wide which countries
// EXIST (UK + PK by default, configured server-side); this just lets each
// person hide ones they don't care about on their own view.
const HIDDEN_COUNTRIES_KEY = "backstage:calendar:hiddenHolidayCountries";

// Admin-only Portal Gantt overlay prefs.
const TIMELINE_ENABLED_KEY = "backstage:calendar:timelineEnabled";
const TIMELINE_WEEKDAY_KEY = "backstage:calendar:timelineWeekday"; // "mon" | "fri"
// Clients the viewer has hidden from the overlay (default empty = all shown, so
// new clients appear automatically — mirrors the holiday-country hidden set).
const HIDDEN_TIMELINE_CLIENTS_KEY = "backstage:calendar:hiddenTimelineClients";

type TimelineWeekday = "mon" | "fri";

const REGION_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function countryName(code: string): string {
  try {
    return REGION_NAMES?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function readHiddenCountries(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(HIDDEN_COUNTRIES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function readTimelineEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(TIMELINE_ENABLED_KEY) === "1";
}

function readTimelineWeekday(): TimelineWeekday {
  if (typeof window === "undefined") return "mon";
  return window.localStorage.getItem(TIMELINE_WEEKDAY_KEY) === "fri" ? "fri" : "mon";
}

function readHiddenTimelineClients(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(HIDDEN_TIMELINE_CLIENTS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

// Which colleagues' Google Calendars the viewer has chosen to overlay.
const SELECTED_CALENDARS_KEY = "backstage:calendar:selectedCalendars";

function readSelectedCalendars(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SELECTED_CALENDARS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function hasSelectedCalendarPreference(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(SELECTED_CALENDARS_KEY) !== null;
}

// Stable per-member colour for overlaid calendar events.
const MEMBER_DOTS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-teal-500",
];

function memberDot(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return MEMBER_DOTS[h % MEMBER_DOTS.length];
}

// Feature-block accent palette, keyed by FeatureBlock.color (mirrors gantt-chart.tsx).
const BLOCK_TONES: Record<string, { dot: string; pill: string }> = {
  blue: { dot: "bg-blue-500", pill: "border-blue-200 bg-blue-50 text-blue-800" },
  violet: { dot: "bg-violet-500", pill: "border-violet-200 bg-violet-50 text-violet-800" },
  emerald: { dot: "bg-emerald-500", pill: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  amber: { dot: "bg-amber-500", pill: "border-amber-200 bg-amber-50 text-amber-800" },
  rose: { dot: "bg-rose-500", pill: "border-rose-200 bg-rose-50 text-rose-800" },
  slate: { dot: "bg-[var(--text-4)]", pill: "border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-2)]" },
};

function blockTone(color?: string | null) {
  return BLOCK_TONES[color ?? "blue"] ?? BLOCK_TONES.blue;
}

// The grid-day ISO keys an event covers. Google all-day `end` is exclusive.
function eventDayKeys(ev: TeamCalendarEvent): string[] {
  const startIso = ev.start.slice(0, 10);
  const cur = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${ev.end.slice(0, 10)}T00:00:00Z`);
  if (ev.allDay) end.setUTCDate(end.getUTCDate() - 1);
  const keys: string[] = [];
  let guard = 0;
  while (cur <= end && guard < 90) {
    keys.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return keys.length ? keys : [startIso];
}

function eventTime(ev: TeamCalendarEvent): string {
  if (ev.allDay) return "all day";
  const d = new Date(ev.start);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const LEAVE_COLOURS: Record<LeaveType, { bar: string; dot: string; label: string }> = {
  ANNUAL: {
    bar: "bg-[var(--brand-100)] text-[var(--brand-800)] border-[var(--brand-300)]",
    dot: "bg-[var(--brand-500)]",
    label: "Annual",
  },
  SICK: {
    bar: "bg-amber-100 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
    label: "Sick",
  },
  UNPAID: {
    bar: "bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border-1)]",
    dot: "bg-[var(--text-4)]",
    label: "Unpaid",
  },
  OTHER: {
    bar: "bg-violet-100 text-violet-800 border-violet-300",
    dot: "bg-violet-500",
    label: "Other",
  },
};

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function firstOfMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// True when a dated block is active anywhere within [weekStart, weekEnd] (ISO day keys).
function blockActiveInWeek(
  block: CalendarTimelineBlock,
  weekStartKey: string,
  weekEndKey: string,
): boolean {
  const s = block.startDate.slice(0, 10);
  const e = block.endDate.slice(0, 10);
  return s <= weekEndKey && e >= weekStartKey;
}

export function CalendarTab({ number = "01" }: { number?: string }) {
  const today = new Date();
  const [{ year, month }, setView] = useState<{ year: number; month: number }>({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
  });
  const cal = useBackstageCalendar(year, month);

  const { isAdminOrAbove } = usePermissions();

  const [hiddenCountries, setHiddenCountries] = useState<Set<string>>(readHiddenCountries);

  // Day-detail column: which day is shown on the right. Defaults to today.
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  // Admin-only Portal Gantt overlay.
  const [timelineEnabled, setTimelineEnabled] = useState<boolean>(readTimelineEnabled);
  const [timelineWeekday, setTimelineWeekday] = useState<TimelineWeekday>(readTimelineWeekday);
  const [hiddenClients, setHiddenClients] = useState<Set<string>>(readHiddenTimelineClients);
  const timelineOn = isAdminOrAbove && timelineEnabled;
  const timeline = useBackstageCalendarTimeline(year, month, timelineOn);

  const holidayCountries = cal.data?.holidayCountries ?? [];

  function gotoMonth(next: { year: number; month: number }) {
    setView(next);
    setSelectedDate(firstOfMonthKey(next.year, next.month));
  }

  function toggleCountry(code: string) {
    setHiddenCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(HIDDEN_COUNTRIES_KEY, JSON.stringify(Array.from(next)));
      }
      return next;
    });
  }

  function toggleTimeline() {
    setTimelineEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TIMELINE_ENABLED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  function chooseWeekday(day: TimelineWeekday) {
    setTimelineWeekday(day);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TIMELINE_WEEKDAY_KEY, day);
    }
  }

  function persistHiddenClients(next: Set<string>) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HIDDEN_TIMELINE_CLIENTS_KEY, JSON.stringify(Array.from(next)));
    }
  }

  function toggleClientVisible(clientId: string) {
    setHiddenClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      persistHiddenClients(next);
      return next;
    });
  }

  // "All" → show everything (empty hidden set, so future clients show too).
  // "None" → hide every currently-listed client.
  function setAllClientsHidden(hidden: boolean, ids: string[]) {
    const next = hidden ? new Set(ids) : new Set<string>();
    persistHiddenClients(next);
    setHiddenClients(next);
  }

  // ── Google Calendar overlay ──
  const connections = useCalendarConnections();
  const connectionMembers = useMemo(() => connections.data?.members ?? [], [connections.data?.members]);
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(readSelectedCalendars);
  useEffect(() => {
    const self = connectionMembers.find((m) => m.isSelf);
    if (!self || hasSelectedCalendarPreference()) return;
    setSelectedCalendars((prev) => {
      if (prev.has(self.id)) return prev;
      const next = new Set(prev);
      next.add(self.id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SELECTED_CALENDARS_KEY, JSON.stringify(Array.from(next)));
      }
      return next;
    });
  }, [connectionMembers]);
  const selectedIds = Array.from(selectedCalendars);
  const teamEvents = useTeamCalendarEvents(year, month, selectedIds);

  function toggleCalendar(userId: string) {
    setSelectedCalendars((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SELECTED_CALENDARS_KEY, JSON.stringify(Array.from(next)));
      }
      return next;
    });
  }

  // Index overlaid events by the grid-day ISO they fall on.
  const eventsByDay = new Map<string, TeamCalendarEvent[]>();
  for (const ev of teamEvents.data?.events ?? []) {
    for (const key of eventDayKeys(ev)) {
      const list = eventsByDay.get(key) ?? [];
      list.push(ev);
      eventsByDay.set(key, list);
    }
  }

  // ── Portal Gantt overlay → per-day markers ──
  // For each week a block is active, drop ONE marker on the chosen weekday cell
  // (Mon or Fri) — a consistent weekly "where are we" slot per client.
  const markersByDay = new Map<string, CalendarTimelineBlock[]>();
  const milestonesByDay = new Map<string, CalendarTimelineMilestone[]>();
  if (timelineOn && cal.data) {
    const weekdayIndex = timelineWeekday === "fri" ? 4 : 0;
    for (const week of cal.data.weeks) {
      if (week.length < 7) continue;
      const weekStartKey = week[0].date;
      const weekEndKey = week[6].date;
      const slotKey = week[weekdayIndex].date;
      for (const block of timeline.data?.blocks ?? []) {
        if (hiddenClients.has(block.clientId)) continue;
        if (blockActiveInWeek(block, weekStartKey, weekEndKey)) {
          const list = markersByDay.get(slotKey) ?? [];
          list.push(block);
          markersByDay.set(slotKey, list);
        }
      }
    }
    for (const m of timeline.data?.milestones ?? []) {
      if (hiddenClients.has(m.clientId)) continue;
      const key = m.date.slice(0, 10);
      const list = milestonesByDay.get(key) ?? [];
      list.push(m);
      milestonesByDay.set(key, list);
    }
  }

  // Distinct clients with timeline data this month — drives the client picker.
  const timelineClients = (() => {
    if (!timelineOn) return [] as { id: string; name: string }[];
    const byId = new Map<string, string>();
    for (const b of timeline.data?.blocks ?? []) byId.set(b.clientId, b.clientName);
    for (const m of timeline.data?.milestones ?? []) byId.set(m.clientId, m.clientName);
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  })();
  const visibleClientCount = timelineClients.filter((c) => !hiddenClients.has(c.id)).length;

  const monthLabel = MONTH_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));

  // Resolve the selected day for the detail column (fall back to first
  // in-month day when the selection isn't on this grid, e.g. after navigating).
  const flatDays = cal.data?.weeks.flat() ?? [];
  const selectedDay =
    flatDays.find((d) => d.date === selectedDate) ??
    flatDays.find((d) => d.isCurrentMonth) ??
    null;

  return (
    <BackstagePanel
      number={number}
      title="TEAM CALENDAR"
      bodyClassName="space-y-4 p-4"
      action={
        <>
          {/* Portal Gantt overlay (admin / super-admin only) */}
          {isAdminOrAbove ? (
            <details className="relative mr-1">
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-center gap-1.5 rounded-[6px] border px-3 py-1 text-xs font-medium transition [&::-webkit-details-marker]:hidden",
                  timelineEnabled
                    ? "border-[var(--brand-300)] bg-[var(--brand-50)] text-[var(--brand-700)]"
                    : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                )}
              >
                <CalendarDaysIcon className="h-3.5 w-3.5 text-[var(--brand-500)]" />
                Timeline
                {timelineEnabled && timelineClients.length > 0 ? (
                  <span className="rounded-full bg-[var(--brand-50)] px-1.5 text-[10px] font-semibold text-[var(--brand-700)]">
                    {visibleClientCount}/{timelineClients.length}
                  </span>
                ) : null}
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-64 rounded-[8px] border border-[var(--border-2)] bg-white p-2 shadow-lg">
                <label className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-[var(--text-1)] hover:bg-[var(--surface-1)]">
                  <input type="checkbox" checked={timelineEnabled} onChange={toggleTimeline} />
                  <span className="flex-1">Show client timelines</span>
                </label>
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-[var(--text-3)]">
                  Weekly marker on
                </p>
                <div className="flex gap-1 px-2 pb-1">
                  {(["mon", "fri"] as TimelineWeekday[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => chooseWeekday(d)}
                      disabled={!timelineEnabled}
                      className={cn(
                        "flex-1 rounded-[6px] border px-2 py-1 text-xs font-medium capitalize transition disabled:opacity-40",
                        timelineWeekday === d
                          ? "border-[var(--brand-300)] bg-[var(--brand-50)] text-[var(--brand-700)]"
                          : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                      )}
                    >
                      {d === "mon" ? "Monday" : "Friday"}
                    </button>
                  ))}
                </div>
                {/* Per-client visibility */}
                {timelineEnabled ? (
                  <div className="mt-1 border-t border-[var(--border-2)] pt-1.5">
                    <div className="flex items-center justify-between px-2 pb-1">
                      <p className="text-[11px] font-medium text-[var(--text-3)]">Clients</p>
                      {timelineClients.length > 0 ? (
                        <div className="flex items-center gap-2 text-[10px] font-medium">
                          <button
                            type="button"
                            onClick={() => setAllClientsHidden(false, timelineClients.map((c) => c.id))}
                            className="text-[var(--brand-700)] hover:underline"
                          >
                            All
                          </button>
                          <span className="text-[var(--text-4)]">·</span>
                          <button
                            type="button"
                            onClick={() => setAllClientsHidden(true, timelineClients.map((c) => c.id))}
                            className="text-[var(--text-3)] hover:underline"
                          >
                            None
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {timeline.isLoading ? (
                        <p className="px-2 py-1 text-xs text-[var(--text-4)]">Loading…</p>
                      ) : timelineClients.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-[var(--text-4)]">
                          No client timelines this month.
                        </p>
                      ) : (
                        timelineClients.map((c) => (
                          <label
                            key={c.id}
                            className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-[var(--text-1)] hover:bg-[var(--surface-1)]"
                          >
                            <input
                              type="checkbox"
                              checked={!hiddenClients.has(c.id)}
                              onChange={() => toggleClientVisible(c.id)}
                            />
                            <span className="flex-1 truncate">{c.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
                <p className="border-t border-[var(--border-2)] px-2 pb-1 pt-1.5 text-[11px] leading-snug text-[var(--text-4)]">
                  Pulls dated feature blocks + milestones from each client&apos;s Gantt. Admins only.
                </p>
              </div>
            </details>
          ) : null}
          {/* Holiday country toggle */}
          <details className="relative mr-1">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] [&::-webkit-details-marker]:hidden">
              <GlobeAltIcon className="h-3.5 w-3.5 text-sky-500" />
              Holidays
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-60 rounded-[8px] border border-[var(--border-2)] bg-white p-2 shadow-lg">
              <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-[var(--text-3)]">
                Show holidays for
              </p>
              {holidayCountries.length === 0 ? (
                <p className="px-2 py-1 text-xs text-[var(--text-4)]">No countries configured.</p>
              ) : (
                holidayCountries.map((cc) => (
                  <label
                    key={cc}
                    className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-[var(--text-1)] hover:bg-[var(--surface-1)]"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenCountries.has(cc)}
                      onChange={() => toggleCountry(cc)}
                    />
                    <span className="flex-1 truncate">{countryName(cc)}</span>
                    <span className="text-[10px] font-medium text-[var(--text-4)]">{cc}</span>
                  </label>
                ))
              )}
            </div>
          </details>
          {/* Colleagues' Google Calendars */}
          <details className="relative mr-1">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] [&::-webkit-details-marker]:hidden">
              <UsersIcon className="h-3.5 w-3.5 text-[var(--brand-500)]" />
              Calendars
              {selectedIds.length > 0 ? (
                <span className="rounded-full bg-[var(--brand-50)] px-1.5 text-[10px] font-semibold text-[var(--brand-700)]">
                  {selectedIds.length}
                </span>
              ) : null}
            </summary>
            <div className="absolute right-0 z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-[8px] border border-[var(--border-2)] bg-white p-2 shadow-lg">
              <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-[var(--text-3)]">
                Overlay Google Calendars
              </p>
              {connectionMembers.length === 0 ? (
                <p className="px-2 py-1 text-xs text-[var(--text-4)]">
                  No connected calendars yet. Teammates appear here once they sign in with Google.
                </p>
              ) : (
                connectionMembers.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-[var(--text-1)] hover:bg-[var(--surface-1)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCalendars.has(m.id)}
                      onChange={() => toggleCalendar(m.id)}
                    />
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", memberDot(m.id))} />
                    <span className="flex-1 truncate">
                      {m.name}
                      {m.isSelf ? " (me)" : ""}
                    </span>
                  </label>
                ))
              )}
            </div>
          </details>
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => gotoMonth(prevMonth(year, month))}
            className="rounded-[6px] border border-[var(--border-2)] bg-white p-1 text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setView({ year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 });
              setSelectedDate(todayKey());
            }}
            className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => gotoMonth(nextMonth(year, month))}
            className="rounded-[6px] border border-[var(--border-2)] bg-white p-1 text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </>
      }
    >
      {/* Month label + legend */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold text-[var(--text-1)]">{monthLabel}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-3)]">
          {(Object.keys(LEAVE_COLOURS) as LeaveType[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", LEAVE_COLOURS[t].dot)} />
              {LEAVE_COLOURS[t].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <GlobeAltIcon className="h-3 w-3 text-sky-500" />
            Public/religious holiday
          </span>
          {timelineOn ? (
            <span className="inline-flex items-center gap-1.5">
              <FlagIcon className="h-3 w-3 text-[var(--brand-500)]" />
              Client milestone
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Calendar box — weekday header + grid joined into a single bordered card. */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-[10px] border border-[var(--border-2)]">
          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-px bg-[var(--border-2)]">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="bg-[var(--surface-1)] px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          {cal.isLoading ? (
            <div className="grid h-[480px] place-items-center border-t border-[var(--border-2)] bg-white text-sm text-[var(--text-3)]">
              Loading…
            </div>
          ) : cal.isError ? (
            <div className="grid h-[480px] place-items-center border-t border-[var(--border-2)] bg-white text-sm text-red-600">
              {(cal.error as Error)?.message ?? "Failed to load calendar"}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px border-t border-[var(--border-2)] bg-[var(--border-2)]">
              {flatDays.map((day) => (
                <DayCell
                  key={day.date}
                  day={day}
                  hiddenCountries={hiddenCountries}
                  events={eventsByDay.get(day.date) ?? []}
                  markers={markersByDay.get(day.date) ?? []}
                  milestones={milestonesByDay.get(day.date) ?? []}
                  isSelected={day.date === selectedDay?.date}
                  onSelect={() => setSelectedDate(day.date)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Day-detail column */}
        <DayDetail
          day={selectedDay}
          hiddenCountries={hiddenCountries}
          events={selectedDay ? eventsByDay.get(selectedDay.date) ?? [] : []}
          markers={selectedDay ? markersByDay.get(selectedDay.date) ?? [] : []}
          milestones={selectedDay ? milestonesByDay.get(selectedDay.date) ?? [] : []}
          timelineOn={timelineOn}
        />
      </div>

      {/* Footer notes */}
      <p className="text-xs text-[var(--text-4)]">
        Approved leave only. Half-days show as half-filled pills. Public/religious holidays cover{" "}
        {holidayCountries.length > 0
          ? holidayCountries.map(countryName).join(" + ")
          : "your configured countries"}{" "}
        — use the Holidays menu to show or hide each.
        {isAdminOrAbove
          ? " Use Timeline to overlay each client's current deliverable from their Gantt."
          : ""}
      </p>
    </BackstagePanel>
  );
}

function DayCell({
  day,
  hiddenCountries,
  events,
  markers,
  milestones,
  isSelected,
  onSelect,
}: {
  day: CalendarDay;
  hiddenCountries: Set<string>;
  events: TeamCalendarEvent[];
  markers: CalendarTimelineBlock[];
  milestones: CalendarTimelineMilestone[];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const date = new Date(day.date + "T00:00:00Z");
  const dayNum = date.getUTCDate();
  const MAX_PILLS = 3;
  const overflow = day.leave.length > MAX_PILLS ? day.leave.length - MAX_PILLS : 0;
  const holidays = day.holidays.filter((h) => !hiddenCountries.has(h.country));
  const MAX_EVENTS = 2;
  const eventOverflow = events.length > MAX_EVENTS ? events.length - MAX_EVENTS : 0;
  const MAX_MARKERS = 2;
  const markerOverflow = markers.length > MAX_MARKERS ? markers.length - MAX_MARKERS : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "min-h-[100px] cursor-pointer bg-white p-1.5 text-left transition hover:bg-[var(--surface-1)]",
        !day.isCurrentMonth && "bg-[var(--surface-1)]",
        day.isWeekend && day.isCurrentMonth && "bg-[#FAFAF9]",
        isSelected && "ring-2 ring-inset ring-[var(--brand-500)]",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
            day.isToday
              ? "bg-[var(--brand-600)] text-white"
              : day.isCurrentMonth
                ? "text-[var(--text-1)]"
                : "text-[var(--text-4)]",
          )}
        >
          {dayNum}
        </span>
        {holidays.length > 0 ? (
          <span
            className="inline-flex items-center gap-0.5 truncate rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
            title={holidays.map((h) => `${h.country}: ${h.name}`).join(" · ")}
          >
            <GlobeAltIcon className="h-3 w-3 shrink-0" />
            {Array.from(new Set(holidays.map((h) => h.country))).join(" ")}
          </span>
        ) : null}
      </div>

      {/* Holiday names (first one) */}
      {holidays.length > 0 ? (
        <p
          className="mt-1 truncate text-[10px] text-sky-700"
          title={holidays.map((h) => h.name).join(" · ")}
        >
          {holidays[0].name}
          {holidays.length > 1 ? ` +${holidays.length - 1}` : ""}
        </p>
      ) : null}

      {/* Client timeline markers (feature blocks active this week) */}
      {markers.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {markers.slice(0, MAX_MARKERS).map((b) => {
            const tone = blockTone(b.color);
            return (
              <div
                key={b.id}
                className={cn(
                  "flex items-center gap-1 truncate rounded-[4px] border px-1 py-0.5 text-[10px] font-medium",
                  tone.pill,
                )}
                title={`${b.clientName} · ${b.name} · ${b.progress}% complete`}
              >
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
                <span className="truncate">
                  {b.clientName}: {b.name}
                </span>
              </div>
            );
          })}
          {markerOverflow > 0 ? (
            <p className="px-1 text-[10px] text-[var(--text-4)]">+{markerOverflow} more</p>
          ) : null}
        </div>
      ) : null}

      {/* Milestones (single-date) */}
      {milestones.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {milestones.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-1 truncate text-[10px] font-medium text-[var(--brand-700)]"
              title={`${m.clientName} · ${m.name}`}
            >
              <FlagIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{m.name}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Leave pills */}
      <div className="mt-1 space-y-0.5">
        {day.leave.slice(0, MAX_PILLS).map((bar) => (
          <LeavePill key={bar.leaveRequestId + bar.userId} bar={bar} />
        ))}
        {overflow > 0 ? (
          <p className="px-1 text-[10px] text-[var(--text-4)]">+{overflow} more</p>
        ) : null}
      </div>

      {/* Google Calendar events (selected colleagues) */}
      {events.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {events.slice(0, MAX_EVENTS).map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-1 truncate text-[10px] text-[var(--text-2)]"
              title={`${ev.userName} · ${ev.summary} · ${eventTime(ev)}`}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", memberDot(ev.userId))} />
              <span className="truncate">{ev.summary}</span>
            </div>
          ))}
          {eventOverflow > 0 ? (
            <p className="px-1 text-[10px] text-[var(--text-4)]">+{eventOverflow} more</p>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

function LeavePill({ bar }: { bar: CalendarLeaveBar }) {
  const c = LEAVE_COLOURS[bar.type];
  const initial = bar.userName.charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        "flex items-center gap-1 truncate border px-1.5 py-0.5 text-[10px] font-medium",
        c.bar,
        bar.isStartOfLeave ? "rounded-l-full" : "border-l-0",
        bar.isEndOfLeave ? "rounded-r-full" : "border-r-0",
        bar.isHalfDayHere && "opacity-70",
      )}
      title={`${bar.userName} · ${c.label.toLowerCase()}${bar.isHalfDayHere ? " (½ day)" : ""}`}
    >
      <span className={cn("inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white", c.dot)}>
        {initial}
      </span>
      <span className="truncate">{bar.userName.split(" ")[0]}</span>
      {bar.isHalfDayHere ? <span className="ml-auto">½</span> : null}
    </div>
  );
}

// Right-hand column: everything happening on the selected day.
function DayDetail({
  day,
  hiddenCountries,
  events,
  markers,
  milestones,
  timelineOn,
}: {
  day: CalendarDay | null;
  hiddenCountries: Set<string>;
  events: TeamCalendarEvent[];
  markers: CalendarTimelineBlock[];
  milestones: CalendarTimelineMilestone[];
  timelineOn: boolean;
}) {
  if (!day) {
    return (
      <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-4 lg:w-80 lg:shrink-0">
        <p className="text-sm text-[var(--text-3)]">Select a day to see what&apos;s on.</p>
      </div>
    );
  }

  const heading = DAY_HEADING_FORMATTER.format(new Date(day.date + "T00:00:00Z"));
  const holidays = day.holidays.filter((h) => !hiddenCountries.has(h.country));
  const isEmpty =
    holidays.length === 0 &&
    day.leave.length === 0 &&
    events.length === 0 &&
    (!timelineOn || (markers.length === 0 && milestones.length === 0));

  return (
    <div className="space-y-4 rounded-[10px] border border-[var(--border-2)] bg-white p-4 lg:w-80 lg:shrink-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-1)]">{heading}</h3>
        {day.isToday ? (
          <span className="rounded-full bg-[var(--brand-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-700)]">
            Today
          </span>
        ) : null}
      </div>

      {isEmpty ? (
        <p className="text-sm text-[var(--text-3)]">Nothing scheduled.</p>
      ) : null}

      {/* Deliverables (timeline blocks active this week) */}
      {timelineOn && markers.length > 0 ? (
        <div className="space-y-1.5">
          <p className="widget-data-label">Deliverables this week</p>
          {markers.map((b) => {
            const tone = blockTone(b.color);
            return (
              <div key={b.id} className="rounded-[6px] border border-[var(--border-2)] p-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                  <span className="truncate text-xs font-semibold text-[var(--text-1)]">
                    {b.clientName}
                  </span>
                  <span className="ml-auto text-[10px] font-medium text-[var(--text-3)]">
                    {b.progress}%
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[var(--text-2)]">{b.name}</p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div className={cn("h-full rounded-full", tone.dot)} style={{ width: `${b.progress}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Milestones */}
      {timelineOn && milestones.length > 0 ? (
        <div className="space-y-1.5">
          <p className="widget-data-label">Milestones</p>
          {milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5 text-xs text-[var(--text-1)]">
              <FlagIcon className="h-3.5 w-3.5 shrink-0 text-[var(--brand-500)]" />
              <span className="truncate font-medium">{m.name}</span>
              <span className="ml-auto truncate text-[10px] text-[var(--text-3)]">{m.clientName}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Holidays */}
      {holidays.length > 0 ? (
        <div className="space-y-1.5">
          <p className="widget-data-label">Holidays</p>
          {holidays.map((h, i) => (
            <div key={`${h.country}-${i}`} className="flex items-center gap-1.5 text-xs text-sky-700">
              <GlobeAltIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{h.name}</span>
              <span className="ml-auto text-[10px] font-medium text-[var(--text-4)]">{h.country}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* On leave */}
      {day.leave.length > 0 ? (
        <div className="space-y-1.5">
          <p className="widget-data-label">On leave</p>
          {day.leave.map((bar) => {
            const c = LEAVE_COLOURS[bar.type];
            return (
              <div
                key={bar.leaveRequestId + bar.userId}
                className="flex items-center gap-1.5 text-xs text-[var(--text-1)]"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", c.dot)} />
                <span className="truncate font-medium">{bar.userName}</span>
                <span className="ml-auto text-[10px] text-[var(--text-3)]">
                  {c.label}
                  {bar.isHalfDayHere ? " · ½ day" : ""}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Meetings (overlaid Google Calendars) */}
      {events.length > 0 ? (
        <div className="space-y-1.5">
          <p className="widget-data-label">Meetings</p>
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-1.5 text-xs text-[var(--text-1)]">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", memberDot(ev.userId))} />
              <span className="truncate">{ev.summary}</span>
              <span className="ml-auto shrink-0 text-[10px] text-[var(--text-3)]">{eventTime(ev)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
