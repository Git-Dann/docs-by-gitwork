"use client";

/**
 * One wiki sheet: a spreadsheet the client and the team both edit, with a Board column that
 * sends a row to the developers' task board and then follows that task (CLAUDE.md §73).
 *
 * Layout rules, each from a defect that has shipped elsewhere:
 *   - The grid has its OWN scroller holding header + body together, with the header row,
 *     the first column and the Board column sticky. It renders inside `.widget-card`, which
 *     is `overflow: hidden` — a wide child with no scroller of its own is unreachable, not
 *     merely off-screen (§45.2).
 *   - Below `sm` it is a list of cards (label/value pairs), not a 20-column sideways scroll.
 *   - Pickers (dropdown options, long text) are portalled popovers, never inline panels a
 *     scroller would clip (§55).
 *   - Inputs are 16px on a phone so iOS doesn't zoom on focus (§44.1).
 *
 * Editing is spreadsheet-like: click or Enter to edit, typing starts editing, Tab/Shift-Tab
 * and the arrow keys move, Escape cancels, Delete clears. Each cell saves on its own (per
 * cell, merged on the server), so the client and the team editing different cells of one
 * row never clobber each other. The grid keeps an optimistic copy of the rows; a refetch
 * landing mid-edit never overwrites a value still being saved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { MONO } from "@/components/analytics/analytics-widgets";
import { Modal } from "@/components/ui/modal";
import {
  addWikiSheetColumnsApi,
  addWikiSheetRowsApi,
  bulkWikiSheetRowsApi,
  updateWikiSheetCellsApi,
  type SheetsTarget,
} from "@/lib/api";
import { fuzzySearch } from "@/lib/fuzzy-search";
import {
  COLUMN_TYPES,
  COLUMN_TYPE_LABEL,
  SHEET_LIMITS,
  cellText,
  clientCanEditColumn,
  coerceCellValue,
  columnWidth,
  exportSheet,
  parseDelimited,
  planImport,
  rowSearchText,
  titleColumn,
} from "@/lib/wiki-sheets";
import { STAGE_HINT, STAGE_LABEL, STAGE_ORDER, STAGE_STYLE, type RequestStage } from "@/lib/wiki-request-stage";
import type {
  SheetCellValue,
  SheetColumn,
  SheetColumnType,
  WikiSheet,
  WikiSheetRow,
} from "@/types/wiki-sheets";

/** Rows rendered at once; "Show more" adds this many. 2,000 live inputs would be slow. */
const CHUNK = 200;
const SELECT_W = 44;
const BOARD_W = 172;
/** The least width of data a viewer must see between the pinned columns before we pin. */
const MIN_DATA_WINDOW = 240;

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };
type StageFilter = "all" | "none" | RequestStage;

interface Editing {
  rowId: string;
  colId: string;
  draft: string;
}

export interface SheetGridProps {
  sheet: WikiSheet;
  target: SheetsTarget;
  mode: "internal" | "public";
  /** Names for the person picker (team + client contacts). */
  people: string[];
  /** Internal only: categories a sent row can land in. */
  featureBlocks?: { id: string; name: string }[];
  /** Refetch after a structural change (rows added/removed/sent, columns added). */
  onRefresh: () => void;
  /** Team: open this sheet's settings. */
  headerExtra?: React.ReactNode;
  index: number;
}

/* ─────────────────────────────────────────────────────────── helpers ── */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** The text an editor starts from for a cell. */
function draftFor(column: SheetColumn, value: SheetCellValue | undefined): string {
  if (value === undefined) return "";
  if (column.type === "date" || column.type === "number") return String(value);
  return cellText(column, value);
}

function isPrintable(e: React.KeyboardEvent): boolean {
  return e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
}

export function StageChip({ stage }: { stage: RequestStage | null }) {
  if (!stage) return <span className="text-[11px] text-[var(--text-4)]">Not on board</span>;
  return (
    <span
      title={STAGE_HINT[stage]}
      className={`inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase ${STAGE_STYLE[stage]}`}
      style={{ fontFamily: MONO }}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

/** A value as it reads in the grid / a card. */
function CellValue({ column, value }: { column: SheetColumn; value: SheetCellValue | undefined }) {
  if (value === undefined) return <span className="text-[var(--text-4)]" aria-hidden="true" />;
  switch (column.type) {
    case "checkbox":
      return (
        <span
          role="img"
          aria-label={value ? "Yes" : "No"}
          className={`inline-flex h-4 w-4 items-center justify-center rounded-[4px] border ${
            value
              ? "border-[var(--brand-600,#1D4ED8)] bg-[var(--brand-600,#1D4ED8)] text-white"
              : "border-[var(--border-2,rgba(0,0,0,0.2))] bg-[var(--surface-0)]"
          }`}
        >
          {value ? <CheckIcon className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
      );
    case "link":
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer noopener"
          className="block truncate text-[var(--brand-600,#1D4ED8)] underline decoration-[var(--border-1)] underline-offset-2 hover:decoration-current"
          title={String(value)}
          onClick={(e) => e.stopPropagation()}
        >
          {String(value).replace(/^https?:\/\//, "")}
        </a>
      );
    case "select":
      return (
        <span className="inline-flex max-w-full truncate rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[12px] text-[var(--text-2)] ring-1 ring-[var(--border-1)]">
          {String(value)}
        </span>
      );
    case "number":
      return <span className="block truncate text-right tabular-nums">{cellText(column, value)}</span>;
    default: {
      const text = cellText(column, value);
      return (
        <span className="block truncate" title={text}>
          {text}
        </span>
      );
    }
  }
}

/* ────────────────────────────────────────────────────────── popover ── */

/**
 * A panel anchored to a cell, portalled to <body> so the grid's scroller can't clip it.
 * Placed below the cell, flipped above when there's no room, clamped to the viewport.
 */
function CellPopover({
  anchor,
  width,
  onDismiss,
  children,
}: {
  anchor: HTMLElement | null;
  width: number;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = panelRef.current?.offsetHeight ?? 240;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const below = r.bottom + 4;
      const top = below + h > vh - 8 && r.top - h - 4 > 8 ? r.top - h - 4 : below;
      const left = Math.max(8, Math.min(r.left, vw - width - 8));
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, width]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onDismiss]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[60] rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
      data-sheet-popover
    >
      {children}
    </div>,
    document.body,
  );
}

/* ─────────────────────────────────────────────────────────── editors ── */

/**
 * The editor for one cell. Text-like types edit in place; dropdowns and long text open a
 * portalled popover. Calls `onCommit(value, move)` with the raw draft — coercion and the
 * error message happen in the grid, through the same `coerceCellValue` the server uses.
 */
function CellEditor({
  column,
  draft,
  anchor,
  people,
  onDraft,
  onCommit,
  onCancel,
}: {
  column: SheetColumn;
  draft: string;
  anchor: HTMLElement | null;
  people: string[];
  onDraft: (v: string) => void;
  onCommit: (raw: string, move: "down" | "right" | "left" | "none") => void;
  onCancel: () => void;
}) {
  const listId = useMemo(() => `sheet-people-${Math.random().toString(36).slice(2, 8)}`, []);

  if (column.type === "select") {
    const options = ["", ...(column.options ?? [])];
    return (
      <CellPopover anchor={anchor} width={Math.max(180, columnWidth(column))} onDismiss={onCancel}>
        <div
          role="listbox"
          aria-label={column.title}
          className="max-h-64 overflow-y-auto"
          onKeyDown={(e) => {
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const at = items.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              items[Math.min(items.length - 1, at + 1)]?.focus();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              items[Math.max(0, at - 1)]?.focus();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if (e.key === "Tab") {
              e.preventDefault();
              onCancel();
            }
          }}
        >
          {options.map((o) => (
            <button
              key={o || "__clear"}
              type="button"
              role="option"
              aria-selected={o === draft}
              autoFocus={o === draft || (!draft && o === "")}
              className={`flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] focus:bg-[var(--surface-1)] focus:outline-none hover:bg-[var(--surface-1)] ${
                o ? "text-[var(--text-2)]" : "text-[var(--text-4)]"
              }`}
              onClick={() => onCommit(o, "down")}
            >
              <span className="w-3.5 shrink-0">{o === draft ? <CheckIcon className="h-3.5 w-3.5" /> : null}</span>
              {o || "Clear"}
            </button>
          ))}
          {(column.options ?? []).length === 0 && (
            <p className="px-2.5 py-1.5 text-[12px] text-[var(--text-4)]">No options yet.</p>
          )}
        </div>
      </CellPopover>
    );
  }

  if (column.type === "long_text") {
    return (
      <CellPopover anchor={anchor} width={340} onDismiss={() => onCommit(draft, "none")}>
        <textarea
          autoFocus
          value={draft}
          aria-label={column.title}
          maxLength={SHEET_LIMITS.maxLongText}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onCommit(draft, "down");
            } else if (e.key === "Tab") {
              e.preventDefault();
              onCommit(draft, e.shiftKey ? "left" : "right");
            }
          }}
          className="app-input min-h-[140px] w-full py-2 text-base leading-6 sm:text-sm"
        />
        <p className="px-1 pt-1 text-[11px] text-[var(--text-4)]">⌘↵ to save · Esc to cancel</p>
      </CellPopover>
    );
  }

  const type = column.type === "date" ? "date" : "text";
  return (
    <>
      <input
        autoFocus
        type={type}
        value={draft}
        aria-label={column.title}
        inputMode={column.type === "number" ? "decimal" : column.type === "link" ? "url" : undefined}
        list={column.type === "person" ? listId : undefined}
        onChange={(e) => onDraft(e.target.value)}
        onBlur={() => onCommit(draft, "none")}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter") {
            e.preventDefault();
            onCommit(draft, "down");
          } else if (e.key === "Tab") {
            e.preventDefault();
            onCommit(draft, e.shiftKey ? "left" : "right");
          }
        }}
        className={`h-full w-full bg-[var(--surface-0)] px-2 text-base outline-none sm:text-[13px] ${
          column.type === "number" ? "text-right tabular-nums" : ""
        }`}
        style={{ outline: "none" }}
      />
      {column.type === "person" && (
        <datalist id={listId}>
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── grid ── */

export function SheetGrid({ sheet, target, mode, people, featureBlocks, onRefresh, headerExtra, index }: SheetGridProps) {
  const internal = mode === "internal";
  const columns = sheet.columns;

  // Optimistic rows. `pending` holds cell writes still in flight, so a refetch that lands
  // before a save completes can't put the old value back.
  const pending = useRef(new Map<string, SheetCellValue | null>());
  const overlay = useCallback(
    (rows: WikiSheetRow[]) =>
      rows.map((r) => {
        let cells = r.cells;
        for (const c of columns) {
          const key = `${r.id}:${c.id}`;
          if (!pending.current.has(key)) continue;
          const v = pending.current.get(key);
          cells = { ...cells };
          if (v === null || v === undefined) delete cells[c.id];
          else cells[c.id] = v;
        }
        return cells === r.cells ? r : { ...r, cells };
      }),
    [columns],
  );
  const [rows, setRows] = useState<WikiSheetRow[]>(() => sheet.rows);
  useEffect(() => {
    setRows(overlay(sheet.rows));
  }, [sheet.rows, overlay]);

  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<{ rowId: string; col: number } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [limit, setLimit] = useState(CHUNK);
  const [importOpen, setImportOpen] = useState(false);
  const [addColOpen, setAddColOpen] = useState(false);
  const [mobileRowId, setMobileRowId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const wasActiveOnPress = useRef(false);
  // Pin the first column and Board only when there's room left for the data between them.
  // At 768px the wiki's content column is ~440px — pinned, 44 + 200 + 150px of fixed
  // columns left ~44px of window onto the data, so every other column was unreachable
  // behind them (found by the headless check, not by any test). Unpinned, it all scrolls.
  const [pin, setPin] = useState(true);
  const pinnedWidth = SELECT_W + (columns[0] ? columnWidth(columns[0]) : 0) + BOARD_W;
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => {
      if (el.clientWidth > 0) setPin(el.clientWidth >= pinnedWidth + MIN_DATA_WINDOW);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pinnedWidth]);

  const canEditCol = useCallback(
    (c: SheetColumn) => internal || clientCanEditColumn(sheet, c),
    [internal, sheet],
  );
  const canAddRows = internal || sheet.clientCanAddRows;
  const canSend = internal || sheet.clientCanSendToBoard;
  const canDelete = (r: WikiSheetRow) => internal || r.mine;
  const titleCol = titleColumn(columns, sheet.titleColumnId);

  const live = useMemo(() => rows.filter((r) => !r.deletedAt), [rows]);
  const deletedCount = rows.length - live.length;
  const visible = useMemo(() => {
    const base = showDeleted ? rows.filter((r) => r.deletedAt) : live;
    const byStage =
      stage === "all" ? base : base.filter((r) => (stage === "none" ? !r.stage : r.stage === stage));
    return fuzzySearch(byStage, query, (r) => [rowSearchText(columns, r.cells)]);
  }, [rows, live, showDeleted, stage, query, columns]);
  const shown = visible.slice(0, limit);
  const stagesPresent = useMemo(
    () => STAGE_ORDER.filter((s) => live.some((r) => r.stage === s)),
    [live],
  );

  /* ── saving ── */

  const saveCell = useCallback(
    async (row: WikiSheetRow, column: SheetColumn, raw: string | boolean) => {
      const res = coerceCellValue(column, raw);
      if (!res.ok) {
        setSave({ kind: "error", message: res.error });
        return false;
      }
      const before = row.cells[column.id];
      const next = res.value;
      if ((before ?? null) === next) return true;
      const key = `${row.id}:${column.id}`;
      pending.current.set(key, next);
      setRows((rs) =>
        rs.map((r) => {
          if (r.id !== row.id) return r;
          const cells = { ...r.cells };
          if (next === null) delete cells[column.id];
          else cells[column.id] = next;
          return { ...r, cells, updatedByKind: internal ? "TEAM" : "CLIENT" };
        }),
      );
      setSave({ kind: "saving" });
      try {
        await updateWikiSheetCellsApi(target, sheet.id, row.id, { [column.id]: next });
        pending.current.delete(key);
        setSave({ kind: "saved" });
        return true;
      } catch (err) {
        pending.current.delete(key);
        setRows((rs) =>
          rs.map((r) => {
            if (r.id !== row.id) return r;
            const cells = { ...r.cells };
            if (before === undefined) delete cells[column.id];
            else cells[column.id] = before;
            return { ...r, cells };
          }),
        );
        setSave({ kind: "error", message: errorMessage(err) });
        return false;
      }
    },
    [internal, sheet.id, target],
  );

  /* ── navigation ── */

  const focusCell = useCallback((rowId: string, col: number) => {
    setActive({ rowId, col });
    requestAnimationFrame(() => {
      const el = cellRefs.current.get(`${rowId}:${col}`);
      if (!el) return;
      // scrollIntoView honours the scroller's scroll-padding (clear of the pinned columns);
      // focus()'s own scroll does not, so it is told not to.
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
  }, []);

  const move = useCallback(
    (from: { rowId: string; col: number }, dRow: number, dCol: number) => {
      const i = shown.findIndex((r) => r.id === from.rowId);
      if (i < 0) return;
      let col = from.col + dCol;
      let r = i + dRow;
      if (col >= columns.length) {
        col = 0;
        r += 1;
      } else if (col < 0) {
        col = columns.length - 1;
        r -= 1;
      }
      r = Math.max(0, Math.min(shown.length - 1, r));
      focusCell(shown[r].id, col);
    },
    [shown, columns.length, focusCell],
  );

  const startEdit = (row: WikiSheetRow, col: number, initial?: string) => {
    const column = columns[col];
    if (!column || !canEditCol(column) || row.deletedAt) return;
    if (column.type === "checkbox") {
      void saveCell(row, column, !(row.cells[column.id] === true));
      return;
    }
    setSave((s) => (s.kind === "error" ? { kind: "idle" } : s));
    setEditing({ rowId: row.id, colId: column.id, draft: initial ?? draftFor(column, row.cells[column.id]) });
  };

  const commit = async (rawDraft: string, dir: "down" | "right" | "left" | "none") => {
    if (!editing) return;
    const row = rows.find((r) => r.id === editing.rowId);
    const colIdx = columns.findIndex((c) => c.id === editing.colId);
    const column = columns[colIdx];
    if (!row || !column) {
      setEditing(null);
      return;
    }
    const res = coerceCellValue(column, rawDraft);
    if (!res.ok) {
      // Keep the editor open with the message; the value is never silently dropped.
      setSave({ kind: "error", message: res.error });
      return;
    }
    setEditing(null);
    const from = { rowId: row.id, col: colIdx };
    if (dir === "down") move(from, 1, 0);
    else if (dir === "right") move(from, 0, 1);
    else if (dir === "left") move(from, 0, -1);
    else focusCell(row.id, colIdx);
    await saveCell(row, column, rawDraft);
  };

  const onCellKey = (e: React.KeyboardEvent, row: WikiSheetRow, col: number) => {
    if (editing) return;
    const here = { rowId: row.id, col };
    const column = columns[col];
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return move(here, 1, 0);
      case "ArrowUp":
        e.preventDefault();
        return move(here, -1, 0);
      case "ArrowRight":
        e.preventDefault();
        return move(here, 0, 1);
      case "ArrowLeft":
        e.preventDefault();
        return move(here, 0, -1);
      case "Tab":
        e.preventDefault();
        return move(here, 0, e.shiftKey ? -1 : 1);
      case "Enter":
      case "F2":
        e.preventDefault();
        return startEdit(row, col);
      case " ":
        if (column?.type === "checkbox") {
          e.preventDefault();
          return startEdit(row, col);
        }
        break;
      case "Delete":
      case "Backspace":
        if (column && canEditCol(column) && !row.deletedAt && row.cells[column.id] !== undefined) {
          e.preventDefault();
          void saveCell(row, column, column.type === "checkbox" ? false : "");
        }
        return;
    }
    if (isPrintable(e) && column && column.type !== "checkbox" && column.type !== "select" && column.type !== "date") {
      e.preventDefault();
      startEdit(row, col, e.key);
    }
  };

  /* ── structural actions ── */

  const addRow = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await addWikiSheetRowsApi(target, sheet.id, [{}]);
      const id = res.rowIds?.[0];
      if (id) {
        const blank: WikiSheetRow = {
          id,
          orderKey: (rows.at(-1)?.orderKey ?? 0) + 1,
          cells: {},
          taskId: null,
          stage: null,
          assignees: [],
          createdByKind: internal ? "TEAM" : "CLIENT",
          createdByName: null,
          createdByWikiUserId: null,
          mine: !internal,
          updatedByKind: internal ? "TEAM" : "CLIENT",
          updatedByName: null,
          deletedAt: null,
          updatedAt: new Date().toISOString(),
        };
        setRows((rs) => [...rs.filter((r) => !r.deletedAt), blank, ...rs.filter((r) => r.deletedAt)]);
        setQuery("");
        setStage("all");
        setShowDeleted(false);
        const firstEditable = columns.findIndex((c) => canEditCol(c));
        if (firstEditable >= 0) focusCell(id, firstEditable);
      }
      onRefresh();
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (action: "delete" | "restore" | "send", ids: string[]) => {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await bulkWikiSheetRowsApi(target, sheet.id, {
        action,
        rowIds: ids,
        ...(action === "send" && internal && blockId ? { featureBlockId: blockId } : {}),
      });
      if (action === "send") {
        const made = res.results?.filter((r) => r.created).length ?? 0;
        const already = (res.results?.length ?? 0) - made;
        setNotice(
          `${made} sent to the board${already ? ` · ${already} already on it` : ""}.`,
        );
        setRows((rs) =>
          rs.map((r) => {
            const hit = res.results?.find((x) => x.rowId === r.id);
            return hit ? { ...r, taskId: hit.taskId, stage: r.stage && hit.created === false ? r.stage : "SCHEDULED" } : r;
          }),
        );
      } else {
        const stamp = action === "delete" ? new Date().toISOString() : null;
        setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, deletedAt: stamp } : r)));
        setNotice(`${ids.length} row${ids.length === 1 ? "" : "s"} ${action === "delete" ? "removed" : "restored"}.`);
      }
      setSelected(new Set());
      onRefresh();
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyTsv = async () => {
    const text = exportSheet(columns, visible, "\t");
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`Copied ${visible.length} row${visible.length === 1 ? "" : "s"} — paste into Google Sheets.`);
    } catch {
      setNotice("Couldn't reach the clipboard — use Download CSV instead.");
    }
  };

  const downloadCsv = () => {
    const csv = exportSheet(columns, visible, ",", { stageLabel: (s) => (s ? STAGE_LABEL[s] : "") });
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheet.title.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "sheet"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ── selection ── */

  const selectable = shown.filter((r) => internal || r.mine || (canSend && !r.taskId));
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const sendable = selectedRows.filter((r) => !r.deletedAt && (!r.taskId || r.stage === "REVIEWING"));
  const deletable = selectedRows.filter((r) => !r.deletedAt && canDelete(r));
  const restorable = selectedRows.filter((r) => r.deletedAt);

  // Drop selections whose rows have gone (§50.8: a stale selection makes every button a no-op).
  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(rows.map((r) => r.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [rows]);

  useEffect(() => {
    if (save.kind !== "saved") return;
    const t = setTimeout(() => setSave({ kind: "idle" }), 1800);
    return () => clearTimeout(t);
  }, [save]);

  const gridTemplate = `${SELECT_W}px ${columns.map((c) => `${columnWidth(c)}px`).join(" ")} ${BOARD_W}px`;
  const minWidth = SELECT_W + columns.reduce((n, c) => n + columnWidth(c), 0) + BOARD_W;
  const mobileRow = mobileRowId ? rows.find((r) => r.id === mobileRowId) ?? null : null;

  return (
    <section className="widget-card" aria-label={sheet.title}>
      <div className="widget-header gap-3">
        <span
          className="widget-header__label min-w-0 truncate"
          style={{ fontFamily: MONO }}
          title={sheet.title}
        >
          <span className="widget-header__label--number">{pad(index + 1)}</span>
          {` // ${sheet.title.toUpperCase()}`}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <SaveIndicator state={save} />
          {headerExtra}
        </div>
      </div>

      {sheet.description && (
        <p className="border-b border-[var(--border-1)] px-4 py-2.5 text-[13px] leading-5 text-[var(--text-3)]">
          {sheet.description}
        </p>
      )}

      {/* Toolbar — or, while rows are selected, the batch bar in its place. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-1)] px-3 py-2.5">
        {selected.size > 0 ? (
          <>
            <span className="text-[11px] tracking-[0.08em] text-[var(--text-2)] uppercase" style={{ fontFamily: MONO }}>
              {selected.size} selected
            </span>
            {canSend && sendable.length > 0 && (
              <>
                {internal && featureBlocks && featureBlocks.length > 0 && (
                  <select
                    value={blockId}
                    onChange={(e) => setBlockId(e.target.value)}
                    aria-label="Category on the board"
                    className="app-input app-select-chevron h-8 w-auto max-w-[200px] py-0 pr-8 pl-2 text-base sm:text-[13px]"
                  >
                    <option value="">No category</option>
                    {featureBlocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="app-button app-button-primary app-button-xs"
                  disabled={busy}
                  onClick={() => void bulk("send", sendable.map((r) => r.id))}
                >
                  Send {sendable.length} to board
                </button>
              </>
            )}
            {deletable.length > 0 && (
              <button
                type="button"
                className="app-button app-button-secondary app-button-xs"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Remove ${deletable.length} row${deletable.length === 1 ? "" : "s"}?${internal ? " You can restore them." : ""}`)) {
                    void bulk("delete", deletable.map((r) => r.id));
                  }
                }}
              >
                Remove {deletable.length}
              </button>
            )}
            {internal && restorable.length > 0 && (
              <button
                type="button"
                className="app-button app-button-secondary app-button-xs"
                disabled={busy}
                onClick={() => void bulk("restore", restorable.map((r) => r.id))}
              >
                Restore {restorable.length}
              </button>
            )}
            <button type="button" className="app-button app-button-tertiary app-button-xs" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </>
        ) : (
          <>
            <label className="relative flex min-w-[180px] flex-1 items-center sm:max-w-[280px]">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 h-4 w-4 text-[var(--text-4)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(CHUNK);
                }}
                placeholder="Search rows"
                aria-label="Search rows"
                className="app-input h-8 w-full py-0 pl-8 text-base sm:text-[13px]"
              />
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as StageFilter)}
              aria-label="Filter by board stage"
              className="app-input app-select-chevron h-8 w-auto py-0 pr-8 pl-2 text-base sm:text-[13px]"
            >
              <option value="all">All stages</option>
              <option value="none">Not on board</option>
              {stagesPresent.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canAddRows && (
                <button
                  type="button"
                  className="app-button app-button-primary app-button-xs"
                  disabled={busy || live.length >= SHEET_LIMITS.maxRows}
                  onClick={() => void addRow()}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add row
                </button>
              )}
              {internal && (
                <button
                  type="button"
                  className="app-button app-button-secondary app-button-xs"
                  disabled={columns.length >= SHEET_LIMITS.maxColumns}
                  onClick={() => setAddColOpen(true)}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Column
                </button>
              )}
              {canAddRows && (
                <button type="button" className="app-button app-button-secondary app-button-xs" onClick={() => setImportOpen(true)}>
                  <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                  Paste
                </button>
              )}
              <button type="button" className="app-button app-button-secondary app-button-xs" onClick={() => void copyTsv()} title="Copy the rows shown, ready to paste into Google Sheets">
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                Copy
              </button>
              <button type="button" className="app-button app-button-secondary app-button-xs" onClick={downloadCsv}>
                <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                CSV
              </button>
            </div>
          </>
        )}
      </div>

      {(notice || save.kind === "error") && (
        <p
          role="status"
          className={`border-b border-[var(--border-1)] px-4 py-2 text-[12px] ${
            save.kind === "error" ? "text-[var(--danger-500)]" : "text-[var(--text-3)]"
          }`}
        >
          {save.kind === "error" ? save.message : notice}
        </p>
      )}

      {columns.length === 0 ? (
        <p className="p-8 text-center text-sm text-[var(--text-4)]">
          {internal ? "This sheet has no columns yet — add one to start." : "Nothing here yet."}
        </p>
      ) : (
        <>
          {/* ── Desktop / tablet: the grid, in its own scroller (header + body share it). ── */}
          <div
            ref={gridRef}
            data-sheet-scroller
            className="hidden max-h-[min(70vh,720px)] overflow-auto sm:block"
            // A cell scrolled into view (by focus, arrow keys or a click) must land clear of
            // the pinned columns and header, not underneath them — otherwise on a narrow
            // window the cell you moved to is hidden by the very columns meant to orient you.
            style={{
              scrollPaddingLeft: pin ? pinnedWidth - BOARD_W : 0,
              scrollPaddingRight: pin ? BOARD_W : 0,
              scrollPaddingTop: 40,
            }}
            data-pinned={pin || undefined}
          >
            <div role="grid" aria-label={sheet.title} aria-rowcount={visible.length + 1} style={{ minWidth }}>
              <div
                role="row"
                className="sticky top-0 z-20 grid border-b border-[var(--border-1)] bg-[var(--surface-1)]"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div role="columnheader" className={`${pin ? "sticky left-0" : ""} z-10 flex items-center justify-center bg-[var(--surface-1)] px-2 py-2`}>
                  {selectable.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select all rows shown"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-[var(--brand-600,#1D4ED8)]"
                    />
                  )}
                </div>
                {columns.map((c, ci) => (
                  <div
                    key={c.id}
                    role="columnheader"
                    title={`${c.title} · ${COLUMN_TYPE_LABEL[c.type]}${!canEditCol(c) ? " · read-only" : ""}`}
                    className={`flex min-w-0 items-center gap-1.5 border-l border-[var(--border-1)] px-2 py-2 text-[10px] font-semibold tracking-[0.1em] text-[var(--text-3)] uppercase ${
                      ci === 0 && pin ? "sticky z-10 bg-[var(--surface-1)]" : ""
                    } ${c.type === "number" ? "justify-end" : ""}`}
                    style={{ fontFamily: MONO, ...(ci === 0 && pin ? { left: SELECT_W } : {}) }}
                  >
                    <span className="truncate">{c.title}</span>
                    {c.id === titleCol?.id && internal && <span className="shrink-0 text-[var(--text-4)]">· title</span>}
                    {!canEditCol(c) && (
                      <span className="shrink-0 text-[var(--text-4)]" aria-label="read-only">
                        🔒
                      </span>
                    )}
                  </div>
                ))}
                <div
                  role="columnheader"
                  className={`${pin ? "sticky right-0" : ""} z-10 border-l border-[var(--border-1)] bg-[var(--surface-1)] px-2 py-2 text-[10px] font-semibold tracking-[0.1em] text-[var(--text-3)] uppercase`}
                  style={{ fontFamily: MONO }}
                >
                  Board
                </div>
              </div>

              {shown.length === 0 && (
                <p className="sticky left-0 px-4 py-8 text-center text-sm text-[var(--text-4)]" style={{ maxWidth: "100%" }}>
                  {query || stage !== "all" ? "No rows match." : showDeleted ? "No removed rows." : canAddRows ? "No rows yet — add one or paste from a spreadsheet." : "No rows yet."}
                </p>
              )}

              {shown.map((row, ri) => {
                const isSel = selected.has(row.id);
                const deleted = Boolean(row.deletedAt);
                return (
                  <div
                    key={row.id}
                    role="row"
                    aria-rowindex={ri + 2}
                    className={`group grid border-b border-[var(--border-1)] ${deleted ? "opacity-60" : ""} ${
                      isSel ? "bg-[var(--brand-50,rgba(29,78,216,0.06))]" : "bg-[var(--surface-0)]"
                    }`}
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div
                      role="gridcell"
                      className={`${pin ? "sticky left-0" : ""} z-[5] flex items-center justify-between gap-1 px-2 ${isSel ? "bg-[var(--surface-1)]" : "bg-[var(--surface-0)]"}`}
                    >
                      {(internal || row.mine || (canSend && !row.taskId)) ? (
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggle(row.id)}
                          aria-label={`Select row ${ri + 1}`}
                          className="h-4 w-4 accent-[var(--brand-600,#1D4ED8)]"
                        />
                      ) : (
                        <span />
                      )}
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.updatedByKind === "CLIENT" ? "bg-[var(--warning-500)]" : "bg-transparent"}`}
                        title={row.updatedByKind === "CLIENT" ? `Last edited by the client${row.updatedByName ? ` (${row.updatedByName})` : ""}` : undefined}
                        aria-label={row.updatedByKind === "CLIENT" && internal ? "Last edited by the client" : undefined}
                      />
                    </div>
                    {columns.map((c, ci) => {
                      const isActive = active?.rowId === row.id && active.col === ci;
                      const isEditing = editing?.rowId === row.id && editing.colId === c.id;
                      const editable = canEditCol(c) && !deleted;
                      const key = `${row.id}:${ci}`;
                      return (
                        <div
                          key={c.id}
                          role="gridcell"
                          tabIndex={isActive || (!active && ri === 0 && ci === 0) ? 0 : -1}
                          aria-readonly={!editable || undefined}
                          aria-selected={isActive || undefined}
                          ref={(el) => {
                            if (el) cellRefs.current.set(key, el);
                            else cellRefs.current.delete(key);
                          }}
                          // Spreadsheet behaviour: the first click selects, a click on the
                          // already-selected cell edits. Whether it was selected is read at
                          // mousedown — by click time onFocus has already made it active, so
                          // checking then would turn every single click into an edit.
                          onMouseDown={() => {
                            wasActiveOnPress.current = isActive && !isEditing;
                          }}
                          onClick={() => {
                            if (wasActiveOnPress.current) startEdit(row, ci);
                            else setActive({ rowId: row.id, col: ci });
                            wasActiveOnPress.current = false;
                          }}
                          onDoubleClick={() => startEdit(row, ci)}
                          onFocus={() => setActive({ rowId: row.id, col: ci })}
                          onKeyDown={(e) => onCellKey(e, row, ci)}
                          className={`relative flex min-h-[36px] min-w-0 items-center border-l border-[var(--border-1)] text-[13px] text-[var(--text-1)] outline-none ${
                            ci === 0 ? `${pin ? "sticky" : ""} z-[5] font-medium ${isSel ? "bg-[var(--surface-1)]" : "bg-[var(--surface-0)]"}` : ""
                          } ${isEditing && (c.type !== "select" && c.type !== "long_text") ? "p-0" : "px-2"} ${
                            isActive ? "ring-2 ring-inset ring-[var(--brand-600,#1D4ED8)]" : ""
                          } ${editable ? "cursor-cell" : "cursor-default text-[var(--text-2)]"}`}
                          style={ci === 0 && pin ? { left: SELECT_W } : undefined}
                        >
                          {isEditing && editing ? (
                            c.type === "select" || c.type === "long_text" ? (
                              <>
                                <CellValue column={c} value={row.cells[c.id]} />
                                <CellEditor
                                  column={c}
                                  draft={editing.draft}
                                  anchor={cellRefs.current.get(key) ?? null}
                                  people={people}
                                  onDraft={(v) => setEditing((ed) => (ed ? { ...ed, draft: v } : ed))}
                                  onCommit={(v, d) => void commit(v, d)}
                                  onCancel={() => {
                                    setEditing(null);
                                    focusCell(row.id, ci);
                                  }}
                                />
                              </>
                            ) : (
                              <CellEditor
                                column={c}
                                draft={editing.draft}
                                anchor={null}
                                people={people}
                                onDraft={(v) => setEditing((ed) => (ed ? { ...ed, draft: v } : ed))}
                                onCommit={(v, d) => void commit(v, d)}
                                onCancel={() => {
                                  setEditing(null);
                                  setSave({ kind: "idle" });
                                  focusCell(row.id, ci);
                                }}
                              />
                            )
                          ) : (
                            <div className="min-w-0 flex-1">
                              <CellValue column={c} value={row.cells[c.id]} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div
                      role="gridcell"
                      className={`${pin ? "sticky right-0" : ""} z-[5] flex min-w-0 items-center gap-1.5 border-l border-[var(--border-1)] px-2 ${isSel ? "bg-[var(--surface-1)]" : "bg-[var(--surface-0)]"}`}
                    >
                      <BoardCell
                        row={row}
                        internal={internal}
                        canSend={canSend && !deleted}
                        slug={target.mode === "internal" ? target.slug : null}
                        busy={busy}
                        onSend={() => void bulk("send", [row.id])}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Phone: one card per row, label/value pairs. Tap to edit. ── */}
          <ul className="divide-y divide-[var(--border-1)] sm:hidden" aria-label={`${sheet.title} rows`}>
            {shown.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-[var(--text-4)]">
                {query || stage !== "all" ? "No rows match." : "No rows yet."}
              </li>
            )}
            {shown.map((row) => {
              const title = titleCol ? cellText(titleCol, row.cells[titleCol.id]) : "";
              const rest = columns.filter((c) => c.id !== titleCol?.id && row.cells[c.id] !== undefined);
              return (
                <li key={row.id} className={`px-4 py-3 ${row.deletedAt ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    {(internal || row.mine || (canSend && !row.taskId)) && (
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={`Select ${title || "row"}`}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-600,#1D4ED8)]"
                      />
                    )}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setMobileRowId(row.id)}
                      disabled={Boolean(row.deletedAt)}
                    >
                      <span className="block text-[15px] font-medium break-words text-[var(--text-1)]">
                        {title || <span className="text-[var(--text-4)]">Untitled row</span>}
                      </span>
                      {rest.length > 0 && (
                        <dl className="mt-1.5 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                          {rest.slice(0, 6).map((c) => (
                            <div key={c.id} className="contents">
                              <dt
                                className="truncate text-[10px] tracking-[0.08em] text-[var(--text-3)] uppercase leading-5"
                                style={{ fontFamily: MONO }}
                                title={c.title}
                              >
                                {c.title}
                              </dt>
                              <dd className="min-w-0 break-words text-[var(--text-2)]">
                                {c.type === "checkbox" || c.type === "link" || c.type === "select" ? (
                                  <CellValue column={c} value={row.cells[c.id]} />
                                ) : (
                                  cellText(c, row.cells[c.id])
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2 pl-7">
                    <BoardCell
                      row={row}
                      internal={internal}
                      canSend={canSend && !row.deletedAt}
                      slug={target.mode === "internal" ? target.slug : null}
                      busy={busy}
                      onSend={() => void bulk("send", [row.id])}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-1)] px-4 py-2 text-[11px] text-[var(--text-4)]">
            <span style={{ fontFamily: MONO }} className="tracking-[0.08em] uppercase">
              {visible.length} of {showDeleted ? deletedCount : live.length} rows
            </span>
            {visible.length > shown.length && (
              <button type="button" className="app-button app-button-link app-button-xs" onClick={() => setLimit((l) => l + CHUNK)}>
                Show {Math.min(CHUNK, visible.length - shown.length)} more
              </button>
            )}
            {internal && deletedCount > 0 && (
              <button
                type="button"
                className="app-button app-button-link app-button-xs"
                onClick={() => {
                  setShowDeleted((v) => !v);
                  setSelected(new Set());
                }}
              >
                {showDeleted ? "Back to the sheet" : `Removed rows (${deletedCount})`}
              </button>
            )}
            <span className="ml-auto hidden md:inline">Enter to edit · Tab / arrows to move · Esc to cancel</span>
          </div>
        </>
      )}

      {importOpen && (
        <ImportDialog
          sheet={sheet}
          internal={internal}
          canEditCol={canEditCol}
          onClose={() => setImportOpen(false)}
          onImport={async (plan) => {
            if (plan.newColumns.length && target.mode === "internal") {
              await addWikiSheetColumnsApi(target.slug, sheet.id, plan.newColumns);
            }
            const res = await addWikiSheetRowsApi(target, sheet.id, plan.rows);
            setNotice(`Imported ${res.rowIds?.length ?? plan.rows.length} rows.`);
            onRefresh();
          }}
        />
      )}
      {addColOpen && target.mode === "internal" && (
        <AddColumnDialog
          onClose={() => setAddColOpen(false)}
          onAdd={async (col) => {
            await addWikiSheetColumnsApi(target.slug, sheet.id, [col]);
            onRefresh();
          }}
        />
      )}
      {mobileRow && (
        <RowEditDialog
          row={mobileRow}
          columns={columns}
          people={people}
          canEditCol={canEditCol}
          canDelete={canDelete(mobileRow)}
          onClose={() => setMobileRowId(null)}
          onSave={async (changes) => {
            for (const [colId, raw] of Object.entries(changes)) {
              const col = columns.find((c) => c.id === colId);
              if (!col) continue;
              const ok = await saveCell(mobileRow, col, raw);
              if (!ok) return false;
            }
            return true;
          }}
          onDelete={() => {
            setMobileRowId(null);
            void bulk("delete", [mobileRow.id]);
          }}
        />
      )}
    </section>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "idle" || state.kind === "error") return null;
  return (
    <span className="text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase" style={{ fontFamily: MONO }} role="status">
      {state.kind === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}

function BoardCell({
  row,
  internal,
  canSend,
  slug,
  busy,
  onSend,
}: {
  row: WikiSheetRow;
  internal: boolean;
  canSend: boolean;
  slug: string | null;
  busy: boolean;
  onSend: () => void;
}) {
  // A task that has gone missing reads REVIEWING; the team may send it again.
  const resendable = row.taskId && row.stage === "REVIEWING" && internal;
  if (row.taskId && !resendable) {
    return (
      <>
        <StageChip stage={row.stage} />
        {internal && slug && (
          <a
            href={`/app/portal/${slug}/tasks`}
            className="truncate text-[11px] text-[var(--text-3)] underline underline-offset-2 hover:text-[var(--text-1)]"
            title={row.assignees.length ? `On the board · ${row.assignees.join(", ")}` : "Open the board"}
          >
            {row.assignees[0] ?? "Board"}
          </a>
        )}
      </>
    );
  }
  if (!canSend) return <StageChip stage={row.stage} />;
  return (
    <button
      type="button"
      className="app-button app-button-secondary app-button-xs whitespace-nowrap"
      disabled={busy}
      onClick={onSend}
      title={resendable ? "Its task can't be found — send it again" : "Create a task for this row on the board"}
    >
      {resendable ? "Send again" : "Send to board"}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────── dialogs ── */

function ImportDialog({
  sheet,
  internal,
  canEditCol,
  onClose,
  onImport,
}: {
  sheet: WikiSheet;
  internal: boolean;
  canEditCol: (c: SheetColumn) => boolean;
  onClose: () => void;
  onImport: (plan: ReturnType<typeof planImport>) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [headers, setHeaders] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const grid = useMemo(() => (text.trim() ? parseDelimited(text) : []), [text]);
  const plan = useMemo(
    () =>
      grid.length
        ? planImport(grid, sheet.columns, { firstRowHeaders: headers, allowNewColumns: internal, isEditable: canEditCol })
        : null,
    [grid, sheet.columns, headers, internal, canEditCol],
  );
  const allCols = [...sheet.columns, ...(plan?.newColumns ?? [])];
  const mapped = (plan?.mapping ?? []).map((id) => allCols.find((c) => c.id === id) ?? null);

  return (
    <Modal open onClose={onClose} title="PASTE FROM A SPREADSHEET" panelClassName="app-dialog-fixed w-full max-w-3xl">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-[13px] text-[var(--text-3)]">
          Copy rows in Google Sheets or Excel and paste them here. Columns are matched to this sheet by their header.
          {internal ? " A header with no match becomes a new text column." : " Columns that don't match are skipped."}
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Pasted rows"
          placeholder={"Item\tType\tPriority\nPricing page\tPage\tHigh"}
          className="app-input min-h-[120px] w-full py-2 font-mono text-base leading-6 sm:text-[13px]"
        />
        <label className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
          <input type="checkbox" checked={headers} onChange={(e) => setHeaders(e.target.checked)} className="h-4 w-4" />
          First row is headers
        </label>
        {plan && (
          <>
            <p className="text-[12px] text-[var(--text-3)]" style={{ fontFamily: MONO }}>
              {plan.rows.length} ROWS
              {plan.newColumns.length ? ` · ${plan.newColumns.length} NEW COLUMNS` : ""}
              {plan.skippedColumns.length ? ` · SKIPPING ${plan.skippedColumns.join(", ").toUpperCase()}` : ""}
            </p>
            <div className="overflow-auto rounded-[6px] border border-[var(--border-1)]" data-import-preview>
              <table className="min-w-full text-[12px]">
                <thead className="bg-[var(--surface-1)]">
                  <tr>
                    {mapped.map((c, i) => (
                      <th
                        key={i}
                        className="px-2 py-1.5 text-left text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap text-[var(--text-3)] uppercase"
                        style={{ fontFamily: MONO }}
                      >
                        {c ? c.title : "— skipped"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.slice(0, 8).map((cells, r) => (
                    <tr key={r} className="border-t border-[var(--border-1)]">
                      {mapped.map((c, i) => (
                        <td key={i} className="max-w-[220px] truncate px-2 py-1.5 text-[var(--text-2)]">
                          {c ? cellText(c, cells[c.id]) : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.problems.length > 0 && (
              <ul className="space-y-0.5 text-[12px] text-[var(--warning-500)]">
                {plan.problems.slice(0, 6).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </>
        )}
        {error && <p className="text-[12px] text-[var(--danger-500)]">{error}</p>}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-1)] px-4 py-3">
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="app-button app-button-primary app-button-sm"
          disabled={!plan || plan.rows.length === 0 || busy}
          onClick={async () => {
            if (!plan) return;
            setBusy(true);
            setError(null);
            try {
              await onImport(plan);
              onClose();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Import {plan?.rows.length ?? 0} rows
        </button>
      </div>
    </Modal>
  );
}

function AddColumnDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (col: { title: string; type: SheetColumnType; options?: string[]; clientEditable: boolean }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<SheetColumnType>("text");
  const [options, setOptions] = useState("");
  const [clientEditable, setClientEditable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="ADD A COLUMN" panelClassName="w-full max-w-md">
      <form
        className="space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await onAdd({
              title: title.trim(),
              type,
              options: type === "select" ? options.split(/[,\n]/).map((o) => o.trim()).filter(Boolean) : undefined,
              clientEditable,
            });
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-[12px] text-[var(--text-3)]">
          Title
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={SHEET_LIMITS.maxColumnTitle} className="app-input mt-1 w-full text-base sm:text-sm" />
        </label>
        <label className="block text-[12px] text-[var(--text-3)]">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as SheetColumnType)} className="app-input app-select-chevron mt-1 w-full pr-9 text-base sm:text-sm">
            {COLUMN_TYPES.map((t) => (
              <option key={t} value={t}>
                {COLUMN_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        {type === "select" && (
          <label className="block text-[12px] text-[var(--text-3)]">
            Options (comma-separated)
            <input value={options} onChange={(e) => setOptions(e.target.value)} className="app-input mt-1 w-full text-base sm:text-sm" placeholder="Low, Medium, High" />
          </label>
        )}
        <label className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
          <input type="checkbox" checked={clientEditable} onChange={(e) => setClientEditable(e.target.checked)} className="h-4 w-4" />
          The client can edit this column
        </label>
        {error && <p className="text-[12px] text-[var(--danger-500)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="app-button app-button-primary app-button-sm" disabled={busy || !title.trim()}>
            Add column
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Phone: edit one row as a form. Saves each changed field through the same per-cell path. */
function RowEditDialog({
  row,
  columns,
  people,
  canEditCol,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: {
  row: WikiSheetRow;
  columns: SheetColumn[];
  people: string[];
  canEditCol: (c: SheetColumn) => boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (changes: Record<string, string | boolean>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      columns.map((c) => [c.id, c.type === "checkbox" ? row.cells[c.id] === true : draftFor(c, row.cells[c.id])]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listId = `sheet-row-people-${row.id}`;
  return (
    <Modal open onClose={onClose} title="EDIT ROW" panelClassName="app-dialog-fixed w-full max-w-lg">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {columns.map((c) => {
          const editable = canEditCol(c);
          const v = values[c.id];
          const set = (nv: string | boolean) => setValues((s) => ({ ...s, [c.id]: nv }));
          return (
            <label key={c.id} className="block">
              <span className="text-[10px] tracking-[0.08em] text-[var(--text-3)] uppercase" style={{ fontFamily: MONO }}>
                {c.title}
                {!editable && " · read-only"}
              </span>
              {c.type === "checkbox" ? (
                <input type="checkbox" disabled={!editable} checked={v === true} onChange={(e) => set(e.target.checked)} className="mt-1 block h-5 w-5" />
              ) : c.type === "select" ? (
                <select disabled={!editable} value={String(v)} onChange={(e) => set(e.target.value)} className="app-input app-select-chevron mt-1 w-full pr-9 text-base">
                  <option value="">—</option>
                  {(c.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : c.type === "long_text" ? (
                <textarea disabled={!editable} value={String(v)} onChange={(e) => set(e.target.value)} className="app-input mt-1 min-h-[96px] w-full py-2 text-base leading-6" />
              ) : (
                <input
                  disabled={!editable}
                  type={c.type === "date" ? "date" : "text"}
                  inputMode={c.type === "number" ? "decimal" : c.type === "link" ? "url" : undefined}
                  list={c.type === "person" ? listId : undefined}
                  value={String(v)}
                  onChange={(e) => set(e.target.value)}
                  className="app-input mt-1 w-full text-base"
                />
              )}
            </label>
          );
        })}
        <datalist id={listId}>
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {error && <p className="text-[13px] text-[var(--danger-500)]">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border-1)] px-4 py-3">
        {canDelete && (
          <button type="button" className="app-button app-button-tertiary app-button-sm text-[var(--danger-500)]" onClick={onDelete}>
            Remove row
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="app-button app-button-primary app-button-sm"
            disabled={busy}
            onClick={async () => {
              const changes: Record<string, string | boolean> = {};
              for (const c of columns) {
                if (!canEditCol(c)) continue;
                const before = c.type === "checkbox" ? row.cells[c.id] === true : draftFor(c, row.cells[c.id]);
                if (values[c.id] === before) continue;
                const res = coerceCellValue(c, values[c.id]);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                changes[c.id] = values[c.id];
              }
              setBusy(true);
              const ok = await onSave(changes);
              setBusy(false);
              if (ok) onClose();
              else setError("Some changes couldn't be saved — see the message above the sheet.");
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
