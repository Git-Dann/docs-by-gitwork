"use client";

import { useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import type { CourseRequestRecord } from "@/lib/api";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

const STATUSES = ["NEW", "SENT", "ADDED", "REJECTED"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_STYLE: Record<Status, string> = {
  NEW: "bg-amber-50 text-amber-700 hover:bg-amber-100",
  SENT: "bg-blue-50 text-blue-700 hover:bg-blue-100",
  ADDED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  REJECTED: "bg-red-50 text-red-700 hover:bg-red-100",
};
const STATUS_LABEL: Record<Status, string> = {
  NEW: "New",
  SENT: "Sent",
  ADDED: "Added",
  REJECTED: "Rejected",
};

const menuPanel =
  "z-50 mt-1.5 rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] focus:outline-none";
const menuItem =
  "flex w-full items-center rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-[var(--text-2)] transition data-[focus]:bg-[var(--surface-1)] hover:bg-[var(--surface-1)]";

/** "Course name, Country" per line — what gets pasted into the course API provider. */
function formatForCopy(requests: CourseRequestRecord[]): string {
  return requests
    .map((r) => (r.country?.trim() ? `${r.courseName}, ${r.country.trim()}` : r.courseName))
    .filter((l) => l.trim())
    .join("\n");
}

interface Props {
  requests: CourseRequestRecord[];
  onAdd?: () => void;
  onEdit?: (req: CourseRequestRecord) => void;
  onDelete: (ids: string[]) => Promise<void>;
  onSetStatus: (ids: string[], status: string) => Promise<void>;
  readOnly?: boolean;
}

export function CourseRequestsSection({
  requests,
  onAdd,
  onEdit,
  onDelete,
  onSetStatus,
  readOnly = false,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered =
    statusFilter === "ALL" ? requests : requests.filter((r) => r.status === statusFilter);

  const selectedRequests = requests.filter((r) => selected.has(r.id));
  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  }
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCopy() {
    const text = formatForCopy(selectedRequests);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function batchStatus(status: Status) {
    setBusy(true);
    try {
      await onSetStatus([...selected], status);
    } finally {
      setBusy(false);
    }
  }

  async function batchDelete() {
    setBusy(true);
    try {
      await onDelete([...selected]);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  const statusFilterTabs: Array<"ALL" | Status> = ["ALL", ...STATUSES];

  return (
    <div>
      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-1">
        {statusFilterTabs.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium transition",
              statusFilter === s
                ? "bg-[var(--text-1)] text-white"
                : "border border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
            ].join(" ")}
          >
            {s === "ALL" ? "All" : STATUS_LABEL[s]}
          </button>
        ))}
        {!readOnly && filtered.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="ml-auto text-[12px] font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
          >
            {allVisibleSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      {/* ── List ───────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] py-14 text-center">
          <p className="text-[13px] text-[var(--text-4)]">No course requests for this selection.</p>
          {!readOnly && onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-700)] hover:underline"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add the first request
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const status = (STATUSES.includes(r.status as Status) ? r.status : "NEW") as Status;
            const isSelected = selected.has(r.id);
            const isExpanded = expanded.has(r.id);
            const dateStr = new Date(r.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
            return (
              <div
                key={r.id}
                className={[
                  "flex items-start gap-3 rounded-[10px] border bg-white px-4 py-3 transition",
                  isSelected
                    ? "border-[var(--brand-500)] ring-1 ring-[var(--brand-500)]/20"
                    : "border-[rgba(0,0,0,0.08)]",
                ].join(" ")}
              >
                {!readOnly && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(r.id)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border-2)] accent-[var(--brand-700)]"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--text-1)]">
                      {r.courseName || <span className="italic text-[var(--text-4)]">Untitled course</span>}
                    </span>
                    {r.country && (
                      <span
                        className="rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[11px] text-[var(--text-3)]"
                        style={{ fontFamily: MONO }}
                      >
                        {r.country}
                      </span>
                    )}
                  </div>
                  {r.notes && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(r.id)}
                      className="mt-1 block max-w-full text-left text-[12px] leading-5 text-[var(--text-3)]"
                    >
                      <span className={isExpanded ? "whitespace-pre-wrap" : "line-clamp-2 whitespace-pre-wrap"}>
                        {r.notes}
                      </span>
                      <span className="text-[var(--brand-700)]">
                        {r.notes.length > 120 ? (isExpanded ? " Show less" : " Show more") : ""}
                      </span>
                    </button>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="hidden text-[11px] text-[var(--text-4)] sm:inline">{dateStr}</span>

                  {/* Status badge — menu to set status */}
                  {!readOnly ? (
                    <Menu as="div" className="relative">
                      <MenuButton
                        className={[
                          "inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition",
                          STATUS_STYLE[status],
                        ].join(" ")}
                        style={{ fontFamily: MONO }}
                      >
                        {STATUS_LABEL[status]}
                        <ChevronDownIcon className="h-3 w-3" />
                      </MenuButton>
                      <MenuItems anchor="bottom end" className={`${menuPanel} w-36`}>
                        {STATUSES.map((s) => (
                          <MenuItem key={s}>
                            <button
                              type="button"
                              onClick={() => void onSetStatus([r.id], s)}
                              className={menuItem}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          </MenuItem>
                        ))}
                      </MenuItems>
                    </Menu>
                  ) : (
                    <span
                      className={`rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${STATUS_STYLE[status]}`}
                      style={{ fontFamily: MONO }}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  )}

                  {!readOnly && onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(r)}
                      className="rounded p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                      title="Edit request"
                    >
                      <PencilSquareIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => void onDelete([r.id])}
                      className="rounded p-1 text-[var(--text-4)] transition hover:bg-red-50 hover:text-red-600"
                      title="Delete request"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Batch bar ──────────────────────────────────────────── */}
      {!readOnly && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-[12px] border border-[rgba(0,0,0,0.1)] bg-white px-3 py-2 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.25)]">
          <span className="px-1 text-[13px] font-medium text-[var(--text-2)]">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)]"
          >
            {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
            {copied ? "Copied" : "Copy selected"}
          </button>

          <Menu as="div" className="relative">
            <MenuButton
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
            >
              Set status
              <ChevronDownIcon className="h-3.5 w-3.5 text-[var(--text-4)]" />
            </MenuButton>
            <MenuItems anchor="top end" className={`${menuPanel} w-36`}>
              {STATUSES.map((s) => (
                <MenuItem key={s}>
                  <button type="button" onClick={() => void batchStatus(s)} className={menuItem}>
                    {STATUS_LABEL[s]}
                  </button>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>

          <button
            type="button"
            onClick={() => void batchDelete()}
            disabled={busy}
            className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-[6px] px-2 py-1.5 text-[13px] text-[var(--text-4)] transition hover:text-[var(--text-1)]"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
