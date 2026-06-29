"use client";

import Link from "next/link";
import { SparklesIcon, VideoCameraIcon } from "@heroicons/react/24/solid";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCalendarEvents, generateMeetingSummary, getIntegrations } from "@/lib/api";
import type { CalendarEvent, SlackChannel } from "@/lib/api";
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

interface CachedSummary {
  summary: string;
  cached: boolean;
  cachedAt?: string;
  generatedBy?: string | null;
}

export default function CalendarWidget({ size, index }: { size: WidgetSize; index: number }) {
  const num = String(index).padStart(2, "0");
  const [summaries, setSummaries] = useState<Record<string, CachedSummary>>({});
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

  async function handleSummarise(event: CalendarEvent, opts?: { force?: boolean }) {
    if (!opts?.force && summaries[event.id]) {
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
        force: opts?.force,
      });
      setSummaries((prev) => ({
        ...prev,
        [event.id]: {
          summary: res.summary,
          cached: res.cached,
          cachedAt: res.cachedAt,
          generatedBy: res.generatedBy ?? null,
        },
      }));
    } catch {
      setSummaries((prev) => ({
        ...prev,
        [event.id]: {
          summary: "Failed to generate summary. Check your AI and Google settings.",
          cached: false,
        },
      }));
    } finally {
      setGenerating(null);
    }
  }

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
            <p className="truncate text-center text-xs text-[var(--text-3)]">{nextEvent.summary}</p>
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
  const activeSummary = selected ? summaries[selected] : null;
  const activeEvent = selected ? events.find((e) => e.id === selected) : null;

  // ── md / lg: full calendar + meeting prep ───────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
          {`${num} // CALENDAR`}
        </span>
        <span className="text-xs text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>next 14 days</span>
      </div>

      {/* Body: two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: event list */}
        <div className="flex w-56 shrink-0 flex-col border-r border-[rgba(0,0,0,0.08)]">
          <div className="border-b border-[rgba(0,0,0,0.06)] px-4 py-2">
            <p className="text-xs font-medium text-[var(--text-3)]">Upcoming</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {events.length === 0 ? (
              <div className="flex h-full items-center justify-center p-4 text-center">
                <p className="text-xs text-[var(--text-4)]">No upcoming events</p>
              </div>
            ) : (
              events.map((ev) => (
                <button
                  key={ev.id}
                  className={`w-full border-b border-[rgba(0,0,0,0.06)] px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-brand)] ${selected === ev.id ? "bg-[var(--surface-brand)]" : ""}`}
                  onClick={() => setSelected(ev.id === selected ? null : ev.id)}
                >
                  <p className="truncate text-sm font-medium text-[var(--text-1)]">{ev.summary}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                    {formatDate(ev.start)} · {formatTime(ev.start)}
                  </p>
                  {summaries[ev.id] ? (
                    <span className="mt-0.5 block text-xs font-medium text-[var(--success-500)]">✓ Ready</span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(ev.id);
                      }}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      <SparklesIcon className="h-3 w-3" /> Summarise
                    </button>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right panel: summary / empty state */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selected || !activeEvent ? (
            /* Nothing selected */
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
              <SparklesIcon className="h-6 w-6 text-[var(--text-4)]" />
              <p className="text-xs text-[var(--text-3)]">Select a meeting to prep</p>
              <p className="text-xs text-[var(--text-4)]">AI summary · emails · Slack</p>
            </div>
          ) : generating === selected ? (
            /* Generating */
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
              <p className="text-xs text-[var(--text-3)]">Generating summary…</p>
            </div>
          ) : activeSummary ? (
            /* Summary ready */
            <div className="flex h-full flex-col overflow-hidden">
              {/* Panel header */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-1)]">{activeEvent.summary}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                    {formatDate(activeEvent.start)} · {formatTime(activeEvent.start)}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded-[6px] p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              {/* Summary body */}
              <div className="flex-1 overflow-y-auto p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-1)]">
                  {activeSummary.summary}
                </p>
              </div>
              {/* Footer */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] px-4 py-2.5">
                <span className="text-xs text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                  {activeSummary.cached
                    ? `Cached${activeSummary.generatedBy ? ` · ${activeSummary.generatedBy}` : ""}`
                    : "Just generated"}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSummarise(activeEvent, { force: true })}
                  className="inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--surface-1)]"
                >
                  <SparklesIcon className="h-3 w-3" />
                  Regenerate
                </button>
              </div>
            </div>
          ) : (
            /* No summary yet: channel picker + generate button */
            <div className="flex h-full flex-col overflow-hidden">
              {/* Panel header */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-1)]">{activeEvent.summary}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                    {formatDate(activeEvent.start)} · {formatTime(activeEvent.start)}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded-[6px] p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              {/* Picker body */}
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                {slackChannels.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-[var(--text-3)]">Slack channels</p>
                    <div className="flex flex-wrap gap-1.5">
                      {slackChannels.map((ch) => (
                        <button
                          key={ch.id}
                          onClick={() => toggleChannel(ch.id)}
                          className={`inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-xs font-medium transition-colors ${
                            selectedChannels.has(ch.id)
                              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                              : "border-[rgba(0,0,0,0.12)] text-[var(--text-3)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          }`}
                        >
                          #{ch.name}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--text-4)]">
                      {selectedChannels.size === 0 ? "All channels will be searched" : `${selectedChannels.size} selected`}
                    </p>
                  </div>
                )}

                <div className="mt-auto">
                  <button
                    onClick={() => void handleSummarise(activeEvent)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    Generate Summary
                  </button>
                  <p className="mt-2 text-center text-xs text-[var(--text-4)]">Uses AI · emails · Slack</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
