"use client";

import { useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeAltIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import {
  useBackstageCalendar,
  useCalendarConnections,
  useTeamCalendarEvents,
} from "@/hooks/use-backstage";
import { BackstagePanel } from "@/components/backstage/panel";
import { cn } from "@/lib/format";
import type {
  CalendarDay,
  CalendarLeaveBar,
  LeaveType,
  TeamCalendarEvent,
} from "@/types/backstage";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Viewer's hidden-holiday-country preference. Workspace-wide which countries
// EXIST (UK + PK by default, configured server-side); this just lets each
// person hide ones they don't care about on their own view.
const HIDDEN_COUNTRIES_KEY = "backstage:calendar:hiddenHolidayCountries";

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
    bar: "bg-zinc-100 text-zinc-700 border-zinc-300",
    dot: "bg-zinc-500",
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

export function CalendarTab({ number = "01" }: { number?: string }) {
  const today = new Date();
  const [{ year, month }, setView] = useState<{ year: number; month: number }>({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
  });
  const cal = useBackstageCalendar(year, month);

  const [hiddenCountries, setHiddenCountries] = useState<Set<string>>(readHiddenCountries);

  const holidayCountries = cal.data?.holidayCountries ?? [];

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

  // ── Google Calendar overlay ──
  const connections = useCalendarConnections();
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(readSelectedCalendars);
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

  const connectionMembers = connections.data?.members ?? [];

  const monthLabel = MONTH_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <BackstagePanel
      number={number}
      title="TEAM CALENDAR"
      bodyClassName="space-y-4 p-4"
      action={
        <>
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
            onClick={() => setView(prevMonth(year, month))}
            className="rounded-[6px] border border-[var(--border-2)] bg-white p-1 text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              setView({
                year: today.getUTCFullYear(),
                month: today.getUTCMonth() + 1,
              })
            }
            className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setView(nextMonth(year, month))}
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
          </div>
        </div>

        {/* Calendar box — weekday header + grid joined into a single bordered card. */}
        <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
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
            {cal.data?.weeks.flat().map((day) => (
              <DayCell
                key={day.date}
                day={day}
                hiddenCountries={hiddenCountries}
                events={eventsByDay.get(day.date) ?? []}
              />
            ))}
          </div>
        )}
      </div>

        {/* Footer notes */}
        <p className="text-xs text-[var(--text-4)]">
          Approved leave only. Half-days show as half-filled pills. Public/religious holidays cover{" "}
          {holidayCountries.length > 0
            ? holidayCountries.map(countryName).join(" + ")
            : "your configured countries"}{" "}
          — use the Holidays menu to show or hide each.
        </p>
    </BackstagePanel>
  );
}

function DayCell({
  day,
  hiddenCountries,
  events,
}: {
  day: CalendarDay;
  hiddenCountries: Set<string>;
  events: TeamCalendarEvent[];
}) {
  const date = new Date(day.date + "T00:00:00Z");
  const dayNum = date.getUTCDate();
  const MAX_PILLS = 3;
  const overflow = day.leave.length > MAX_PILLS ? day.leave.length - MAX_PILLS : 0;
  const holidays = day.holidays.filter((h) => !hiddenCountries.has(h.country));
  const MAX_EVENTS = 2;
  const eventOverflow = events.length > MAX_EVENTS ? events.length - MAX_EVENTS : 0;

  return (
    <div
      className={cn(
        "min-h-[100px] bg-white p-1.5 transition",
        !day.isCurrentMonth && "bg-[var(--surface-1)]",
        day.isWeekend && day.isCurrentMonth && "bg-[#FAFAF9]",
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
    </div>
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
