"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// Single source of truth — imported from the server registry so this client hook
// can never drift out of sync with the real event list (it did before: only 8 of
// the registered events were listed here).
import type { NotificationChannel, NotificationEvent } from "@/server/notification-events";
export type { NotificationChannel, NotificationEvent };

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
