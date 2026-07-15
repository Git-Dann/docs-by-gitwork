/**
 * Notification event registry. Add new events here as modules grow.
 *
 * `events` keys in `NotificationPreference.events` and `Workspace.channelRoutes` reference
 * these IDs. Keep them stable — changing an ID orphans existing user preferences.
 */

export const NOTIFICATION_CHANNELS = ["email", "push", "slack", "inApp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENTS = [
  // Pulse
  "pulse.scan_failed",
  "pulse.monitor_drift",
  // Study
  "study.report_ready",
  // Care
  "care.ticket_created",
  "care.ticket_escalated",
  // Docs
  "docs.viewed_by_client",
  "docs.signed",
  "docs.accepted",
  "docs.declined",
  // Team
  "team.member_added",
  // Tasks
  "tasks.assigned",
  "tasks.status_changed",
  "tasks.commented",
  "tasks.mentioned",
  "tasks.blocker_response",
  // Backstage
  "backstage.leave_submitted",
  "backstage.leave_decided",
  "backstage.expense_submitted",
  "backstage.expense_decided",
  // Scribe / meetings
  "meetings.notes_ready",
  // Portal / clients
  "clients.onboarded",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/**
 * Default per-event channel routing. The single source of truth for both the dispatcher
 * (`src/server/notifications.ts`) and the preferences route's lazy-create. A user's saved
 * `NotificationPreference.events` overrides this per event.
 *
 * Channels: only `inApp` is wired today (the bell + feed). `email`/`push`/`slack` routing
 * through the dispatcher is deferred, so listing them here is harmless — the dispatcher
 * no-ops on the unwired channels. The two Backstage approval events keep an `email` hint
 * for when email routing lands; today their approver emails are still sent directly.
 */
export const DEFAULT_EVENT_ROUTING: Record<NotificationEvent, NotificationChannel[]> = {
  "pulse.scan_failed": ["email", "push"],
  "pulse.monitor_drift": ["email"],
  "study.report_ready": ["email", "inApp"],
  "care.ticket_created": ["inApp"],
  "care.ticket_escalated": ["email", "push"],
  "docs.viewed_by_client": ["inApp"],
  "docs.signed": ["email", "inApp"],
  "docs.accepted": ["inApp"],
  "docs.declined": ["inApp"],
  "team.member_added": ["inApp"],
  "tasks.assigned": ["inApp"],
  "tasks.status_changed": ["inApp"],
  "tasks.commented": ["inApp"],
  "tasks.mentioned": ["inApp"],
  "tasks.blocker_response": ["inApp"],
  "backstage.leave_submitted": ["inApp", "email"],
  "backstage.leave_decided": ["inApp"],
  "backstage.expense_submitted": ["inApp", "email"],
  "backstage.expense_decided": ["inApp"],
  "meetings.notes_ready": ["inApp"],
  "clients.onboarded": ["inApp"],
};
