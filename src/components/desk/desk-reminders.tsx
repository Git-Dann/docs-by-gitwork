"use client";

import { useEffect, useRef, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import {
  useDeskReminders,
  useCreateDeskReminder,
  useUpdateDeskReminder,
  useDeleteDeskReminder,
} from "@/hooks/use-desk";
import { EditorialRow, DeskEmpty, DeskSkeleton } from "./desk-shared";

/** A short, throwaway personal to-do list on the Desk. Reminders drop off after
 *  7 days by design — this is "remember to do this", not the task board. */
export function DeskReminders({ enabled = true }: { enabled?: boolean }) {
  const reminders = useDeskReminders({ enabled });
  const create = useCreateDeskReminder();
  const update = useUpdateDeskReminder();
  const remove = useDeleteDeskReminder();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Press "/" anywhere on the Desk to jump straight to adding a reminder — unless
  // you're already typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function add() {
    const body = draft.trim();
    if (!body) return;
    create.mutate(body, { onSuccess: () => setDraft("") });
  }

  const items = reminders.data?.reminders ?? [];

  return (
    <EditorialRow
      title="Quick reminders"
      caption="Temporary jots — they clear themselves after 7 days."
    >
      <div className="mb-3 flex items-center gap-2">
        <input
          ref={inputRef}
          className="app-input flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Remember to…  (press / to jump here)"
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

      {reminders.isPending ? (
        <DeskSkeleton />
      ) : items.length === 0 ? (
        <DeskEmpty>Nothing jotted down. Add a quick reminder above.</DeskEmpty>
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
    </EditorialRow>
  );
}
