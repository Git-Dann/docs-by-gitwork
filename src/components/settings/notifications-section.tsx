"use client";

import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { SettingsCard } from "@/components/settings/settings-card";
import { useWebPush } from "@/hooks/use-web-push";
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
      {
        id: "docs.accepted",
        label: "Accepted",
        description: "A client accepted a shared document in-page.",
      },
      {
        id: "docs.declined",
        label: "Declined",
        description: "A client declined a shared document in-page.",
      },
    ],
  },
  {
    module: "Tasks",
    events: [
      { id: "tasks.assigned", label: "Assigned", description: "You were assigned a task." },
      {
        id: "tasks.status_changed",
        label: "Status changed",
        description: "A task you're on moved to a new column.",
      },
      { id: "tasks.commented", label: "Commented", description: "A new comment on a task you're on." },
      { id: "tasks.mentioned", label: "Mentioned", description: "You were @mentioned in a task comment." },
      {
        id: "tasks.blocker_response",
        label: "Blocker answered",
        description: "A client replied to a blocker you flagged.",
      },
      {
        id: "tasks.client_request",
        label: "Client request",
        description: "A client submitted a request/task in their wiki for review.",
      },
    ],
  },
  {
    module: "Backstage",
    events: [
      {
        id: "backstage.leave_submitted",
        label: "Leave submitted",
        description: "A teammate requested leave (approvers).",
      },
      {
        id: "backstage.leave_decided",
        label: "Leave decided",
        description: "Your leave request was approved or rejected.",
      },
      {
        id: "backstage.expense_submitted",
        label: "Expense submitted",
        description: "A teammate submitted an expense (approvers).",
      },
      {
        id: "backstage.expense_decided",
        label: "Expense decided",
        description: "Your expense was reviewed.",
      },
    ],
  },
  {
    module: "Scribe",
    events: [
      {
        id: "meetings.notes_ready",
        label: "Notes ready",
        description: "AI meeting notes finished for a client you're on.",
      },
    ],
  },
  {
    module: "Portal",
    events: [
      {
        id: "clients.onboarded",
        label: "Client onboarded",
        description: "A new client completed onboarding.",
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
          <strong>In-app</strong> and <strong>push</strong> delivery are live — every event below
          fires the bell, and (with push enabled on a device) a browser notification even when
          Foundry is closed. <strong>Email</strong> and <strong>Slack</strong> routing through the
          dispatcher ship next.
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

      <PushDeviceCard />
    </div>
  );
}

/**
 * Per-device browser push toggle. Registers the service worker + PushManager
 * subscription for THIS browser (native Web Push, no third party). Hidden unless
 * the server has VAPID keys configured and the browser supports push.
 */
function PushDeviceCard() {
  const { supported, enabled, permission, subscribed, loading, busy, subscribe, unsubscribe } =
    useWebPush();

  // Nothing to show until we know the server is push-enabled and the browser can do it.
  if (loading || !enabled || !supported) return null;

  const blocked = permission === "denied";

  return (
    <SettingsCard number="04" title="Push on this device">
      <p className="text-sm leading-6 text-[var(--text-3)]">
        Get a browser notification for events routed to <strong>Push</strong> above — even when
        Foundry isn&apos;t open. Enable it per browser/device you want alerts on.
      </p>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-1)]">
            {subscribed ? "Push is on for this device" : "Push is off for this device"}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-4)]">
            {blocked
              ? "Notifications are blocked in your browser settings — re-allow them for this site, then try again."
              : subscribed
                ? "You'll see notifications here even when the tab is closed."
                : "You'll be asked to allow notifications."}
          </p>
        </div>
        <Button
          type="button"
          variant={subscribed ? "secondary" : "primary"}
          size="sm"
          disabled={busy || blocked}
          onClick={() => (subscribed ? void unsubscribe() : void subscribe())}
        >
          {busy ? "Working…" : subscribed ? "Turn off" : "Enable push"}
        </Button>
      </div>
    </SettingsCard>
  );
}
