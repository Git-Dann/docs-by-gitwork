"use client";

import Link from "next/link";
import { VideoCameraIcon } from "@heroicons/react/24/solid";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/format";
import { getCalendarEvents } from "@/lib/api";
import type { CalendarEvent } from "@/lib/api";
import type { WidgetSize } from "@/components/app-overview";

function formatTime(iso: string): string {
  if (!iso.includes("T")) return "All day";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function formatDate(iso: string): string {
  try {
    const eventDay = iso.includes("T") ? iso.slice(0, 10) : iso;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    if (eventDay === todayStr) return "Today";
    if (eventDay === tomorrowStr) return "Tomorrow";

    return new Date(eventDay).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function MeetingJoinLink({ href, compact = false }: { href: string | null; compact?: boolean }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 rounded-[5px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] hover:text-[var(--brand-800)]",
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
      )}
    >
      <VideoCameraIcon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      Join
    </a>
  );
}

export default function CalendarWidget({ size, index }: { size: WidgetSize; index: number }) {
  const num = String(index).padStart(2, "0");

  const { data, isLoading } = useQuery({
    queryKey: ["integrations", "calendar"],
    queryFn: getCalendarEvents,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  // ── sm size: mini view ──────────────────────────────────────────────────────
  if (size === "sm") {
    const events = data?.events ?? [];
    const nextEvent = events[0];
    return (
      <div className="flex h-full flex-col">
        {/* Widget header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
            {`${num} // CALENDAR`}
          </span>
        </div>
        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="text-3xl tabular-nums text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>{events.length}</p>
            <p className="text-xs text-[var(--text-3)]">events upcoming</p>
          </div>
          {nextEvent && (
            <div className="text-center">
              <p className="truncate text-xs text-[var(--text-3)]">{nextEvent.summary}</p>
              <MeetingJoinLink href={nextEvent.meetLink} compact />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Not connected ───────────────────────────────────────────────────────────
  if (!data?.connected) {
    return (
      <div className="flex h-full flex-col">
        {/* Widget header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
            {`${num} // CALENDAR`}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50">
            <VideoCameraIcon className="h-5 w-5 text-teal-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-1)]">Calendar not connected</p>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">
              Sign out and back in to grant Calendar access
            </p>
          </div>
          <Link
            href="/api/auth/signout"
            className="rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Re-connect via Google
          </Link>
        </div>
      </div>
    );
  }

  const events = data.events ?? [];

  // Group events under day headers, preserving the (already sorted) order.
  const groups: { label: string; events: CalendarEvent[] }[] = [];
  for (const ev of events) {
    const label = formatDate(ev.start);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.events.push(ev);
    else groups.push({ label, events: [ev] });
  }

  // ── md / lg: single-column timeline ─────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
          {`${num} // CALENDAR`}
        </span>
        <span className="text-xs text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>next 14 days</span>
      </div>

      {/* Body: timeline list */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-center">
            <p className="text-xs text-[var(--text-4)]">No upcoming events</p>
          </div>
        ) : (
          <div className="px-4 py-3">
            {groups.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                {/* Day header */}
                <div className="sticky top-0 z-[1] -mx-4 bg-[var(--surface-card,var(--surface-0))]/90 px-4 py-1.5 backdrop-blur">
                  <span
                    className="text-[10px] font-medium uppercase tracking-[1.4px] text-[var(--text-4)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {group.label}
                  </span>
                </div>
                {/* Events for the day, connected by a timeline rail */}
                <ul className="relative ml-[3.25rem] border-l border-[rgba(0,0,0,0.08)]">
                  {group.events.map((ev) => (
                    <li key={ev.id} className="relative py-2.5">
                      {/* Time on the rail's left */}
                      <span
                        className="absolute -left-[3.75rem] top-3 w-11 text-right text-xs tabular-nums text-[var(--text-3)]"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {formatTime(ev.start)}
                      </span>
                      {/* Node dot */}
                      <span className="absolute -left-[5px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-0)] bg-[var(--accent)]" />
                      {/* Content — title left, Join pushed to the far right and
                          aligned with the title's first line */}
                      <div className="flex items-start justify-between gap-3 pl-4">
                        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-[var(--text-1)]">{ev.summary}</p>
                        <div className="shrink-0">
                          <MeetingJoinLink href={ev.meetLink} compact />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
