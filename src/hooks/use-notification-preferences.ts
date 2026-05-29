"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type NotificationChannel = "email" | "push" | "slack" | "inApp";

export type NotificationEvent =
  | "pulse.scan_failed"
  | "pulse.monitor_drift"
  | "study.report_ready"
  | "care.ticket_created"
  | "care.ticket_escalated"
  | "docs.viewed_by_client"
  | "docs.signed"
  | "team.member_added";

export interface NotificationPreferences {
  emailEnabled: boolean;
  pushEnabled: boolean;
  slackEnabled: boolean;
  inAppEnabled: boolean;
  events: Partial<Record<NotificationEvent, NotificationChannel[]>>;
  digestCadence: "OFF" | "DAILY" | "WEEKLY";
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
}

const PREFS_KEY = ["notifications", "preferences"] as const;

export function useNotificationPreferences() {
  return useQuery({
    queryKey: PREFS_KEY,
    queryFn: async (): Promise<NotificationPreferences> => {
      const res = await apiFetch<{ preferences: NotificationPreferences }>(
        "/api/notifications/preferences",
      );
      return res.preferences;
    },
    staleTime: 30_000,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<NotificationPreferences>,
    ): Promise<NotificationPreferences> => {
      const res = await apiFetch<{ preferences: NotificationPreferences }>(
        "/api/notifications/preferences",
        {
          method: "PATCH",
          body: JSON.stringify(patch),
          headers: { "Content-Type": "application/json" },
        },
      );
      return res.preferences;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(PREFS_KEY, preferences);
    },
  });
}
