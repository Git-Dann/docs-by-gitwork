/**
 * Notification event registry. Add new events here as modules grow.
 *
 * `events` keys in `NotificationPreference.events` and `Workspace.channelRoutes` reference
 * these IDs. Keep them stable — changing an ID orphans existing user preferences.
 */

export const NOTIFICATION_CHANNELS = ["email", "push", "slack", "inApp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENTS = [
  "pulse.scan_failed",
  "pulse.monitor_drift",
  "study.report_ready",
  "care.ticket_created",
  "care.ticket_escalated",
  "docs.viewed_by_client",
  "docs.signed",
  "team.member_added",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
