"use client";

import { ArrowPathIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useMemo, useRef, useState } from "react";
import { useSetCandidateCurrentClients } from "@/hooks/use-codeclear";
import { cn } from "@/lib/format";
import type { CodeClearCandidateCurrentClient } from "@/types/codeclear";
import type { ClientListItem } from "@/types/client";

/**
 * Multi-select chip picker for "Current client" on a Candidate.
 *
 * Renders one chip per currently assigned client (with × to remove) plus a
 * "+ Add" button that opens a dropdown of unassigned clients. Calls
 * useSetCandidateCurrentClients on every change — the API diffs against
 * existing open placements.
 *
 * The picker is intentionally compact so it slots into a roster card, a
 * registry table cell, or a profile hero strip without restyling.
 */
export function CurrentClientPicker({
  candidateId,
  candidateName,
  currentClients,
  clients,
  clientsLoading,
  size = "md",
}: {
  candidateId: string;
  candidateName?: string;
  currentClients: CodeClearCandidateCurrentClient[];
  clients: ClientListItem[];
  clientsLoading?: boolean;
  size?: "sm" | "md";
}) {
  const mutation = useSetCandidateCurrentClients(candidateId);
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  // IDs currently in-effect, derived from props (server is source of truth).
  // We deliberately don't keep local state — the optimistic story is handled
  // by React Query invalidation in the hook.
  const selectedIds = useMemo(
    () =>
      currentClients
        .map((entry) => entry.id)
        .filter((id): id is string => id !== null),
    [currentClients],
  );

  const availableToAdd = clients.filter((client) => !selectedIds.includes(client.id));

  function commit(nextIds: string[]) {
    mutation.mutate([...new Set(nextIds)]);
  }

  function remove(clientId: string) {
    commit(selectedIds.filter((id) => id !== clientId));
  }

  function add(clientId: string) {
    commit([...selectedIds, clientId]);
    setOpen(false);
    // Close native <details>
    if (detailsRef.current) detailsRef.current.open = false;
  }

  const chipClass =
    size === "sm"
      ? "inline-flex items-center gap-1 rounded-[4px] border border-[var(--border-2)] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-2)]"
      : "inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-xs font-medium text-[var(--text-2)]";

  const addBtnClass =
    size === "sm"
      ? "inline-flex items-center gap-0.5 rounded-[4px] border border-dashed border-[var(--border-1)] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-3)] hover:border-[var(--brand-400)] hover:text-[var(--brand-700)]"
      : "inline-flex items-center gap-0.5 rounded-[6px] border border-dashed border-[var(--border-1)] bg-white px-2 py-1 text-xs font-medium text-[var(--text-3)] hover:border-[var(--brand-400)] hover:text-[var(--brand-700)]";

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      {currentClients.length === 0 ? (
        <span className="text-xs italic text-[var(--text-4)]">Unassigned</span>
      ) : (
        currentClients.map((client) => {
          const isLegacy = client.id === null;
          return (
            <span
              key={client.id ?? client.name}
              className={cn(chipClass, isLegacy && "opacity-60")}
              title={isLegacy ? "Legacy non-Portal client" : undefined}
            >
              {client.name}
              {isLegacy ? null : (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (client.id) remove(client.id);
                  }}
                  disabled={mutation.isPending}
                  aria-label={`Remove ${client.name}`}
                  className="rounded-full text-[var(--text-4)] transition hover:text-rose-500"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })
      )}

      {availableToAdd.length > 0 ? (
        <details
          ref={detailsRef}
          open={open}
          onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
          className="relative"
        >
          <summary className={cn(addBtnClass, "list-none cursor-pointer select-none")}
            aria-label={candidateName ? `Add client to ${candidateName}` : "Add client"}
          >
            <PlusIcon className="h-3 w-3" />
            Add
          </summary>
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded-[8px] border border-[var(--border-2)] bg-white p-1 shadow-[var(--shadow-lg)]">
            <ul className="max-h-[240px] overflow-y-auto">
              {availableToAdd.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      add(client.id);
                    }}
                    className="w-full rounded-[6px] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                  >
                    {client.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      {mutation.isPending || clientsLoading ? (
        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-[var(--text-4)]" aria-hidden />
      ) : null}
    </div>
  );
}
