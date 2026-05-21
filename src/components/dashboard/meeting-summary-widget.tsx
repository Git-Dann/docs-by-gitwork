"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCalendarEvents, generateMeetingSummary } from "@/lib/api";
import type { CalendarEvent } from "@/lib/api";
import type { WidgetSize } from "@/components/app-overview";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  if (!iso.includes("T")) return "All day";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

export default function MeetingSummaryWidget({ size }: { size: WidgetSize }) {
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["integrations", "calendar"],
    queryFn: getCalendarEvents,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  async function handleSummarise(event: CalendarEvent) {
    if (summaries[event.id]) {
      setSelected(event.id);
      return;
    }
    setGenerating(event.id);
    setSelected(event.id);
    try {
      const res = await generateMeetingSummary({
        eventId: event.id,
        eventTitle: event.summary,
        eventDate: event.start,
        attendees: event.attendees,
      });
      setSummaries((prev) => ({ ...prev, [event.id]: res.summary }));
    } catch {
      setSummaries((prev) => ({ ...prev, [event.id]: "Failed to generate summary. Check your AI and Google settings." }));
    } finally {
      setGenerating(null);
    }
  }

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  if (!data?.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-1)]">
          <svg className="h-5 w-5 text-[var(--text-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <p className="text-xs font-medium text-[var(--text-2)]">Connect Google Calendar for meeting summaries</p>
        <Link href="/app/settings" className="text-[11px] text-[var(--accent)] hover:underline">
          Connect in Settings →
        </Link>
      </div>
    );
  }

  const events = data.events ?? [];
  const activeSummary = selected ? summaries[selected] : null;
  const activeEvent = selected ? events.find((e) => e.id === selected) : null;

  const displayCount = size.cols >= 2 && !selected ? (size.rows >= 2 ? 6 : 3) : 4;

  return (
    <div className="flex h-full gap-3 p-1">
      {/* Event list */}
      <div className={`flex flex-col gap-1 overflow-y-auto ${selected && size.cols >= 2 ? "w-52 shrink-0" : "flex-1"}`}>
        <p className="mb-0.5 text-[11px] font-semibold text-[var(--text-2)]">Meetings</p>
        {events.length === 0 && (
          <p className="text-[11px] text-[var(--text-3)]">No upcoming events</p>
        )}
        {events.slice(0, displayCount).map((ev) => (
          <div
            key={ev.id}
            className={`cursor-pointer rounded-[6px] border p-2 transition-colors ${selected === ev.id ? "border-[var(--accent)] bg-[var(--surface-1)]" : "border-[var(--border-1)] hover:bg-[var(--surface-1)]"}`}
            onClick={() => setSelected(ev.id === selected ? null : ev.id)}
          >
            <p className="truncate text-xs font-medium text-[var(--text-1)]">{ev.summary}</p>
            <p className="text-[10px] text-[var(--text-3)]">
              {formatDate(ev.start)} {formatTime(ev.start)}
            </p>
            {!summaries[ev.id] && (
              <button
                onClick={(e) => { e.stopPropagation(); void handleSummarise(ev); }}
                disabled={generating === ev.id}
                className="mt-1 text-[10px] font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                {generating === ev.id ? "Generating…" : "Summarise →"}
              </button>
            )}
            {summaries[ev.id] && (
              <span className="mt-0.5 text-[10px] text-green-600">✓ Summary ready</span>
            )}
          </div>
        ))}
      </div>

      {/* Summary panel */}
      {selected && activeEvent && size.cols >= 2 && (
        <div className="flex flex-1 flex-col gap-2 overflow-hidden rounded-[8px] bg-[var(--surface-1)] p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--text-1)]">{activeEvent.summary}</p>
              <p className="text-[10px] text-[var(--text-3)]">{formatDate(activeEvent.start)} {formatTime(activeEvent.start)}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {generating === selected ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-[11px] text-[var(--text-3)]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
              Generating summary…
            </div>
          ) : activeSummary ? (
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-2)]">
              {activeSummary}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <button
                onClick={() => void handleSummarise(activeEvent)}
                className="rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Generate Summary
              </button>
              <p className="text-[10px] text-[var(--text-3)]">Uses AI + related emails/Slack</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
