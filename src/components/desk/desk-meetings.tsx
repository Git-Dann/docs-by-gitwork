"use client";

import Link from "next/link";
import { useDeskCalendar, useDeskActionItems } from "@/hooks/use-desk";
import type { CalendarEvent } from "@/lib/api";
import { EditorialRow, DeskEmpty, DeskSkeleton, DeskConnectGoogle } from "./desk-shared";

/** MEETINGS tab — today's calendar (reused per-user Google read) + my open
 *  Scribe action items, as editorial rows. */
export function DeskMeetings() {
  const calendar = useDeskCalendar();
  const actionItems = useDeskActionItems();

  const now = new Date();
  const todaysEvents = (calendar.data?.events ?? []).filter(
    (ev) => ev.start && new Date(ev.start).toDateString() === now.toDateString(),
  );
  const items = actionItems.data?.items ?? [];

  return (
    <div>
      <EditorialRow
        title="Today's meetings"
        count={calendar.data?.connected ? todaysEvents.length : undefined}
        caption="From your Google Calendar."
        first
      >
        {calendar.isPending ? (
          <DeskSkeleton />
        ) : calendar.data && !calendar.data.connected ? (
          <DeskConnectGoogle what="your calendar" />
        ) : todaysEvents.length === 0 ? (
          <DeskEmpty>No meetings today.</DeskEmpty>
        ) : (
          <div className="space-y-2">
            {todaysEvents.map((ev) => (
              <MeetingRow key={ev.id} ev={ev} past={new Date(ev.end || ev.start) < now} />
            ))}
          </div>
        )}
      </EditorialRow>

      <EditorialRow
        title="Action items"
        count={items.length}
        caption="Open follow-ups from meetings you were in."
      >
        {actionItems.isPending ? (
          <DeskSkeleton />
        ) : items.length === 0 ? (
          <DeskEmpty>Nothing outstanding from your meetings.</DeskEmpty>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => {
              const inner = (
                <>
                  <span
                    className="shrink-0 text-[11px] text-[var(--text-4)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--text-1)]">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--text-4)]">
                      {item.meetingTitle}
                      {item.hasTask ? " · on board" : ""}
                    </span>
                  </span>
                </>
              );
              const cls =
                "flex items-start gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3 transition";
              return item.clientSlug ? (
                <Link
                  key={item.id}
                  href={`/app/portal/${item.clientSlug}/tasks`}
                  className={`${cls} hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]`}
                >
                  {inner}
                </Link>
              ) : (
                <div key={item.id} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </EditorialRow>
    </div>
  );
}

function MeetingRow({ ev, past }: { ev: CalendarEvent; past: boolean }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3 ${
        past ? "opacity-55" : ""
      }`}
    >
      <span
        className="shrink-0 pt-0.5 text-[11px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {new Date(ev.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-1)]">{ev.summary}</p>
        {ev.attendees.length > 0 ? (
          <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">
            {ev.attendees.slice(0, 3).join(", ")}
            {ev.attendees.length > 3 ? ` +${ev.attendees.length - 3}` : ""}
          </p>
        ) : null}
      </div>
      {ev.meetLink && !past ? (
        <a
          href={ev.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-medium text-[var(--brand-700)] hover:underline"
        >
          Join →
        </a>
      ) : null}
    </div>
  );
}
