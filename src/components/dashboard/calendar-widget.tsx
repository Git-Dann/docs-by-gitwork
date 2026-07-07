"use client";

import Link from "next/link";
import { SparklesIcon, VideoCameraIcon } from "@heroicons/react/24/solid";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/format";
import { getCalendarEvents, generateMeetingSummary, getIntegrations } from "@/lib/api";
import type { CalendarEvent, SlackChannel } from "@/lib/api";
import type { WidgetSize } from "@/components/app-overview";
import { Modal } from "@/components/ui/modal";

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
  const activeSummary = selected ? summaries[selected] : null;
  const activeEvent = selected ? events.find((e) => e.id === selected) : null;

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
                  {group.events.map((ev) => {
                    const ready = Boolean(summaries[ev.id]);
                    return (
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
                        {/* Content */}
                        <div className="pl-4">
                          <p className="text-sm font-medium leading-snug text-[var(--text-1)]">{ev.summary}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <MeetingJoinLink href={ev.meetLink} compact />
                            <button
                              type="button"
                              onClick={() => setSelected(ev.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] transition-colors hover:underline"
                            >
                              {ready ? (
                                <>
                                  <SparklesIcon className="h-3 w-3" />
                                  View prep
                                </>
                              ) : (
                                <>
                                  <SparklesIcon className="h-3 w-3" />
                                  Summarise
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Meeting prep modal */}
      <Modal
        open={Boolean(selected && activeEvent)}
        onClose={() => setSelected(null)}
        panelClassName="w-full max-w-lg"
        labelledById="calendar-prep-title"
      >
        {activeEvent && (
          <div className="flex max-h-[80vh] flex-col">
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
              <div className="min-w-0">
                <p id="calendar-prep-title" className="truncate text-base font-semibold text-[var(--text-1)]">
                  {activeEvent.summary}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                    {formatDate(activeEvent.start)} · {formatTime(activeEvent.start)}
                  </p>
                  <MeetingJoinLink href={activeEvent.meetLink} compact />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="shrink-0 rounded-[6px] p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            {generating === selected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-12">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                <p className="text-xs text-[var(--text-3)]">Generating summary…</p>
              </div>
            ) : activeSummary ? (
              <>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-1)]">
                    {activeSummary.summary}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] px-5 py-3">
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
              </>
            ) : (
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                {slackChannels.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-[var(--text-3)]">Slack channels</p>
                    <div className="flex flex-wrap gap-1.5">
                      {slackChannels.map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
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

                <button
                  type="button"
                  onClick={() => void handleSummarise(activeEvent)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <SparklesIcon className="h-4 w-4" />
                  Generate Summary
                </button>
                <p className="text-center text-xs text-[var(--text-4)]">Uses AI · emails · Slack</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
