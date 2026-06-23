"use client";

import { cn, formatRelative } from "@/lib/format";
import type { NotificationDTO } from "@/types/notifications";
import { eventMeta } from "./event-map";

export function NotificationItem({
  notification: n,
  onActivate,
}: {
  notification: NotificationDTO;
  onActivate: (n: NotificationDTO) => void;
}) {
  const { icon: Icon, label } = eventMeta(n.event);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => onActivate(n)}
      aria-label={`${n.title}${n.read ? "" : ", unread"}`}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition",
        "hover:bg-[var(--surface-1)] focus:outline-none focus-visible:bg-[var(--surface-1)]",
        !n.read && "bg-[var(--surface-brand-soft)]",
      )}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-1)] text-[var(--text-3)]">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-3)]">
            {label}
          </span>
          {n.count > 1 && (
            <span className="rounded-full bg-[var(--surface-brand)] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-[var(--brand-700)]">
              ×{n.count}
            </span>
          )}
        </span>
        <span
          className={cn(
            "mt-0.5 block truncate text-sm",
            n.read ? "text-[var(--text-2)]" : "font-medium text-[var(--text-1)]",
          )}
        >
          {n.title}
        </span>
        {n.body ? (
          <span className="mt-0.5 block truncate text-xs text-[var(--text-3)]">{n.body}</span>
        ) : null}
        <span className="mt-1 block font-mono text-[11px] tracking-wide text-[var(--text-4)]">
          {formatRelative(n.createdAt)}
        </span>
      </span>
      {!n.read && (
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-600)]"
          aria-hidden
        />
      )}
    </button>
  );
}
