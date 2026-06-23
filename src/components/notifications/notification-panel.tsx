"use client";

import { useRouter } from "next/navigation";
import { useMarkAllRead, useMarkRead, useNotifications } from "@/hooks/use-notifications";
import type { NotificationDTO } from "@/types/notifications";
import { NotificationItem } from "./notification-item";

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const items = data ?? [];
  const hasUnread = items.some((n) => !n.read);

  function activate(n: NotificationDTO) {
    if (!n.read) markRead.mutate([n.id]);
    if (n.actionUrl) {
      onClose();
      router.push(n.actionUrl);
    }
  }

  return (
    <div className="flex max-h-[70vh] min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-2.5">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-3)]">
          01 // Notifications
        </span>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={!hasUnread || markAll.isPending}
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-700)] transition disabled:cursor-default disabled:text-[var(--text-4)]"
        >
          Mark all read
        </button>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-[var(--border-3)] overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-[var(--text-3)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-[var(--text-2)]">You&apos;re all caught up</p>
            <p className="mt-1 text-xs text-[var(--text-4)]">
              New notifications will appear here.
            </p>
          </div>
        ) : (
          items.map((n) => <NotificationItem key={n.id} notification={n} onActivate={activate} />)
        )}
      </div>
    </div>
  );
}
