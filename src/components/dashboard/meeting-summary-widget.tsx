"use client";

import Link from "next/link";
import { VideoCameraIcon, SparklesIcon } from "@heroicons/react/24/solid";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCalendarEvents, generateMeetingSummary, getIntegrations } from "@/lib/api";
import type { CalendarEvent, SlackChannel } from "@/lib/api";
import type { WidgetSize } from "@/components/app-overview";

function formatDate(iso: string): string {
  try {
    // Compare calendar days, not timestamps, so "08:00 tomorrow" doesn't
    // show as "Today" when the current time is past 08:00.
    const eventDay = iso.includes("T") ? iso.slice(0, 10) : iso;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (eventDay === todayStr) return "Today";
    if (eventDay === tomorrowStr) return "Tomorrow";
    if (eventDay === yesterdayStr) return "Yesterday";

    return new Date(eventDay).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
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
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["integrations", "calendar"],
    queryFn: getCalendarEvents,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const { data: integrations } = useQuery({
    queryKey: ["integrations", "settings"],
    queryFn: getIntegrations,
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

  const slackChannels = (integrations?.slackChannels ?? []) as SlackChannel[];

  function toggleChannel(id: string) {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSummarise(event: CalendarEvent) {
    if (summaries[event.id]) {
      setSelected(event.id);
      return;
    }
    setGenerating(event.id);
    setSelected(event.id);
    try {
      const channelIds = selectedChannels.size > 0 ? Array.from(selectedChannels) : undefined;
      const res = await generateMeetingSummary({
        eventId: event.id,
        eventTitle: event.summary,
        eventDate: event.start,
        attendees: event.attendees,
        channelIds,
      });
      setSummaries((prev) => ({ ...prev, [event.id]: res.summary }));
    } catch {
      setSummaries((prev) => ({
        ...prev,
        [event.id]: "Failed to generate summary. Check your AI and Google settings.",
      }));
    } finally {
      setGenerating(null);
    }
  }

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  if (!data?.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50">
          <VideoCameraIcon className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--text-1)]">Meeting summaries</p>
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
  const activeSummary = selected ? summaries[selected] : null;
  const activeEvent = selected ? events.find((e) => e.id === selected) : null;
  const displayCount = size !== "sm" && !selected ? 6 : 4;

  return (
    <div className="flex h-full flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
          <VideoCameraIcon className="h-2.5 w-2.5" />
          Meetings
        </span>
        <span className="text-[11px] text-[var(--text-3)]">AI prep</span>
      </div>

      <div className="mt-2 flex flex-1 gap-3 overflow-hidden">
        {/* Event list */}
        <div
          className={`flex flex-col gap-1 overflow-y-auto ${selected && size !== "sm" ? "w-52 shrink-0" : "flex-1"}`}
        >
          {events.length === 0 ? (
            <p className="text-[11px] text-[var(--text-3)]">No upcoming events</p>
          ) : (
            events.slice(0, displayCount).map((ev) => (
              <div
                key={ev.id}
                className={`cursor-pointer rounded-[6px] border p-2 transition-colors ${
                  selected === ev.id
                    ? "border-[var(--accent)] bg-blue-50"
                    : "border-[var(--border-1)] hover:bg-[var(--surface-1)]"
                }`}
                onClick={() => setSelected(ev.id === selected ? null : ev.id)}
              >
                <p className="truncate text-xs font-medium text-[var(--text-1)]">{ev.summary}</p>
                <p className="text-[10px] text-[var(--text-3)]">
                  {formatDate(ev.start)} · {formatTime(ev.start)}
                </p>
                {!summaries[ev.id] ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(ev.id); // open panel so channel picker is visible
                    }}
                    className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--accent)] hover:underline"
                  >
                    <SparklesIcon className="h-2.5 w-2.5" />
                    Summarise
                  </button>
                ) : (
                  <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                    <SparklesIcon className="h-2.5 w-2.5" />
                    Ready
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Summary panel */}
        {selected && activeEvent && size !== "sm" && (
          <div className="flex flex-1 flex-col gap-2 overflow-hidden rounded-[6px] bg-[var(--surface-1)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--text-1)]">{activeEvent.summary}</p>
                <p className="text-[10px] text-[var(--text-3)]">
                  {formatDate(activeEvent.start)} · {formatTime(activeEvent.start)}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 rounded-[4px] p-0.5 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
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
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                {/* Slack channel picker */}
                {slackChannels.length > 0 && (
                  <div className="w-full space-y-1.5">
                    <p className="text-[10px] font-medium text-[var(--text-3)]">Slack channels to include</p>
                    <div className="flex flex-wrap gap-1.5">
                      {slackChannels.map((ch) => (
                        <button
                          key={ch.id}
                          onClick={() => toggleChannel(ch.id)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            selectedChannels.has(ch.id)
                              ? "border-[var(--accent)] bg-blue-50 text-[var(--accent)]"
                              : "border-[var(--border-2)] text-[var(--text-3)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          }`}
                        >
                          #{ch.name}
                        </button>
                      ))}
                    </div>
                    {selectedChannels.size === 0 && (
                      <p className="text-[10px] text-[var(--text-4)]">No channels selected — all saved channels will be searched</p>
                    )}
                  </div>
                )}
                <button
                  onClick={() => void handleSummarise(activeEvent)}
                  className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  Generate Summary
                </button>
                <p className="text-[10px] text-[var(--text-3)]">Uses AI + emails + Slack</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
