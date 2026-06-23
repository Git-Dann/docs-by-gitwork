"use client";

import { useEffect, useRef, useState } from "react";
import { BellIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { useUnreadCount } from "@/hooks/use-notifications";
import { cn } from "@/lib/format";
import { NotificationPanel } from "./notification-panel";

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { data: unread = 0 } = useUnreadCount();
  const wrapRef = useRef<HTMLDivElement>(null);
  const badge = unread > 9 ? "9+" : String(unread);

  // Click-outside + Escape for the desktop dropdown. The mobile Modal handles its own.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative rounded-[6px] p-2 text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
      >
        <BellIcon className="h-6 w-6" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-600)] px-1 font-mono text-[10px] font-semibold leading-none text-white"
          >
            {badge}
          </span>
        )}
      </button>

      {/* Desktop: anchored dropdown */}
      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 hidden w-[380px] overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white shadow-xl lg:block"
        >
          <NotificationPanel onClose={() => setOpen(false)} />
        </div>
      )}

      {/* Mobile: reuse the focus-trapped Modal as a sheet */}
      <div className="lg:hidden">
        <Modal open={open} onClose={() => setOpen(false)} panelClassName="w-full max-w-md p-0">
          <NotificationPanel onClose={() => setOpen(false)} />
        </Modal>
      </div>
    </div>
  );
}
