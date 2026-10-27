"use client";

import Link from "next/link";
import { useState } from "react";
import { useMonitors, useUpdateMonitor, useDeleteMonitor } from "@/hooks/use-pulse";
import type { MonitorRecord } from "@/lib/api";
import { cn } from "@/lib/format";

function scoreTone(score: number | null): string {
  if (score == null) return "text-[var(--text-4)]";
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Scheduled re-scans of a project. Its own page since Pulse got a nav (Pulse → Monitors), so
 * it is a numbered widget card with an empty state: a page that renders nothing reads as
 * broken. Monitors are created from a scan's results.
 */
export function PulseMonitorsPanel({ number = "01" }: { number?: string }) {
  const { data, isLoading, isError } = useMonitors();
  const { mutate: update } = useUpdateMonitor();
  const { mutate: remove, isPending: removing, variables: removingId } = useDeleteMonitor();

  const monitors = data?.monitors ?? [];

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-header-label">{`${number} // MONITORS`}</span>
        {monitors.length > 0 && (
          <span className="widget-header-right">
            {monitors.length} {monitors.length === 1 ? "monitor" : "monitors"}
          </span>
        )}
      </div>
      <div className="widget-body">
      <p className="mb-4 text-xs text-[var(--text-4)]">
        Scheduled re-scans. Alerts fire on a health drop or a new confirmed critical issue (for example RLS turned off).
        Add recipients to send a weekly summary email after the re-scan.
      </p>
      {isLoading ? (
        <p className="text-sm text-[var(--text-3)]">Loading monitors…</p>
      ) : isError ? (
        <p className="text-sm text-[var(--danger-700)]">Monitors could not be loaded.</p>
      ) : monitors.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">
          Nothing is being monitored yet. Open a scan and choose Monitor to re-scan it on a schedule.
        </p>
      ) : (
      <div className="space-y-2">
        {monitors.map((m) => {
          const target = m.inputUrl ?? m.inputGithubRepo ?? m.projectName;
          return (
            <div key={m.id} className="rounded-[8px] border border-[var(--border-2)] px-3 py-2">
            <div className="flex flex-wrap items-center gap-3">
              {/* Its own line on a phone: beside the controls the name was cut to one letter. */}
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <p className="truncate text-sm font-medium text-[var(--text-1)]" title={m.projectName}>{m.projectName}</p>
                <p className="truncate text-xs text-[var(--text-4)]" title={target}>{target} · last run {timeAgo(m.lastRunAt)}</p>
              </div>
              {m.lastScanId ? (
                <Link href={`/app/pulse/${m.lastScanId}`} className={cn("text-sm font-bold tabular-nums", scoreTone(m.lastHealthScore))}>
                  {m.lastHealthScore ?? "—"}
                </Link>
              ) : (
                <span className="text-sm font-bold tabular-nums text-[var(--text-4)]">—</span>
              )}
              <select
                value={m.frequency}
                onChange={(e) => update({ monitorId: m.id, frequency: e.target.value as "DAILY" | "WEEKLY" | "OFF" })}
                className="app-select !h-8 !w-auto !py-0 text-xs"
                aria-label="Monitor frequency"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="OFF">Paused</option>
              </select>
              <button
                type="button"
                onClick={() => update({ monitorId: m.id, isActive: !m.isActive })}
                className={cn(
                  "rounded-[6px] border px-2 py-1 text-xs font-medium transition",
                  m.isActive ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[var(--border-2)] text-[var(--text-4)]",
                )}
              >
                {m.isActive ? "Active" : "Inactive"}
              </button>
              <button
                type="button"
                onClick={() => remove(m.id)}
                disabled={removing && removingId === m.id}
                className="text-xs text-[var(--text-4)] hover:text-red-600"
              >
                Remove
              </button>
            </div>
            <DigestRecipients monitor={m} />
            </div>
          );
        })}
      </div>
      )}
      </div>
    </div>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Who gets the weekly summary email for this monitor. Saved as a list; blank turns it off. */
function DigestRecipients({ monitor }: { monitor: MonitorRecord }) {
  const { mutate: update, isPending, error } = useUpdateMonitor();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(monitor.digestEmails.join(", "));
  const parsed = draft.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const invalid = parsed.filter((e) => !EMAIL.test(e));

  if (!editing) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-4)]">
        <span>
          {monitor.digestEmails.length === 0
            ? "No weekly email"
            : `Weekly email to ${monitor.digestEmails.join(", ")}${monitor.lastDigestAt ? ` · last sent ${timeAgo(monitor.lastDigestAt)}` : " · first one after the next re-scan"}`}
        </span>
        <button type="button" onClick={() => { setDraft(monitor.digestEmails.join(", ")); setEditing(true); }} className="font-medium text-[var(--brand-600)] hover:underline">
          {monitor.digestEmails.length === 0 ? "Add recipients" : "Edit"}
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-2 flex flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid.length > 0 || parsed.length > 10) return;
        update({ monitorId: monitor.id, digestEmails: parsed }, { onSuccess: () => setEditing(false) });
      }}
    >
      <div className="min-w-[220px] flex-1">
        <label htmlFor={`digest-${monitor.id}`} className="sr-only">Weekly email recipients</label>
        <input
          id={`digest-${monitor.id}`}
          className="app-input h-8 text-base sm:text-xs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="name@client.com, another@client.com"
          autoComplete="off"
        />
        {(invalid.length > 0 || parsed.length > 10 || error) && (
          <p className="mt-1 text-xs text-[var(--danger-500)]">
            {invalid.length > 0 ? `Not an email address: ${invalid.join(", ")}` : parsed.length > 10 ? "Up to 10 recipients." : "Could not save. Try again."}
          </p>
        )}
      </div>
      <button type="submit" disabled={isPending} className="app-button app-button-primary h-8 px-3 text-xs">
        {isPending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="h-8 px-2 text-xs text-[var(--text-4)] hover:text-[var(--text-2)]">
        Cancel
      </button>
    </form>
  );
}
