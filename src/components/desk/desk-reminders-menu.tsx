"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardDocumentListIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import {
  useDeskReminders,
  useCreateDeskReminder,
  useUpdateDeskReminder,
  useDeleteDeskReminder,
} from "@/hooks/use-desk";

/**
 * Reminders as a top-bar popover (sits beside the notification bell) rather than
 * taking a whole row on the Today view. A count badge shows open reminders; the
 * panel lets you jot a quick one. Same hooks as the old inline list; reminders
 * still clear themselves after 7 days.
 */
export function DeskRemindersMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reminders = useDeskReminders({ enabled: true });
  const items = reminders.data?.reminders ?? [];
  const openCount = items.filter((r) => !r.done).length;
  const badge = openCount > 9 ? "9+" : String(openCount);

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
        aria-label={openCount > 0 ? `Reminders, ${openCount} open` : "Reminders"}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative rounded-[6px] p-2 text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
      >
        <ClipboardDocumentListIcon className="h-6 w-6" />
        {openCount > 0 && (
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
          aria-label="Reminders"
          className="absolute right-0 z-50 mt-2 hidden w-[340px] overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] shadow-xl lg:block"
        >
          <RemindersPanel />
        </div>
      )}

      {/* Mobile: reuse the focus-trapped Modal as a sheet */}
      <div className="lg:hidden">
        <Modal open={open} onClose={() => setOpen(false)} panelClassName="w-full max-w-md p-0">
          <RemindersPanel />
        </Modal>
      </div>
    </div>
  );
}

function RemindersPanel() {
  const reminders = useDeskReminders({ enabled: true });
  const create = useCreateDeskReminder();
  const update = useUpdateDeskReminder();
  const remove = useDeleteDeskReminder();
  const [draft, setDraft] = useState("");
  const items = reminders.data?.reminders ?? [];

  function add() {
    const body = draft.trim();
    if (!body) return;
    create.mutate(body, { onSuccess: () => setDraft("") });
  }

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="widget-header">
        <span className="widget-header-label">Reminders</span>
        <span className="text-[10px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
          clears after 7 days
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-[var(--border-2)] p-3">
        <input
          className="app-input flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Remember to…"
          maxLength={280}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button
          type="button"
          variant="secondary"
          leadingIcon={<PlusIcon className="h-4 w-4" />}
          onClick={add}
          loading={create.isPending}
          disabled={!draft.trim()}
        >
          Add
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {reminders.isPending ? (
          <div className="h-16 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-[var(--text-4)]">
            Nothing jotted down yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((r) => (
              <li
                key={r.id}
                className="group flex items-center gap-2.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={r.done}
                  onChange={(e) => update.mutate({ id: r.id, input: { done: e.target.checked } })}
                  className="accent-[var(--brand-700)]"
                  aria-label={r.done ? "Mark not done" : "Mark done"}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 break-words text-sm",
                    r.done ? "text-[var(--text-4)] line-through" : "text-[var(--text-1)]",
                  )}
                >
                  {r.body}
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate(r.id)}
                  aria-label="Delete reminder"
                  className="shrink-0 rounded-[5px] p-1 text-[var(--text-4)] opacity-0 transition hover:bg-[var(--surface-1)] hover:text-[var(--danger-500)] focus:opacity-100 group-hover:opacity-100"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
