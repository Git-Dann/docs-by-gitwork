"use client";

import { ArrowPathIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSetCandidateCurrentClients } from "@/hooks/use-codeclear";
import { cn } from "@/lib/format";
import type { CodeClearCandidateCurrentClient } from "@/types/codeclear";
import type { ClientListItem } from "@/types/client";
import { ClientAvatar } from "@/components/codeclear/client-avatar";

/**
 * Multi-select picker for "Current client(s)" on a candidate. Surface is
 * an overlapping avatar stack (with a "+N" overflow chip when there are
 * many) so it scales to 20+ clients without bloating the row height. An
 * Edit button next to the stack opens a portal-positioned panel with a
 * search input + checkbox-per-client; toggling rows updates pending
 * state locally and the diff is committed in a single mutation when the
 * panel closes (outside click, Escape, or Done).
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
  const [search, setSearch] = useState("");
  // Pending selection — tracked locally while the panel is open. Initialised
  // from the saved selection on open, diff-committed on close.
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const savedIds = useMemo(
    () =>
      currentClients
        .map((entry) => entry.id)
        .filter((id): id is string => id !== null),
    [currentClients],
  );

  // Hydrate pendingIds whenever the panel opens. Closing clears so the
  // next open re-reads from server state (covers the "another admin
  // edited in the meantime" race).
  useEffect(() => {
    if (open) {
      setPendingIds(savedIds);
      setSearch("");
    } else {
      setPendingIds(null);
    }
  }, [open, savedIds]);

  // Position the panel directly under the trigger; reposition on scroll
  // + resize so it stays anchored.
  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    function reposition() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(rect.width, 280),
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

  function commitAndClose() {
    if (!pendingIds) {
      setOpen(false);
      return;
    }
    const next = [...new Set(pendingIds)];
    const sortedNext = [...next].sort();
    const sortedSaved = [...savedIds].sort();
    const changed =
      sortedNext.length !== sortedSaved.length ||
      sortedNext.some((id, i) => id !== sortedSaved[i]);
    if (changed) mutation.mutate(next);
    setOpen(false);
  }

  // Outside click + Escape commits pending changes. Escape doubles as
  // "save and close" rather than "discard" — admins who opened the
  // panel typically intend the toggles they made; an explicit Cancel
  // button is at the panel footer for the discard case.
  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!menuRef.current || !triggerRef.current) return;
      const target = event.target as Node;
      if (menuRef.current.contains(target) || triggerRef.current.contains(target)) return;
      commitAndClose();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") commitAndClose();
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingIds, savedIds]);

  function togglePending(id: string) {
    setPendingIds((prev) => {
      const base = prev ?? savedIds;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  }

  function clearAllPending() {
    setPendingIds([]);
  }

  // Search filter applies to the panel list only. Case-insensitive.
  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, search]);

  const pendingCount = pendingIds?.length ?? savedIds.length;
  const pickerHeight = size === "sm" ? "h-5" : "h-7";

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      onClick={(event) => event.stopPropagation()}
    >
      {/* Avatar stack — overlapping logos with a "+N" overflow chip.
          Scales to many clients without wrapping the row. Clicking
          opens the manage panel. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-2 rounded-[8px] border border-transparent px-1.5 py-1 transition hover:border-[var(--border-2)] hover:bg-[var(--surface-1)]",
          pickerHeight,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          candidateName
            ? `Manage current clients for ${candidateName}`
            : "Manage current clients"
        }
      >
        {currentClients.length === 0 ? (
          <span className="text-xs italic text-[var(--text-4)]">Unassigned</span>
        ) : (
          <StackedAvatars currentClients={currentClients} clients={clients} size={size} />
        )}
        <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-4)]">
          <PencilSquareIcon className="h-3 w-3" aria-hidden />
          {currentClients.length === 0 ? "Add" : "Edit"}
        </span>
      </button>

      {(mutation.isPending || clientsLoading) ? (
        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-[var(--text-4)]" aria-hidden />
      ) : null}

      {open && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="dialog"
              aria-label="Select current clients"
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
                zIndex: 9999,
              }}
              className="rounded-[10px] border border-[var(--border-2)] bg-white shadow-[var(--shadow-lg)]"
            >
              <div className="border-b border-[var(--border-3)] p-2">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Search ${clients.length} clients…`}
                  className="app-input h-8 w-full text-xs"
                  autoFocus
                />
              </div>
              <ul className="max-h-[320px] overflow-y-auto p-1">
                {filteredClients.length === 0 ? (
                  <li className="px-2.5 py-3 text-center text-xs italic text-[var(--text-4)]">
                    {clients.length === 0 ? "No clients in workspace" : "No matches"}
                  </li>
                ) : (
                  filteredClients.map((client) => {
                    const checked = (pendingIds ?? savedIds).includes(client.id);
                    return (
                      <li key={client.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={checked}
                          onClick={() => togglePending(client.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs font-medium transition hover:bg-[var(--surface-1)]",
                            checked ? "text-[var(--text-1)]" : "text-[var(--text-2)]",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            tabIndex={-1}
                            className="h-3.5 w-3.5 rounded-[3px] border-[var(--border-2)]"
                          />
                          <ClientAvatar
                            name={client.name}
                            logoUrl={client.logoUrl ?? null}
                            size="sm"
                          />
                          <span className="truncate">{client.name}</span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <div className="flex items-center justify-between gap-2 border-t border-[var(--border-3)] px-3 py-2">
                <span className="text-[11px] text-[var(--text-4)]">
                  {pendingCount} selected
                </span>
                <div className="flex items-center gap-1">
                  {pendingCount > 0 ? (
                    <button
                      type="button"
                      onClick={clearAllPending}
                      className="text-[11px] font-medium text-[var(--text-3)] transition hover:text-rose-500"
                    >
                      Clear all
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={commitAndClose}
                    className="rounded-[6px] bg-[var(--brand-600)] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[var(--brand-700)]"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Overlapping client avatars for the trigger — up to 5 visible, then
 * a "+N" overflow chip. Mirrors the pattern used on the Code Developers
 * list so the surface feels consistent.
 */
function StackedAvatars({
  currentClients,
  clients,
  size,
}: {
  currentClients: CodeClearCandidateCurrentClient[];
  clients: ClientListItem[];
  size: "sm" | "md";
}) {
  const MAX_VISIBLE = 5;
  const shown = currentClients.slice(0, MAX_VISIBLE);
  const extra = currentClients.length - shown.length;
  const avatarSize = size === "sm" ? "sm" : "md";
  const overlapPx = size === "sm" ? -6 : -10;
  return (
    <span className="inline-flex items-center">
      {shown.map((entry, i) => {
        const logoUrl = entry.id
          ? clients.find((c) => c.id === entry.id)?.logoUrl ?? null
          : null;
        return (
          <span
            key={entry.id ?? entry.name}
            className="rounded-full ring-2 ring-white"
            style={{ marginLeft: i === 0 ? 0 : overlapPx, zIndex: MAX_VISIBLE - i }}
            title={entry.name}
          >
            <ClientAvatar name={entry.name} logoUrl={logoUrl} size={avatarSize} />
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="ml-1.5 font-mono text-[10px] font-semibold text-[var(--text-3)]">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
