export type { NotificationEvent, NotificationChannel } from "@/server/notification-events";

export interface NotificationDTO {
  id: string;
  event: import("@/server/notification-events").NotificationEvent;
  title: string;
  body: string | null;
  count: number;
  read: boolean;
  readAt: string | null;
  actionUrl: string | null;
  clientId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
