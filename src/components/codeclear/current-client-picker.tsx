"use client";

import { ArrowPathIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSetCandidateCurrentClients } from "@/hooks/use-codeclear";
import { cn } from "@/lib/format";
import type { CodeClearCandidateCurrentClient } from "@/types/codeclear";
import type { ClientListItem } from "@/types/client";

/**
 * Multi-select chip picker for "Current client" on a Candidate.
 *
 * Chips with × to remove + a "+ Add" button. The Add dropdown is rendered
 * via a portal with fixed positioning so it escapes any overflow:hidden
 * ancestor (otherwise it gets clipped inside the profile hero card).
 *
 * Calls useSetCandidateCurrentClients on every change — the server diffs
 * the new list against the existing open placements.
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
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedIds = useMemo(
    () =>
      currentClients
        .map((entry) => entry.id)
        .filter((id): id is string => id !== null),
    [currentClients],
  );
  const availableToAdd = clients.filter((client) => !selectedIds.includes(client.id));

  // Compute menu position whenever it opens — and on scroll/resize while
  // open. Fixed positioning + portaling escapes any clipping ancestor.
  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    function reposition() {
      if (!addBtnRef.current) return;
      const rect = addBtnRef.current.getBoundingClientRect();
      const desiredWidth = Math.max(rect.width, 220);
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: desiredWidth,
      });
    }

    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  // Close on outside click + ESC.
  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!menuRef.current || !addBtnRef.current) return;
      const target = event.target as Node;
      if (menuRef.current.contains(target) || addBtnRef.current.contains(target)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function commit(nextIds: string[]) {
    mutation.mutate([...new Set(nextIds)]);
  }

  function remove(clientId: string) {
    commit(selectedIds.filter((id) => id !== clientId));
  }

  function add(clientId: string) {
    commit([...selectedIds, clientId]);
    setOpen(false);
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
    <div
      className="flex flex-wrap items-center gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
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
        <button
          ref={addBtnRef}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((prev) => !prev);
          }}
          className={addBtnClass}
          aria-label={candidateName ? `Add client to ${candidateName}` : "Add client"}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <PlusIcon className="h-3 w-3" />
          Add
        </button>
      ) : null}

      {mutation.isPending || clientsLoading ? (
        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-[var(--text-4)]" aria-hidden />
      ) : null}

      {/* Portaled dropdown — fixed positioning escapes the hero's overflow-hidden */}
      {open && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                minWidth: menuPosition.width,
                zIndex: 9999,
              }}
              className="rounded-[8px] border border-[var(--border-2)] bg-white p-1 shadow-[var(--shadow-lg)]"
            >
              <ul className="max-h-[260px] overflow-y-auto">
                {availableToAdd.map((client) => (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        add(client.id);
                      }}
                      className="block w-full rounded-[6px] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                    >
                      {client.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
