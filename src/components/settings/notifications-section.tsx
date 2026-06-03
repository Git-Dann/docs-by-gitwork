"use client";

import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { SettingsCard } from "@/components/settings/settings-card";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationPreferences,
} from "@/hooks/use-notification-preferences";

const CHANNELS: { id: NotificationChannel; label: string; hint: string }[] = [
  { id: "email", label: "Email", hint: "Sent to your sign-in address." },
  { id: "push", label: "Push", hint: "iOS and web push (when enabled)." },
  { id: "slack", label: "Slack", hint: "Direct message in connected Slack workspace." },
  { id: "inApp", label: "In-app", hint: "Bell icon and inbox inside Foundry." },
];

const EVENT_GROUPS: { module: string; events: { id: NotificationEvent; label: string; description: string }[] }[] = [
  {
    module: "Pulse",
    events: [
      {
        id: "pulse.scan_failed",
        label: "Scan failed",
        description: "A health scan finished with failing checks.",
      },
      {
        id: "pulse.monitor_drift",
        label: "Monitor drift",
        description: "A monitored project's health score dropped past the alert threshold.",
      },
    ],
  },
  {
    module: "Study",
    events: [
      {
        id: "study.report_ready",
        label: "Report ready",
        description: "A research study finished and the report is ready to review.",
      },
    ],
  },
  {
    module: "Care",
    events: [
      {
        id: "care.ticket_created",
        label: "New ticket",
        description: "A new support ticket landed in your queue.",
      },
      {
        id: "care.ticket_escalated",
        label: "Ticket escalated",
        description: "A workflow rule or manual escalation flagged a ticket.",
      },
    ],
  },
  {
    module: "Docs",
    events: [
      {
        id: "docs.viewed_by_client",
        label: "Viewed by client",
        description: "A shared document was opened by a client.",
      },
      {
        id: "docs.signed",
        label: "Signed",
        description: "A document reached SIGNED status.",
      },
    ],
  },
  {
    module: "Team",
    events: [
      {
        id: "team.member_added",
        label: "Member added",
        description: "A new teammate was added to the workspace.",
      },
    ],
  },
];

const TIMEZONES = ["Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Australia/Sydney"];

export function NotificationsSection() {
  const prefsQuery = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const prefs = prefsQuery.data;

  if (prefsQuery.isLoading || !prefs) {
    return (
      <div className="app-card p-6">
        <p className="text-sm text-[var(--text-3)]">Loading your notification preferences…</p>
      </div>
    );
  }

  function toggleChannel(channel: NotificationChannel) {
    const key = `${channel}Enabled` as keyof NotificationPreferences;
    updatePrefs.mutate({ [key]: !prefs![key] } as Partial<NotificationPreferences>);
  }

  function toggleEventChannel(event: NotificationEvent, channel: NotificationChannel) {
    const current = prefs!.events[event] ?? [];
    const next = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    updatePrefs.mutate({ events: { ...prefs!.events, [event]: next } });
  }

  return (
    <div className="proposal-form-theme space-y-6">
      <div className="rounded-[10px] border border-[var(--brand-300)] bg-[var(--brand-200)]/40 px-4 py-3 text-sm text-[var(--text-2)]">
        <p>
          <strong>Preview.</strong> Channel preferences save to your account immediately. The
          dispatcher that actually sends events down these channels ships next — until then
          Foundry still pings you the way it always has.
        </p>
      </div>

      <SettingsCard number="01" title="Channels">
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Master switches per channel. Turn one off and Foundry won&apos;t send anything down it,
          regardless of per-event routing below.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((channel) => {
            const key = `${channel.id}Enabled` as keyof NotificationPreferences;
            const enabled = Boolean(prefs[key]);
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => toggleChannel(channel.id)}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-[10px] border px-4 py-3 text-left transition",
                  enabled
                    ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
                    : "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)] hover:bg-[var(--surface-2)]",
                )}
              >
                <div>
                  <p className="text-sm font-semibold">{channel.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-4)]">{channel.hint}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                    enabled
                      ? "bg-[var(--brand-600)] text-white"
                      : "bg-[var(--surface-3)] text-[var(--text-4)]",
                  )}
                >
                  {enabled ? "On" : "Off"}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard number="02" title="Per-event routing" bodyClassName="p-0">
        <div className="border-b border-[var(--border-2)] p-6">
          <p className="text-sm leading-6 text-[var(--text-3)]">
            Pick which channel(s) deliver each event. Events with no channels selected stay
            silent.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-1)] text-left text-xs uppercase tracking-[0.08em] text-[var(--text-4)]">
              <tr>
                <th className="px-6 py-3 font-medium">Event</th>
                {CHANNELS.map((channel) => (
                  <th key={channel.id} className="px-3 py-3 text-center font-medium">
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-3)]">
              {EVENT_GROUPS.map((group) => (
                // Fragment needs an explicit key inside .map — React warns otherwise.
                <Fragment key={group.module}>
                  <tr>
                    <td colSpan={1 + CHANNELS.length} className="bg-[var(--surface-1)]/60 px-6 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                      {group.module}
                    </td>
                  </tr>
                  {group.events.map((event) => {
                    const selected = prefs.events[event.id] ?? [];
                    return (
                      <tr key={event.id}>
                        <td className="px-6 py-3">
                          <p className="font-medium text-[var(--text-1)]">{event.label}</p>
                          <p className="mt-0.5 text-xs text-[var(--text-4)]">{event.description}</p>
                        </td>
                        {CHANNELS.map((channel) => {
                          const masterOff = !prefs[`${channel.id}Enabled` as keyof NotificationPreferences];
                          const on = selected.includes(channel.id);
                          return (
                            <td key={channel.id} className="px-3 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => toggleEventChannel(event.id, channel.id)}
                                disabled={masterOff}
                                className={cn(
                                  "h-6 w-6 rounded-md border transition disabled:cursor-not-allowed disabled:opacity-30",
                                  on
                                    ? "border-[var(--brand-600)] bg-[var(--brand-600)] text-white"
                                    : "border-[var(--border-2)] bg-white hover:bg-[var(--surface-1)]",
                                )}
                                aria-pressed={on}
                                aria-label={`${on ? "Disable" : "Enable"} ${channel.label} for ${event.label}`}
                              >
                                {on ? "✓" : ""}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      <SettingsCard number="03" title="Cadence & quiet hours">
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Roll multiple notifications into a digest, or mute non-urgent pings during quiet hours.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Digest cadence</span>
            <select
              value={prefs.digestCadence}
              onChange={(event) =>
                updatePrefs.mutate({
                  digestCadence: event.target.value as NotificationPreferences["digestCadence"],
                })
              }
              className="app-select w-full"
            >
              <option value="OFF">Off — send each event live</option>
              <option value="DAILY">Daily digest</option>
              <option value="WEEKLY">Weekly digest</option>
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Quiet hours start</span>
            <input
              type="time"
              value={prefs.quietHoursStart ?? ""}
              onChange={(event) =>
                updatePrefs.mutate({ quietHoursStart: event.target.value || null })
              }
              // `app-input` matches every other field on the page — without it native
              // <input type="time"> renders with browser default styling that looks broken
              // next to the styled selects either side of it.
              className="app-input w-full"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Quiet hours end</span>
            <input
              type="time"
              value={prefs.quietHoursEnd ?? ""}
              onChange={(event) =>
                updatePrefs.mutate({ quietHoursEnd: event.target.value || null })
              }
              className="app-input w-full"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Timezone</span>
            <select
              value={prefs.timezone ?? ""}
              onChange={(event) =>
                updatePrefs.mutate({ timezone: event.target.value || null })
              }
              className="app-select w-full"
            >
              <option value="">Use device timezone</option>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <span
            className={cn(
              "text-xs",
              updatePrefs.isPending ? "text-[var(--text-2)]" : "text-[var(--text-4)]",
            )}
          >
            {updatePrefs.isPending ? "Saving…" : "Changes save automatically"}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => updatePrefs.mutate({})}
            disabled={updatePrefs.isPending}
          >
            Refresh
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
