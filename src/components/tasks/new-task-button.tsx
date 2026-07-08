"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { TaskFormModal } from "@/components/tasks/task-form";
import { cn } from "@/lib/format";

/**
 * Compact "+ Task" affordance for client rows on Foundry HQ — create a task for a
 * specific client without navigating to its board. Opens the shared TaskFormModal
 * with the client pre-selected + locked. Meant to sit as a sibling of a row's
 * <Link> (never nested inside it), so it stops propagation to avoid navigating.
 */
export function NewTaskButton({
  clientId,
  clientName,
  className,
}: {
  clientId: string;
  clientName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = clientName ? `New task for ${clientName}` : "New task";
  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--border-2)] px-2 py-1 text-[11px] font-medium text-[var(--text-3)] transition hover:border-[var(--brand-300)] hover:text-[var(--text-1)]",
          className,
        )}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Task
      </button>
      {open ? (
        <TaskFormModal defaultClientId={clientId} lockClient onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
