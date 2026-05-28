"use client";

import Link from "next/link";
import { CalendarDaysIcon } from "@heroicons/react/24/solid";
import { useQuery } from "@tanstack/react-query";
import { getCalendarEvents } from "@/lib/api";
import type { CalendarEvent } from "@/lib/api";
import type { WidgetSize } from "@/components/app-overview";

function formatEventTime(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
    const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
    const today = new Date();
    const isToday = s.toDateString() === today.toDateString();
    if (isToday) {
      return `Today ${s.toLocaleTimeString("en-GB", timeOpts)} – ${e.toLocaleTimeString("en-GB", timeOpts)}`;
    }
    return `${s.toLocaleDateString("en-GB", dateOpts)}, ${s.toLocaleTimeString("en-GB", timeOpts)}`;
  } catch {
    return start;
  }
}

function isAllDay(start: string): boolean {
  return !start.includes("T");
}

function EventRow({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <div className="rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] p-2">
      <p className={`font-medium text-[var(--text-1)] ${compact ? "truncate text-xs" : "text-xs"}`}>
        {event.summary}
      </p>
      {!isAllDay(event.start) && (
        <p className="mt-0.5 text-[10px] text-[var(--text-3)]">{formatEventTime(event.start, event.end)}</p>
      )}
      {!compact && event.attendees.length > 0 && (
        <p className="mt-0.5 text-[10px] text-[var(--text-3)]">
          {event.attendees.slice(0, 3).join(", ")}
          {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
        </p>
      )}
      {event.meetLink && (
        <a
          href={event.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--surface-2)]"
          onClick={(e) => e.stopPropagation()}
        >
          Join →
        </a>
      )}
    </div>
  );
}

export default function CalendarWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useQuery({
    queryKey: ["integrations", "calendar"],
    queryFn: getCalendarEvents,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  if (!data?.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50">
          <CalendarDaysIcon className="h-5 w-5 text-teal-400" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--text-1)]">Calendar not connected</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
            Sign out and back in to grant Calendar access
          </p>
        </div>
        <Link
          href="/api/auth/signout"
          className="rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Re-connect via Google
        </Link>
      </div>
    );
  }

  const events = data.events ?? [];
  const displayCount = size === "lg" ? 8 : size === "md" ? 4 : 2;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
          <CalendarDaysIcon className="h-2.5 w-2.5" />
          Calendar
        </span>
        <span className="text-[11px] text-[var(--text-3)]">next 14 days</span>
      </div>

      {/* Events */}
      <div className="mt-2 flex-1 space-y-1.5 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-[var(--text-3)]">
            No upcoming events
          </div>
        ) : (
          events.slice(0, displayCount).map((ev) => (
            <EventRow key={ev.id} event={ev} compact={size === "sm"} />
          ))
        )}
      </div>
    </div>
  );
}
