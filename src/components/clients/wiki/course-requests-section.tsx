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
  ChevronRightIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import type { CourseRequestRecord } from "@/lib/api";

// JetBrains Mono stack — used for all data labels and timestamps per DESIGN.md
const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const STATUSES = ["NEW", "SENT", "ADDED", "REJECTED"] as const;
type Status = (typeof STATUSES)[number];
const ACTIVE_STATUSES = ["NEW", "SENT", "REJECTED"] as const;
type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

// Semantic badge colors per DESIGN.md — no pill shapes, rounded-[4px] only
const STATUS_STYLE: Record<Status, string> = {
  NEW:      "bg-amber-50 text-amber-700 hover:bg-amber-100",
  SENT:     "bg-blue-50 text-blue-700 hover:bg-blue-100",
  ADDED:    "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  REJECTED: "bg-red-50 text-red-700 hover:bg-red-100",
};
const STATUS_LABEL: Record<Status, string> = {
  NEW: "New", SENT: "Sent", ADDED: "Added", REJECTED: "Rejected",
};

/** Strip UUIDs that occasionally land in the country field from intake bugs. */
function safeCountry(c: string | null): string | null {
  if (!c) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return null;
  return c;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Course name, Country" per line — what gets pasted into the course API provider. */
function copyLines(reqs: CourseRequestRecord[]): string {
  return reqs
    .map((r) => {
      const country = safeCountry(r.country);
      return country ? `${r.courseName}, ${country}` : r.courseName;
    })
    .filter(Boolean)
    .join("\n");
}

function downloadTxt(reqs: CourseRequestRecord[], filename: string) {
  const text = reqs
    .map((r) => {
      const country = safeCountry(r.country);
      return country ? `${r.courseName}, ${country}` : r.courseName;
    })
    .filter(Boolean)
    .join("\n");
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const menuPanel =
  "z-50 mt-1.5 rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] focus:outline-none";
const menuItem =
  "flex w-full items-center rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-[var(--text-2)] transition data-[focus]:bg-[var(--surface-1)] hover:bg-[var(--surface-1)]";

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
  const [filter, setFilter] = useState<"ALL" | ActiveStatus>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAdded, setShowAdded] = useState(false);

  const activeRequests = requests.filter((r) => r.status !== "ADDED");
  const addedRequests = requests.filter((r) => r.status === "ADDED");

  const filtered =
    filter === "ALL"
      ? activeRequests
      : activeRequests.filter((r) => r.status === filter);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const selectedRows = activeRequests.filter((r) => selected.has(r.id));

  const counts = STATUSES.reduce<Record<Status, number>>(
    (acc, s) => ({ ...acc, [s]: requests.filter((r) => r.status === s).length }),
    {} as Record<Status, number>,
  );

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

  async function writeClipboard(rows: CourseRequestRecord[]) {
    const text = copyLines(rows);
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function handleCopyAndMarkSent() {
    setBusy(true);
    try {
      const ok = await writeClipboard(selectedRows);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
      await onSetStatus([...selected], "SENT");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyOnly() {
    const ok = await writeClipboard(selectedRows);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  async function handleBatchStatus(status: Status) {
    setBusy(true);
    try {
      await onSetStatus([...selected], status);
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchDelete() {
    setBusy(true);
    try {
      await onDelete([...selected]);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  // Grid template: checkbox | course+notes | country | submitted | sent | status | actions
  // readOnly drops checkbox and actions columns
  const gridCols = readOnly
    ? "1fr 88px 92px 92px 72px"
    : "20px 1fr 88px 92px 92px 72px 52px";

  return (
    <div>
      {/* ── Count summary — mono data-label per DESIGN.md ───────────── */}
      {requests.length > 0 && (
        <div
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-0.5"
          style={{ fontFamily: MONO }}
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-3)]">
            {activeRequests.length} active
          </span>
          {ACTIVE_STATUSES.filter((s) => counts[s] > 0).map((s) => (
            <span
              key={s}
              className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]"
            >
              · {counts[s]} {STATUS_LABEL[s]}
            </span>
          ))}
          {addedRequests.length > 0 && (
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
              · {addedRequests.length} Added
            </span>
          )}
        </div>
      )}

      {/* ── Filter tabs — rounded-[6px] per DESIGN.md (no pills) ─────── */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {(["ALL", ...ACTIVE_STATUSES] as Array<"ALL" | ActiveStatus>).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={[
              "rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition",
              filter === s
                ? "bg-[var(--text-1)] text-[var(--surface-0)]"
                : "border border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
            ].join(" ")}
          >
            {s === "ALL"
              ? `All active (${activeRequests.length})`
              : `${STATUS_LABEL[s]} (${counts[s]})`}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {!readOnly && filtered.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className="text-[12px] font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
              style={{ fontFamily: MONO }}
            >
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
      </div>

      {/* ── Column header row ──────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div
          className="mb-1 grid items-center gap-x-3 px-3"
          style={{ gridTemplateColumns: gridCols, fontFamily: MONO }}
        >
          {!readOnly && <span />}
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
            Course
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
            Country
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
            Submitted
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
            Sent
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
            Status
          </span>
          {!readOnly && <span />}
        </div>
      )}

      {/* ── List ──────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] py-12 text-center">
          <p className="text-[13px] text-[var(--text-4)]">
            No course requests for this selection.
          </p>
          {!readOnly && onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-700)] hover:underline"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add the first request
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-[rgba(0,0,0,0.05)] overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white">
          {filtered.map((r) => {
            const status = (STATUSES.includes(r.status as Status) ? r.status : "NEW") as Status;
            const isSelected = !readOnly && selected.has(r.id);
            const country = safeCountry(r.country);
            // Strip the "Via Big Wedge API …" source line — only show actual extra detail
            const notesPreview = r.notes
              ? r.notes.replace(/^Via Big Wedge API[^\n]*\n?/i, "").trim().split("\n")[0] || null
              : null;

            return (
              <div
                key={r.id}
                className={[
                  "grid items-center gap-x-3 px-3 py-2.5 transition",
                  isSelected
                    ? "bg-blue-50/50"
                    : "hover:bg-[var(--surface-0,_#fafaf9)]",
                ].join(" ")}
                style={{ gridTemplateColumns: gridCols }}
              >
                {!readOnly && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3.5 w-3.5 rounded-[3px] border-[var(--border-2)] accent-[var(--brand-700)]"
                  />
                )}

                {/* Course name + one-line notes preview */}
                <div className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-[var(--text-1)]">
                    {r.courseName || (
                      <span className="italic text-[var(--text-4)]">Untitled course</span>
                    )}
                  </span>
                  {notesPreview && (
                    <span className="block truncate text-[11px] text-[var(--text-4)]">
                      {notesPreview}
                    </span>
                  )}
                </div>

                {/* Country */}
                <div style={{ fontFamily: MONO }}>
                  {country ? (
                    <span className="inline-block max-w-full truncate rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[11px] text-[var(--text-3)]">
                      {country}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--text-4)]">—</span>
                  )}
                </div>

                {/* Submitted date — JetBrains Mono timestamp per DESIGN.md */}
                <span
                  className="text-[12px] text-[var(--text-3)]"
                  style={{ fontFamily: MONO }}
                >
                  {fmtDate(r.createdAt)}
                </span>

                {/* Sent date */}
                <span
                  className={[
                    "text-[12px]",
                    r.sentAt ? "text-[var(--text-3)]" : "text-[var(--text-4)]",
                  ].join(" ")}
                  style={{ fontFamily: MONO }}
                >
                  {fmtDate(r.sentAt)}
                </span>

                {/* Status — clickable dropdown per row */}
                {!readOnly ? (
                  <Menu as="div" className="relative">
                    <MenuButton
                      className={[
                        "inline-flex w-full items-center justify-between gap-0.5 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition",
                        STATUS_STYLE[status],
                      ].join(" ")}
                      style={{ fontFamily: MONO }}
                    >
                      {STATUS_LABEL[status]}
                      <ChevronDownIcon className="h-2.5 w-2.5 shrink-0" />
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
                    className={`inline-block rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${STATUS_STYLE[status]}`}
                    style={{ fontFamily: MONO }}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                )}

                {/* Row actions */}
                {!readOnly && (
                  <div className="flex items-center justify-end gap-0.5">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(r)}
                        className="rounded-[4px] p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                        title="Edit"
                      >
                        <PencilSquareIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void onDelete([r.id])}
                      className="rounded-[4px] p-1 text-[var(--text-4)] transition hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 02 // ADDED COURSES — collapsed reference table ─────────── */}
      {addedRequests.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowAdded((v) => !v)}
            className="flex w-full items-center gap-2 py-1 text-left"
          >
            <ChevronRightIcon
              className={`h-3.5 w-3.5 shrink-0 text-[var(--text-4)] transition-transform ${showAdded ? "rotate-90" : ""}`}
            />
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]"
              style={{ fontFamily: MONO }}
            >
              <span className="text-[var(--text-4)]">02 // </span>ADDED COURSES
            </span>
            <span
              className="ml-1 text-[11px] text-[var(--text-4)]"
              style={{ fontFamily: MONO }}
            >
              ({addedRequests.length})
            </span>
          </button>

          {showAdded && (
            <div className="mt-2 divide-y divide-[rgba(0,0,0,0.05)] overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-0,#fafaf9)]">
              {addedRequests.map((r) => {
                const country = safeCountry(r.country);
                return (
                  <div
                    key={r.id}
                    className="grid items-center gap-x-3 px-3 py-2 hover:bg-white/70 transition"
                    style={{
                      gridTemplateColumns: readOnly
                        ? "1fr 88px 92px 92px"
                        : "1fr 88px 92px 92px 52px",
                    }}
                  >
                    <span className="truncate text-[13px] text-[var(--text-2)]">
                      {r.courseName}
                    </span>
                    <div style={{ fontFamily: MONO }}>
                      {country ? (
                        <span className="inline-block max-w-full truncate rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[11px] text-[var(--text-3)]">
                          {country}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--text-4)]">—</span>
                      )}
                    </div>
                    <span
                      className="text-[12px] text-[var(--text-4)]"
                      style={{ fontFamily: MONO }}
                    >
                      {fmtDate(r.createdAt)}
                    </span>
                    <span
                      className="text-[12px] text-[var(--text-4)]"
                      style={{ fontFamily: MONO }}
                    >
                      {fmtDate(r.sentAt)}
                    </span>
                    {!readOnly && (
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => void onSetStatus([r.id], "NEW")}
                          className="rounded-[4px] p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                          title="Move back to active"
                        >
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete([r.id])}
                          className="rounded-[4px] p-1 text-[var(--text-4)] transition hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Batch bar ─────────────────────────────────────────────────── */}
      {!readOnly && selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white px-3 py-2.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.25)]">
          <span
            className="pl-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-3)]"
            style={{ fontFamily: MONO }}
          >
            {selected.size} selected
          </span>

          {/* Primary action: copy for the provider AND mark as Sent in one step */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCopyAndMarkSent()}
            className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-50"
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5" />
            ) : (
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied & marked Sent" : "Copy & mark Sent"}
          </button>

          {/* Copy without changing status */}
          <button
            type="button"
            onClick={() => void handleCopyOnly()}
            className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            Copy only
          </button>

          {/* Download selected as .txt */}
          <button
            type="button"
            onClick={() => downloadTxt(selectedRows, "course-requests.txt")}
            className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
            Download .txt
          </button>

          {/* Mark as any status */}
          <Menu as="div" className="relative">
            <MenuButton
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
            >
              Mark as
              <ChevronDownIcon className="h-3.5 w-3.5 text-[var(--text-4)]" />
            </MenuButton>
            <MenuItems anchor="top end" className={`${menuPanel} w-36`}>
              {STATUSES.map((s) => (
                <MenuItem key={s}>
                  <button
                    type="button"
                    onClick={() => void handleBatchStatus(s)}
                    className={menuItem}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleBatchDelete()}
            className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[12px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-[6px] px-2 py-1.5 text-[12px] text-[var(--text-4)] transition hover:text-[var(--text-1)]"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
