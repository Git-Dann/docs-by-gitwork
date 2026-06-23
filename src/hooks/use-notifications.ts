"use client";

// In-app notification feed hooks. The badge is driven by a lightweight, always-on count
// poll; the full list is fetched only when the panel opens. Marking read updates BOTH the
// badge cache and every feed cache optimistically, then reconciles against server truth.
//
// Query keys are namespaced under ["notifications","feed"|"unread-count"] to avoid colliding
// with use-notification-preferences' ["notifications","preferences"].

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  getUnreadNotificationCount,
  listNotifications,
  markNotificationsRead,
} from "@/lib/api";
import type { NotificationDTO } from "@/types/notifications";

const QK = {
  feed: (unreadOnly: boolean) => ["notifications", "feed", unreadOnly] as const,
  unread: ["notifications", "unread-count"] as const,
};

const FEED_FILTER = { queryKey: ["notifications", "feed"] as const };

export function useNotifications(opts: { unreadOnly?: boolean; enabled?: boolean } = {}) {
  const unreadOnly = opts.unreadOnly ?? false;
  return useQuery({
    queryKey: QK.feed(unreadOnly),
    queryFn: () => listNotifications({ limit: 20, unreadOnly }),
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
  });
}

/** Always-on poll that drives the bell badge. Hits the cheap count endpoint only. */
export function useUnreadCount() {
  return useQuery({
    queryKey: QK.unread,
    queryFn: () => getUnreadNotificationCount().then((r) => r.unread),
    staleTime: 30_000,
    refetchInterval: 45_000, // quiet poll — not a burden
    refetchIntervalInBackground: false, // don't poll hidden tabs
    refetchOnWindowFocus: true, // global default is false → opt back in
  });
}

function setUnread(qc: QueryClient, fn: (prev: number) => number) {
  qc.setQueryData<number>(QK.unread, (prev) => Math.max(0, fn(prev ?? 0)));
}

function patchFeeds(qc: QueryClient, updater: (n: NotificationDTO) => NotificationDTO) {
  qc.setQueriesData<NotificationDTO[]>(FEED_FILTER, (old) => old?.map(updater));
}

type FeedSnapshot = ReturnType<QueryClient["getQueriesData"]>;

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead({ ids }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prevUnread = qc.getQueryData<number>(QK.unread);
      const prevFeeds = qc.getQueriesData<NotificationDTO[]>(FEED_FILTER);
      const idSet = new Set(ids);
      let nowRead = 0;
      patchFeeds(qc, (n) => {
        if (idSet.has(n.id) && !n.read) {
          nowRead += 1;
          return { ...n, read: true };
        }
        return n;
      });
      setUnread(qc, (c) => c - nowRead);
      return { prevUnread, prevFeeds };
    },
    onError: (_e, _ids, ctx) => {
      if (!ctx) return;
      if (ctx.prevUnread !== undefined) qc.setQueryData(QK.unread, ctx.prevUnread);
      for (const [key, data] of ctx.prevFeeds as FeedSnapshot) qc.setQueryData(key, data);
    },
    onSuccess: (res) => qc.setQueryData(QK.unread, res.unread),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["notifications", "feed"] });
      void qc.invalidateQueries({ queryKey: QK.unread });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markNotificationsRead({ all: true }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prevUnread = qc.getQueryData<number>(QK.unread);
      const prevFeeds = qc.getQueriesData<NotificationDTO[]>(FEED_FILTER);
      patchFeeds(qc, (n) => (n.read ? n : { ...n, read: true }));
      qc.setQueryData(QK.unread, 0);
      return { prevUnread, prevFeeds };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      if (ctx.prevUnread !== undefined) qc.setQueryData(QK.unread, ctx.prevUnread);
      for (const [key, data] of ctx.prevFeeds as FeedSnapshot) qc.setQueryData(key, data);
    },
    onSuccess: (res) => qc.setQueryData(QK.unread, res.unread),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
