"use client";

import Link from "next/link";
import { useDeskCalendar, useDeskActionItems } from "@/hooks/use-desk";
import type { CalendarEvent } from "@/lib/api";
import {
  DeskSectionLabel,
  DeskEmpty,
  DeskSkeleton,
  DeskConnectGoogle,
} from "./desk-shared";

/** MEETINGS tab — today's calendar (reused per-user Google read) + my open
 *  Scribe action items (the one Desk-specific query). */
export function DeskMeetings() {
  const calendar = useDeskCalendar();
  const actionItems = useDeskActionItems();

  const now = new Date();
  const todaysEvents = (calendar.data?.events ?? []).filter((ev) => {
    if (!ev.start) return false;
    return new Date(ev.start).toDateString() === now.toDateString();
  });

  const items = actionItems.data?.items ?? [];

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Today's calendar */}
      <div>
        <DeskSectionLabel count={todaysEvents.length}>Today&apos;s meetings</DeskSectionLabel>
        {calendar.isPending ? (
          <DeskSkeleton />
        ) : calendar.data && !calendar.data.connected ? (
          <DeskConnectGoogle what="your calendar" />
        ) : todaysEvents.length === 0 ? (
          <DeskEmpty>No meetings today.</DeskEmpty>
        ) : (
          <div className="space-y-1.5">
            {todaysEvents.map((ev) => (
              <MeetingRow key={ev.id} ev={ev} past={new Date(ev.end || ev.start) < now} />
            ))}
          </div>
        )}
      </div>

      {/* My action items */}
      <div>
        <DeskSectionLabel count={items.length}>My action items</DeskSectionLabel>
        {actionItems.isPending ? (
          <DeskSkeleton />
        ) : items.length === 0 ? (
          <DeskEmpty>Nothing outstanding from your meetings.</DeskEmpty>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => {
              const inner = (
                <>
                  <p className="text-sm font-medium text-[var(--text-1)]">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">
                    {item.meetingTitle}
                    {item.hasTask ? " · on board" : ""}
                  </p>
                </>
              );
              return item.clientSlug ? (
                <Link
                  key={item.id}
                  href={`/app/portal/${item.clientSlug}/tasks`}
                  className="block rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 transition hover:bg-[var(--surface-1)]"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={item.id}
                  className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingRow({ ev, past }: { ev: CalendarEvent; past: boolean }) {
  return (
    <div
      className={`rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2.5 ${
        past ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-[11px] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {new Date(ev.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </p>
        {ev.meetLink && !past ? (
          <a
            href={ev.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-[var(--brand-700)] hover:underline"
          >
            Join →
          </a>
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-sm font-medium text-[var(--text-1)]">{ev.summary}</p>
      {ev.attendees.length > 0 ? (
        <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">
          {ev.attendees.slice(0, 3).join(", ")}
          {ev.attendees.length > 3 ? ` +${ev.attendees.length - 3}` : ""}
        </p>
      ) : null}
    </div>
  );
}
