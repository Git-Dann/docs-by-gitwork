"use client";

import Link from "next/link";
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

function EventCard({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <div className="rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] p-2">
      <p className={`font-medium text-[var(--text-1)] ${compact ? "truncate text-xs" : "text-sm"}`}>
        {event.summary}
      </p>
      {!isAllDay(event.start) && (
        <p className="text-[10px] text-[var(--text-3)]">{formatEventTime(event.start, event.end)}</p>
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
          className="mt-1 inline-flex items-center gap-1 rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
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
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  if (!data?.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-1)]">
          <svg className="h-5 w-5 text-[var(--text-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-xs font-medium text-[var(--text-2)]">Calendar not connected</p>
        <Link href="/app/settings" className="text-[11px] text-[var(--accent)] hover:underline">
          Connect in Settings →
        </Link>
      </div>
    );
  }

  const events = data.events ?? [];
  const displayCount = size.rows >= 3 ? 8 : size.rows >= 2 ? 4 : 2;

  return (
    <div className="flex h-full flex-col gap-2 p-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-2)]">Calendar</span>
        <span className="text-[11px] text-[var(--text-3)]">next 14 days</span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-[var(--text-3)]">
          No upcoming events
        </div>
      ) : (
        <div className="flex-1 space-y-1.5 overflow-y-auto">
          {events.slice(0, displayCount).map((ev) => (
            <EventCard key={ev.id} event={ev} compact={size.cols < 2} />
          ))}
        </div>
      )}
    </div>
  );
}
