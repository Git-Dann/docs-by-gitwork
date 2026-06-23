// DTOs for the in-app notification feed. Re-exports the canonical NotificationEvent so the
// feed, validators, and UI all share one source of truth with the event registry.

import type { NotificationEvent } from "@/server/notification-events";
export type { NotificationEvent } from "@/server/notification-events";

export interface NotificationDTO {
  id: string;
  event: NotificationEvent;
  title: string; // prose, shown verbatim — e.g. "You were assigned 15 tasks"
  body: string | null;
  count: number; // grouped count; 1 = singular
  read: boolean;
  readAt: string | null; // ISO
  actionUrl: string | null; // deep link; null = not navigable
  clientId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO (bumps when a group re-fires)
}

export interface UnreadCountDTO {
  unread: number;
}
