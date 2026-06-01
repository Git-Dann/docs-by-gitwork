"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { useBackstageCalendar } from "@/hooks/use-backstage";
import { cn } from "@/lib/format";
import type { CalendarDay, CalendarLeaveBar, LeaveType } from "@/types/backstage";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

export function CalendarTab() {
  const today = new Date();
  const [{ year, month }, setView] = useState<{ year: number; month: number }>({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
  });
  const cal = useBackstageCalendar(year, month);

  const monthLabel = MONTH_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-1)]">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setView(prevMonth(year, month))}
            className="rounded-[6px] border border-[var(--border-2)] bg-white p-1.5 text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
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
            className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setView(nextMonth(year, month))}
            className="rounded-[6px] border border-[var(--border-2)] bg-white p-1.5 text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
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

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-[10px] border border-[var(--border-2)] bg-[var(--border-2)]">
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
        <div className="grid h-[480px] place-items-center rounded-b-[10px] border border-t-0 border-[var(--border-2)] bg-white text-sm text-[var(--text-3)]">
          Loading…
        </div>
      ) : cal.isError ? (
        <div className="grid h-[480px] place-items-center rounded-b-[10px] border border-t-0 border-[var(--border-2)] bg-white text-sm text-red-600">
          {(cal.error as Error)?.message ?? "Failed to load calendar"}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-[10px] border border-t-0 border-[var(--border-2)] bg-[var(--border-2)]">
          {cal.data?.weeks.flat().map((day) => (
            <DayCell key={day.date} day={day} />
          ))}
        </div>
      )}

      {/* Footer notes */}
      <p className="text-xs text-[var(--text-4)]">
        Approved leave only. Half-days show as half-filled pills. Public/religious holidays are
        based on each member&apos;s configured country.
      </p>
    </div>
  );
}

function DayCell({ day }: { day: CalendarDay }) {
  const date = new Date(day.date + "T00:00:00Z");
  const dayNum = date.getUTCDate();
  const MAX_PILLS = 3;
  const overflow = day.leave.length > MAX_PILLS ? day.leave.length - MAX_PILLS : 0;

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
        {day.holidays.length > 0 ? (
          <span
            className="inline-flex items-center gap-0.5 truncate rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
            title={day.holidays.map((h) => `${h.country}: ${h.name}`).join(" · ")}
          >
            <GlobeAltIcon className="h-3 w-3 shrink-0" />
            {day.holidays.map((h) => h.country).join(" ")}
          </span>
        ) : null}
      </div>

      {/* Holiday names (first one) */}
      {day.holidays.length > 0 ? (
        <p
          className="mt-1 truncate text-[10px] text-sky-700"
          title={day.holidays.map((h) => h.name).join(" · ")}
        >
          {day.holidays[0].name}
          {day.holidays.length > 1 ? ` +${day.holidays.length - 1}` : ""}
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
