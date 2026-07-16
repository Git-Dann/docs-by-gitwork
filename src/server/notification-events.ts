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
  "tasks.client_request",
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
 * Channels: `inApp` (the bell + feed) and `push` (native Web Push, VAPID) are wired.
 * EVERY event includes `inApp` — it's the baseline that always works. `push` is added
 * to directed/actionable events (someone assigned you work, decided your request, a client
 * needs something) so devs are interrupted only when it matters; informational events stay
 * in-app. `email`/`slack` routing through the dispatcher is still deferred (listing them is
 * harmless — the dispatcher no-ops on unwired channels); some approval events keep an
 * `email` hint for when it lands. A user's saved `events` override this per event.
 */
export const DEFAULT_EVENT_ROUTING: Record<NotificationEvent, NotificationChannel[]> = {
  "pulse.scan_failed": ["inApp", "push", "email"],
  "pulse.monitor_drift": ["inApp", "push", "email"],
  "study.report_ready": ["inApp", "email"],
  "care.ticket_created": ["inApp", "push"],
  "care.ticket_escalated": ["inApp", "push", "email"],
  "docs.viewed_by_client": ["inApp"],
  "docs.signed": ["inApp", "email"],
  "docs.accepted": ["inApp", "push"],
  "docs.declined": ["inApp", "push"],
  "team.member_added": ["inApp"],
  "tasks.assigned": ["inApp", "push"],
  "tasks.status_changed": ["inApp", "push"],
  "tasks.commented": ["inApp", "push"],
  "tasks.mentioned": ["inApp", "push"],
  "tasks.blocker_response": ["inApp", "push"],
  "tasks.client_request": ["inApp", "push"],
  "backstage.leave_submitted": ["inApp", "email"],
  "backstage.leave_decided": ["inApp", "push"],
  "backstage.expense_submitted": ["inApp", "email"],
  "backstage.expense_decided": ["inApp", "push"],
  "meetings.notes_ready": ["inApp"],
  "clients.onboarded": ["inApp"],
};
