"use client";

// ALERTS tab — the Desk home for in-app notifications (the same feed as the nav bell).
// Tags (@mentions on tasks) land here; more events light it up as modules wire the
// dispatcher. Clicking a row marks it read and deep-links via its actionUrl.

import { useRouter } from "next/navigation";
import { useNotifications, useMarkAllRead, useMarkRead } from "@/hooks/use-notifications";
import type { NotificationDTO } from "@/types/notifications";
import { NotificationItem } from "@/components/notifications/notification-item";
import { EditorialRow, DeskEmpty, DeskSkeleton, RevealList } from "./desk-shared";
import { DeskBroadcast } from "./desk-broadcast";

export function DeskAlerts() {
  const router = useRouter();
  const { data, isPending } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const items = data ?? [];
  const hasUnread = items.some((n) => !n.read);

  function activate(n: NotificationDTO) {
    if (!n.read) markRead.mutate([n.id]);
    if (n.actionUrl) router.push(n.actionUrl);
  }

  return (
    <div>
      {/* Workspace-wide broadcast — everyone sees an active one; admins post/replace. */}
      <DeskBroadcast />

      <EditorialRow
        title="Notifications"
        count={items.length}
        caption="Mentions and updates addressed to you."
        first
      >
        {hasUnread ? (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-700)] transition hover:text-[var(--brand-800)] disabled:text-[var(--text-4)]"
            >
              Mark all read
            </button>
          </div>
        ) : null}
        {isPending ? (
          <DeskSkeleton />
        ) : items.length === 0 ? (
          <DeskEmpty>You&apos;re all caught up.</DeskEmpty>
        ) : (
          <RevealList
            items={items}
            initial={6}
            renderItem={(n) => (
              <div
                key={n.id}
                className="overflow-hidden rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)]"
              >
                <NotificationItem notification={n} onActivate={activate} />
              </div>
            )}
          />
        )}
      </EditorialRow>
    </div>
  );
}
