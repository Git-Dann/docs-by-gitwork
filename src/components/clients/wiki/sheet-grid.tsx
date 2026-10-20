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
 *
 * §73.1 adds, Google-Sheets style: drag a row by its handle to reorder (team only, and only
 * while nothing filters the rows — the order of a filtered subset is ambiguous); drag a
 * column header's right edge or a row's bottom edge to resize (double-click to auto-fit a
 * column or reset a row); a real people picker for person columns; and media cells.
 * The team's resizes are saved for everyone; a client's stay in their own browser.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  Bars2Icon,
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
  reorderWikiSheetRowsApi,
  setWikiSheetRowHeightApi,
  updateWikiSheetCellsApi,
  updateWikiSheetColumnApi,
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
  estimateColumnWidth,
  exportSheet,
  parseDelimited,
  planImport,
  rowSearchText,
  sameCellValue,
  titleColumn,
} from "@/lib/wiki-sheets";
import {
  clampColumnWidth,
  clampRowHeight,
  moveRow,
  readLocalLayout,
  writeLocalLayout,
  type LocalSheetLayout,
} from "@/lib/wiki-sheet-layout";
import { coerceMedia, isMediaList } from "@/lib/wiki-sheet-media";
import {
  UNASSIGNED,
  ageLabel,
  assigneeOptions,
  isTaskOverdue,
  matchesAssignee,
  shortDate,
  stageSummary,
} from "@/lib/wiki-sheet-board";
import { STAGE_HINT, STAGE_LABEL, STAGE_ORDER, STAGE_STYLE, type RequestStage } from "@/lib/wiki-request-stage";
import type {
  SheetCellValue,
  SheetColumn,
  SheetColumnType,
  SheetMediaItem,
  SheetPerson,
  SheetTaskPerson,
  WikiSheet,
  WikiSheetRow,
} from "@/types/wiki-sheets";
import { PersonPicker, PersonValue } from "./sheet-person";
import { MediaChips, MediaListEditor, MediaViewer } from "./sheet-media";

/** Rows rendered at once; "Show more" adds this many. 2,000 live inputs would be slow. */
const CHUNK = 200;
const BOARD_W = 252;
/** Height of an auto (single-line) row. */
const AUTO_ROW_H = 36;
/** Persist a resize this long after the last pointer-up on the same column/row. */
const RESIZE_SAVE_MS = 350;
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
  /** Who the person picker offers — this side's directory (§73.1). Never carries emails. */
  people: SheetPerson[];
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

/**
 * A value as it reads in the grid / a card. `wrap` = the row has a set height, so text
 * wraps inside it instead of truncating to one line.
 */
function CellValue({
  column,
  value,
  wrap = false,
  mediaMax = 2,
  onOpenMedia,
}: {
  column: SheetColumn;
  value: SheetCellValue | undefined;
  wrap?: boolean;
  mediaMax?: number;
  onOpenMedia?: (items: SheetMediaItem[], index: number) => void;
}) {
  if (value === undefined) return <span className="text-[var(--text-4)]" aria-hidden="true" />;
  if (column.type === "person") return <PersonValue value={value} wrap={wrap} />;
  if (column.type === "media") {
    return isMediaList(value) ? (
      <MediaChips items={value} max={mediaMax} wrap={wrap} onOpen={(i) => onOpenMedia?.(value, i)} />
    ) : null;
  }
  if (typeof value === "object") return null;
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
        <span
          className="inline-flex max-w-full truncate rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[12px] text-[var(--text-2)] ring-1 ring-[var(--border-1)]"
          data-full-text={String(value)}
        >
          {String(value)}
        </span>
      );
    case "number":
      return (
        <span className="block truncate text-right tabular-nums" data-full-text={cellText(column, value)}>
          {cellText(column, value)}
        </span>
      );
    default: {
      const text = cellText(column, value);
      return (
        // No native `title`: its ~1s delay is the browser's. The grid shows `data-full-text` in its
        // own tooltip, only when the value is actually cut off (§73.1).
        <span className={wrap ? "block break-words whitespace-pre-wrap" : "block truncate"} data-full-text={text}>
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
  hover,
  label,
}: {
  anchor: HTMLElement | null;
  width: number;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Hover popovers keep themselves open while the pointer is over the panel. */
  hover?: { onEnter: () => void; onLeave: () => void };
  label?: string;
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
      const w = Math.min(width, vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - w - 8));
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
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onDismiss, anchor]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[60] rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: `min(${width}px, calc(100vw - 16px))` }}
      data-sheet-popover
      role={label ? "dialog" : undefined}
      aria-label={label}
      onMouseEnter={hover?.onEnter}
      onMouseLeave={hover?.onLeave}
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * The truncated-value tooltip: portalled to <body> (the grid's scroller and `.widget-card`
 * would clip it — §45.2), below the cell or above when there's no room, ≤420px and wrapping.
 */
type TipState = { anchor: HTMLElement; text: string } | null;

/**
 * The tooltip's state, outside React state. `aria-describedby` is set on the cell directly
 * (and removed on hide), so screen readers get the same link a re-render would have given.
 * Scroll or any key hides it.
 */
function createTipStore(id: string) {
  let state: TipState = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let warmUntil = 0;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  const set = (next: TipState) => {
    if (state?.anchor && state.anchor !== next?.anchor) state.anchor.removeAttribute("aria-describedby");
    state = next;
    if (next) next.anchor.setAttribute("aria-describedby", id);
    emit();
  };
  const hide = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (state) warmUntil = Date.now() + 300;
    if (state) set(null);
  };
  const onAway = () => hide();
  return {
    id,
    get: () => state,
    subscribe: (f: () => void) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    showSoon: (anchor: HTMLElement, text: string) => {
      if (timer) clearTimeout(timer);
      const warm = state !== null || Date.now() < warmUntil;
      timer = setTimeout(() => {
        timer = null;
        set({ anchor, text });
      }, warm ? 0 : 150);
    },
    hide,
    listen: () => {
      window.addEventListener("scroll", onAway, true);
      window.addEventListener("keydown", onAway, true);
      return () => {
        window.removeEventListener("scroll", onAway, true);
        window.removeEventListener("keydown", onAway, true);
      };
    },
    dispose: () => {
      if (timer) clearTimeout(timer);
      if (state) set(null);
    },
  };
}

function CellTooltipHost({ store }: { store: ReturnType<typeof createTipStore> }) {
  const tip = useSyncExternalStore(store.subscribe, store.get, () => null);
  useEffect(() => (tip ? store.listen() : undefined), [tip, store]);
  return tip ? <CellTooltip id={store.id} anchor={tip.anchor} text={tip.text} /> : null;
}

function CellTooltip({ id, anchor, text }: { id: string; anchor: HTMLElement; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 40;
    const w = ref.current?.offsetWidth ?? 200;
    const vw = document.documentElement.clientWidth;
    const below = r.bottom + 4;
    const top = below + h > window.innerHeight - 8 && r.top - h - 4 > 8 ? r.top - h - 4 : below;
    setPos({ top, left: Math.max(8, Math.min(r.left, vw - w - 8)) });
  }, [anchor, text]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      data-sheet-tooltip
      className="pointer-events-none fixed z-[80] max-w-[min(420px,calc(100vw-16px))] rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[12px] leading-5 break-words whitespace-pre-wrap text-[var(--text-1)] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.2)]"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      {text}
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
  value,
  anchor,
  people,
  onDraft,
  onCommit,
  onCancel,
}: {
  column: SheetColumn;
  draft: string;
  /** The stored value — what the person picker and the media editor start from. */
  value: SheetCellValue | undefined;
  anchor: HTMLElement | null;
  people: SheetPerson[];
  onDraft: (v: string) => void;
  onCommit: (raw: CommitValue, move: "down" | "right" | "left" | "none") => void;
  onCancel: () => void;
}) {
  if (column.type === "person") {
    return (
      <PersonPicker
        people={people}
        value={value}
        label={column.title}
        autoFocus
        onPick={(p) => onCommit(p, "down")}
        onCancel={onCancel}
      />
    );
  }

  if (column.type === "media") {
    return <MediaCellEditor column={column} value={value} anchor={anchor} onCommit={onCommit} onCancel={onCancel} />;
  }

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
    </>
  );
}

/** What an editor hands back: the raw draft (text types) or a ready value (person, media). */
type CommitValue = string | boolean | SheetCellValue | null;

/** The media cell's editor: a portalled popover with the link list and Save / Cancel. */
function MediaCellEditor({
  column,
  value,
  anchor,
  onCommit,
  onCancel,
}: {
  column: SheetColumn;
  value: SheetCellValue | undefined;
  anchor: HTMLElement | null;
  onCommit: (raw: CommitValue, move: "down" | "right" | "left" | "none") => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<SheetMediaItem[]>(() => (isMediaList(value) ? value : []));
  return (
    <CellPopover anchor={anchor} width={380} onDismiss={onCancel}>
      <div
        className="p-1"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <MediaListEditor value={items} label={`"${column.title}"`} onChange={setItems} autoFocus />
        <div className="mt-2 flex justify-end gap-2 border-t border-[var(--border-1)] pt-2">
          <button type="button" className="app-button app-button-secondary app-button-xs" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="app-button app-button-primary app-button-xs"
            onClick={() => onCommit(items.length ? items : null, "none")}
          >
            Save
          </button>
        </div>
      </div>
    </CellPopover>
  );
}

/**
 * A grid row that can be dragged by its handle (team only). The row is the sortable node;
 * only the handle starts a drag, so clicking and typing in cells is untouched.
 */
function SortableRow({
  id,
  disabled,
  className,
  style,
  rowIndex,
  children,
}: {
  id: string;
  disabled: boolean;
  className: string;
  style: React.CSSProperties;
  rowIndex: number;
  children: (handle: {
    ref: (el: HTMLElement | null) => void;
    props: Record<string, unknown>;
    dragging: boolean;
  }) => React.ReactNode;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      role="row"
      aria-rowindex={rowIndex}
      data-row-id={id}
      className={`${className} ${isDragging ? "relative z-30 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.25)]" : ""}`}
      style={{
        ...style,
        // Vertical only: a row never wanders sideways out of its columns.
        transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
        transition,
      }}
    >
      {children({ ref: setActivatorNodeRef, props: { ...attributes, ...listeners }, dragging: isDragging })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── grid ── */

export function SheetGrid({ sheet, target, mode, people, featureBlocks, onRefresh, headerExtra, index }: SheetGridProps) {
  const internal = mode === "internal";
  const columns = sheet.columns;
  // The leading column: select box + edited-by dot, plus the drag handle for the team.
  const SELECT_W = internal ? 64 : 44;

  // Optimistic rows. `pending` holds cell writes still in flight, so a refetch that lands
  // before a save completes can't put the old value back; `pendingOrder` does the same for
  // a row move, and `pendingHeights` for a row resize.
  const pending = useRef(new Map<string, SheetCellValue | null>());
  const pendingOrder = useRef<string[] | null>(null);
  const pendingHeights = useRef(new Map<string, number | null>());
  const overlay = useCallback(
    (rows: WikiSheetRow[]) => {
      let out = rows.map((r) => {
        let cells = r.cells;
        for (const c of columns) {
          const key = `${r.id}:${c.id}`;
          if (!pending.current.has(key)) continue;
          const v = pending.current.get(key);
          cells = { ...cells };
          if (v === null || v === undefined) delete cells[c.id];
          else cells[c.id] = v;
        }
        const h = pendingHeights.current.has(r.id) ? (pendingHeights.current.get(r.id) ?? null) : r.height;
        return cells === r.cells && h === r.height ? r : { ...r, cells, height: h };
      });
      const order = pendingOrder.current;
      if (order) {
        const pos = new Map(order.map((id, i) => [id, i]));
        const live = out.filter((r) => !r.deletedAt).sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
        out = [...live, ...out.filter((r) => r.deletedAt)];
      }
      return out;
    },
    [columns],
  );
  const [rows, setRows] = useState<WikiSheetRow[]>(() => sheet.rows);
  useEffect(() => {
    setRows(overlay(sheet.rows));
  }, [sheet.rows, overlay]);

  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  const [assignee, setAssignee] = useState<string>("all");
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
  const [viewer, setViewer] = useState<{ items: SheetMediaItem[]; index: number } | null>(null);

  /* ── the truncated-value tooltip (§73.1) ──
   * A native `title` waits ~1s and the browser owns that delay. This one appears after
   * 150ms — instantly when moving between cells while one is showing — and only when the
   * value is actually cut off. Mouse only: on touch the phone layout shows the full text.
   * Its state lives in a tiny store OUTSIDE the grid's React state: showing a tooltip must
   * not re-render 200 rows of cells (measured: that alone added ~100ms in dev). */
  const tipId = `sheet-tip-${sheet.id}`;
  const tips = useMemo(() => createTipStore(tipId), [tipId]);
  useEffect(() => () => tips.dispose(), [tips]);
  const onCellPointerEnter = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || editing) return;
    const cell = e.currentTarget;
    const inner = cell.querySelector<HTMLElement>("[data-cell-content] [data-full-text]");
    const text = inner?.dataset.fullText?.trim();
    if (!inner || !text || (inner.scrollWidth <= inner.clientWidth + 1 && inner.scrollHeight <= inner.clientHeight + 1)) {
      tips.hide();
      return;
    }
    tips.showSoon(cell, text);
  };

  /* ── layout: widths, heights (§73.1) ──
   * The team's resizes are saved for everyone (column JSON `width`, `WikiSheetRow.height`);
   * `colOverride` holds a width between the drag and the refetch that carries it. A
   * client's resizes live in THEIR browser only (`local`), never sent — the client's routes
   * refuse a width or height. `drag` is the live size while a pointer is down. */
  const [colOverride, setColOverride] = useState<Record<string, number>>({});
  const [local, setLocal] = useState<LocalSheetLayout>({ cols: {}, rows: {} });
  const [drag, setDrag] = useState<{ kind: "col" | "row"; id: string; size: number } | null>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (!internal) setLocal(readLocalLayout(sheet.id));
  }, [internal, sheet.id]);
  useEffect(() => {
    const timers = saveTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  // A saved width that has come back in the sheet no longer needs holding.
  useEffect(() => {
    setColOverride((o) => {
      const next = Object.fromEntries(Object.entries(o).filter(([id, w]) => columns.find((c) => c.id === id)?.width !== w));
      return Object.keys(next).length === Object.keys(o).length ? o : next;
    });
  }, [columns]);
  const canEditCol = useCallback(
    (c: SheetColumn) => internal || clientCanEditColumn(sheet, c),
    [internal, sheet],
  );
  /** Room the header needs beyond its title: the "· title" marker and the lock. */
  const headerRoom = useCallback(
    (c: SheetColumn) =>
      (internal && c.id === titleColumn(columns, sheet.titleColumnId)?.id ? 48 : 0) + (canEditCol(c) ? 0 : 20),
    [internal, columns, sheet.titleColumnId, canEditCol],
  );
  // A column with no saved width sizes to its content (header + the first 200 rows), within
  // its type's bounds — a "01, 02, 03" ref column comes out narrow, not a flat 200px. A
  // saved width (the team's resize) always wins; a client's own resize wins over both.
  const autoWidths = useMemo(() => {
    const sample = rows.filter((r) => !r.deletedAt).slice(0, 200);
    return Object.fromEntries(
      columns.map((c) => [c.id, estimateColumnWidth(c, sample.map((r) => r.cells[c.id]), { headerExtra: headerRoom(c) })]),
    ) as Record<string, number>;
  }, [columns, rows, headerRoom]);
  const widthOf = useCallback(
    (c: SheetColumn): number => {
      if (drag?.kind === "col" && drag.id === c.id) return drag.size;
      return local.cols[c.id] ?? colOverride[c.id] ?? c.width ?? autoWidths[c.id] ?? columnWidth(c);
    },
    [drag, local.cols, colOverride, autoWidths],
  );
  /** A row's height in px, or null for auto. A client's local 0 = "auto here". */
  const heightOf = (r: WikiSheetRow): number | null => {
    if (drag?.kind === "row" && drag.id === r.id) return drag.size;
    if (r.id in local.rows) return local.rows[r.id] || null;
    return r.height;
  };

  // Pin the first column and Board only when there's room left for the data between them.
  // At 768px the wiki's content column is ~440px — pinned, 44 + 200 + 150px of fixed
  // columns left ~44px of window onto the data, so every other column was unreachable
  // behind them (found by the headless check, not by any test). Unpinned, it all scrolls.
  const [pin, setPin] = useState(true);
  // Uses the LIVE width, so the ≥240px rule still holds after the first column is resized.
  const pinnedWidth = SELECT_W + (columns[0] ? widthOf(columns[0]) : 0) + BOARD_W;
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
    const byAssignee = byStage.filter((r) => matchesAssignee(r, assignee));
    return fuzzySearch(byAssignee, query, (r) => [rowSearchText(columns, r.cells)]);
  }, [rows, live, showDeleted, stage, assignee, query, columns]);
  const assignees = useMemo(() => assigneeOptions(live), [live]);
  const summary = useMemo(() => stageSummary(live), [live]);
  const shown = visible.slice(0, limit);
  const stagesPresent = useMemo(
    () => STAGE_ORDER.filter((s) => live.some((r) => r.stage === s)),
    [live],
  );

  /* ── saving ── */

  const saveCell = useCallback(
    async (row: WikiSheetRow, column: SheetColumn, raw: CommitValue) => {
      const res = coerceCellValue(column, raw);
      if (!res.ok) {
        setSave({ kind: "error", message: res.error });
        return false;
      }
      const before = row.cells[column.id];
      const next = res.value;
      if (sameCellValue(before, next)) return true;
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

  const commit = async (rawDraft: CommitValue, dir: "down" | "right" | "left" | "none") => {
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
    // Alt+↑/↓ moves the row — the keyboard route to what the drag handle does.
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (!canReorder || row.deletedAt) {
        if (reorderBlockedReason) setNotice(reorderBlockedReason);
        return;
      }
      moveRowBy(row.id, e.key === "ArrowUp" ? -1 : 1);
      requestAnimationFrame(() => cellRefs.current.get(`${row.id}:${col}`)?.focus({ preventScroll: false }));
      return;
    }
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
    if (
      isPrintable(e) &&
      column &&
      !["checkbox", "select", "date", "person", "media"].includes(column.type)
    ) {
      e.preventDefault();
      startEdit(row, col, e.key);
    }
  };

  /** Pasting a URL into a selected media cell adds it to the cell's links. */
  const onCellPaste = (e: React.ClipboardEvent, row: WikiSheetRow, col: number) => {
    const column = columns[col];
    if (editing || !column || column.type !== "media" || !canEditCol(column) || row.deletedAt) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text.trim()) return;
    e.preventDefault();
    const existing = row.cells[column.id];
    const res = coerceMedia([...(isMediaList(existing) ? existing : []), ...text.split(/\s+/).filter(Boolean)], `"${column.title}"`);
    if (!res.ok) {
      setSave({ kind: "error", message: res.error });
      return;
    }
    void saveCell(row, column, res.value);
  };

  /* ── reordering rows (team only, §73.1) ── */

  // The order of a filtered or searched subset is ambiguous (move B above D among 3 shown
  // rows — where do the 40 hidden ones go?), so a drag only exists over the whole sheet.
  const filtered = Boolean(query.trim()) || stage !== "all" || assignee !== "all" || showDeleted;
  const canReorder = internal && target.mode === "internal" && !filtered;
  const reorderBlockedReason = !internal
    ? null
    : filtered
      ? "Clear the search and filter to reorder rows"
      : null;

  const reorder = async (nextLive: string[]) => {
    if (target.mode !== "internal") return;
    const before = rows;
    pendingOrder.current = nextLive;
    setRows((rs) => overlay(rs));
    try {
      await reorderWikiSheetRowsApi(target.slug, sheet.id, nextLive);
      pendingOrder.current = null;
      onRefresh();
    } catch (err) {
      pendingOrder.current = null;
      setRows(before);
      setNotice(`Couldn't move the row — ${errorMessage(err)}`);
    }
  };

  const moveRowBy = (rowId: string, delta: number) => {
    const ids = live.map((r) => r.id);
    const i = ids.indexOf(rowId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    void reorder(moveRow(ids, rowId, ids[j]));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const over = e.over?.id;
    if (!over || over === e.active.id || !canReorder) return;
    void reorder(moveRow(live.map((r) => r.id), String(e.active.id), String(over)));
  };

  /* ── resizing columns and rows (§73.1) ── */

  /** Save a size: the team's for everyone (debounced per column/row), a client's locally. */
  const commitSize = (kind: "col" | "row", id: string, size: number | null) => {
    if (!internal) {
      setLocal((l) => {
        const next: LocalSheetLayout =
          kind === "col"
            ? { ...l, cols: { ...l.cols, [id]: size ?? columnWidth(columns.find((c) => c.id === id)!) } }
            : { ...l, rows: { ...l.rows, [id]: size ?? 0 } };
        writeLocalLayout(sheet.id, next);
        return next;
      });
      return;
    }
    if (target.mode !== "internal") return;
    const key = `${kind}:${id}`;
    if (kind === "col") {
      const width = clampColumnWidth(size ?? 0);
      setColOverride((o) => ({ ...o, [id]: width }));
    } else {
      pendingHeights.current.set(id, size);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, height: size } : r)));
    }
    const timers = saveTimers.current;
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(async () => {
        timers.delete(key);
        try {
          if (kind === "col") {
            await updateWikiSheetColumnApi(target.slug, sheet.id, id, { width: clampColumnWidth(size ?? 0) });
          } else {
            await setWikiSheetRowHeightApi(target.slug, sheet.id, id, size);
            pendingHeights.current.delete(id);
          }
          onRefresh();
        } catch (err) {
          if (kind === "col") setColOverride((o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== id)));
          else {
            pendingHeights.current.delete(id);
            setRows(overlay(sheet.rows));
          }
          setNotice(`Couldn't save that size — ${errorMessage(err)}`);
        }
      }, RESIZE_SAVE_MS),
    );
  };

  /**
   * Drag a grid line. Pointer capture keeps the move/up events on the handle even when the
   * pointer leaves it (mouse and touch alike); moves are coalesced to one state update per
   * animation frame; the size is saved once, on pointer-up.
   */
  const startResize = (e: React.PointerEvent<HTMLElement>, kind: "col" | "row", id: string, startSize: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const origin = kind === "col" ? e.clientX : e.clientY;
    let latest = startSize;
    let frame = 0;
    const onMove = (ev: PointerEvent) => {
      const d = (kind === "col" ? ev.clientX : ev.clientY) - origin;
      latest = kind === "col" ? clampColumnWidth(startSize + d) : (clampRowHeight(startSize + d) ?? startSize);
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          setDrag({ kind, id, size: latest });
        });
      }
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      if (frame) cancelAnimationFrame(frame);
      setDrag(null);
      if (latest !== startSize) commitSize(kind, id, latest);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  /**
   * Double-click a column edge: fit it to its content with the same estimate a column with no
   * saved width gets — over every row this time, not a sample.
   */
  const autoFit = (colId: string) => {
    const c = columns.find((x) => x.id === colId);
    if (!c) return;
    const all = rows.filter((r) => !r.deletedAt).map((r) => r.cells[c.id]);
    commitSize("col", colId, estimateColumnWidth(c, all, { headerExtra: headerRoom(c), sample: all.length }));
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
          task: null,
          createdByKind: internal ? "TEAM" : "CLIENT",
          createdByName: null,
          createdByWikiUserId: null,
          mine: !internal,
          updatedByKind: internal ? "TEAM" : "CLIENT",
          updatedByName: null,
          height: null,
          deletedAt: null,
          updatedAt: new Date().toISOString(),
        };
        setRows((rs) => [...rs.filter((r) => !r.deletedAt), blank, ...rs.filter((r) => r.deletedAt)]);
        setQuery("");
        setStage("all");
        setAssignee("all");
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

  const gridTemplate = `${SELECT_W}px ${columns.map((c) => `${widthOf(c)}px`).join(" ")} ${BOARD_W}px`;
  const minWidth = SELECT_W + columns.reduce((n, c) => n + widthOf(c), 0) + BOARD_W;
  // Where the live guide line sits while a column edge is being dragged.
  const guideLeft =
    drag?.kind === "col"
      ? SELECT_W + columns.slice(0, columns.findIndex((c) => c.id === drag.id) + 1).reduce((n, c) => n + widthOf(c), 0)
      : null;
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
            {assignees.length > 0 && (
              <select
                value={assignee}
                onChange={(e) => {
                  setAssignee(e.target.value);
                  setLimit(CHUNK);
                }}
                aria-label="Filter by who is on it"
                className="app-input app-select-chevron h-8 w-auto max-w-[180px] py-0 pr-8 pl-2 text-base sm:text-[13px]"
              >
                <option value="all">Anyone</option>
                {assignees.map((a) => (
                  <option key={a} value={a}>
                    {a === UNASSIGNED ? "Unassigned" : a}
                  </option>
                ))}
              </select>
            )}
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

      {/* How the sheet stands on the board, at a glance. Click a count to filter by it. */}
      {summary.some((x) => x.stage) && (
        <div
          className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-[var(--border-1)] px-4 py-2 text-[11px] text-[var(--text-3)]"
          style={{ fontFamily: MONO }}
          aria-label="Rows by board stage"
          data-stage-summary
        >
          {summary.map((x, i) => {
            const value: StageFilter = x.stage ?? "none";
            const on = stage === value;
            return (
              <span key={value} className="inline-flex items-center">
                {i > 0 && <span className="px-1 text-[var(--text-4)]" aria-hidden="true">·</span>}
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setStage(on ? "all" : value);
                    setLimit(CHUNK);
                  }}
                  className={`rounded-[4px] px-1 tracking-[0.06em] uppercase hover:text-[var(--text-1)] ${on ? "bg-[var(--surface-1)] text-[var(--text-1)]" : ""}`}
                >
                  <span className="font-semibold text-[var(--text-1)]">{x.count}</span> {x.label}
                </button>
              </span>
            );
          })}
        </div>
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
            <div role="grid" aria-label={sheet.title} aria-rowcount={visible.length + 1} className="relative" style={{ minWidth }}>
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
                {columns.map((c, ci) => {
                  const resizing = drag?.kind === "col" && drag.id === c.id;
                  return (
                    <div
                      key={c.id}
                      role="columnheader"
                      data-col-head={c.id}
                      title={`${c.title} · ${COLUMN_TYPE_LABEL[c.type]}${!canEditCol(c) ? " · read-only" : ""}`}
                      className={`group/head flex min-w-0 items-center gap-1.5 border-l border-[var(--border-1)] px-2 py-2 text-[10px] font-semibold tracking-[0.1em] text-[var(--text-3)] uppercase ${
                        ci === 0 && pin ? "sticky z-10 bg-[var(--surface-1)]" : "relative"
                      } ${c.type === "number" ? "justify-end" : ""}`}
                      style={{ fontFamily: MONO, ...(ci === 0 && pin ? { left: SELECT_W } : {}) }}
                    >
                      <span className="truncate" data-head-title>
                        {c.title}
                      </span>
                      {c.id === titleCol?.id && internal && <span className="shrink-0 text-[var(--text-4)]">· title</span>}
                      {!canEditCol(c) && (
                        <span className="shrink-0 text-[var(--text-4)]" aria-label="read-only">
                          🔒
                        </span>
                      )}
                      {/* The grid line itself is the handle: drag to resize, double-click to fit. */}
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize column ${c.title}`}
                        aria-valuenow={widthOf(c)}
                        aria-valuemin={SHEET_LIMITS.minWidth}
                        aria-valuemax={SHEET_LIMITS.maxWidth}
                        title={internal ? "Drag to resize · double-click to fit" : "Drag to resize (just for you) · double-click to fit"}
                        data-col-resize={c.id}
                        onPointerDown={(e) => startResize(e, "col", c.id, widthOf(c))}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          autoFit(c.id);
                        }}
                        className="absolute top-0 -right-[4px] z-20 flex h-full w-[8px] cursor-col-resize touch-none justify-center"
                      >
                        <span
                          className={`h-full w-[2px] transition-colors ${
                            resizing
                              ? "bg-[var(--brand-600,#1D4ED8)]"
                              : "bg-transparent group-hover/head:bg-[var(--border-2,rgba(0,0,0,0.2))] hover:!bg-[var(--brand-600,#1D4ED8)]"
                          }`}
                        />
                      </span>
                    </div>
                  );
                })}
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
                  {query || stage !== "all" || assignee !== "all" ? "No rows match." : showDeleted ? "No removed rows." : canAddRows ? "No rows yet — add one or paste from a spreadsheet." : "No rows yet."}
                </p>
              )}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={shown.map((r) => r.id)} strategy={verticalListSortingStrategy} disabled={!canReorder}>
              {shown.map((row, ri) => {
                const isSel = selected.has(row.id);
                const deleted = Boolean(row.deletedAt);
                const height = heightOf(row);
                const wrap = height !== null;
                const rowResizing = drag?.kind === "row" && drag.id === row.id;
                return (
                  <SortableRow
                    key={row.id}
                    id={row.id}
                    disabled={!canReorder || deleted}
                    rowIndex={ri + 2}
                    className={`group grid border-b border-[var(--border-1)] ${deleted ? "opacity-60" : ""} ${
                      isSel ? "bg-[var(--brand-50,rgba(29,78,216,0.06))]" : "bg-[var(--surface-0)]"
                    }`}
                    style={{ gridTemplateColumns: gridTemplate, ...(height !== null ? { height } : {}) }}
                  >
                    {(handle) => (
                      <>
                    <div
                      role="gridcell"
                      className={`${pin ? "sticky left-0" : "relative"} z-[5] flex items-center justify-between gap-1 px-1.5 ${isSel ? "bg-[var(--surface-1)]" : "bg-[var(--surface-0)]"}`}
                    >
                      {internal && (
                        <button
                          type="button"
                          ref={handle.ref}
                          {...handle.props}
                          disabled={!canReorder || deleted}
                          aria-label={`Move row ${ri + 1}${canReorder ? " — drag, or Alt+↑/↓ from a cell" : ""}`}
                          title={reorderBlockedReason ?? "Drag to move · Alt+↑/↓ from a cell"}
                          data-row-handle
                          className={`flex h-6 w-4 shrink-0 touch-none items-center justify-center rounded-[4px] text-[var(--text-4)] transition-opacity hover:text-[var(--text-1)] focus-visible:opacity-100 ${
                            handle.dragging ? "cursor-grabbing opacity-100" : canReorder && !deleted ? "cursor-grab opacity-0 group-hover:opacity-100" : "cursor-not-allowed opacity-0 group-hover:opacity-40"
                          }`}
                        >
                          <Bars2Icon className="h-3.5 w-3.5" />
                        </button>
                      )}
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
                      {/* The row's bottom grid line: drag to set a height, double-click for auto. */}
                      <span
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={`Resize row ${ri + 1}`}
                        aria-valuenow={height ?? AUTO_ROW_H}
                        aria-valuemin={SHEET_LIMITS.minRowHeight}
                        aria-valuemax={SHEET_LIMITS.maxRowHeight}
                        title={internal ? "Drag to resize · double-click for auto" : "Drag to resize (just for you) · double-click for auto"}
                        data-row-resize={row.id}
                        onPointerDown={(e) => {
                          const cellEl = e.currentTarget.parentElement;
                          startResize(e, "row", row.id, height ?? cellEl?.offsetHeight ?? AUTO_ROW_H);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          commitSize("row", row.id, null);
                        }}
                        className="absolute right-0 -bottom-[4px] left-0 z-20 flex h-[8px] cursor-row-resize touch-none items-center"
                      >
                        <span
                          className={`h-[2px] w-full transition-colors ${
                            rowResizing ? "bg-[var(--brand-600,#1D4ED8)]" : "bg-transparent hover:bg-[var(--brand-600,#1D4ED8)]"
                          }`}
                        />
                      </span>
                    </div>
                    {columns.map((c, ci) => {
                      const isActive = active?.rowId === row.id && active.col === ci;
                      const isEditing = editing?.rowId === row.id && editing.colId === c.id;
                      const editable = canEditCol(c) && !deleted;
                      const key = `${row.id}:${ci}`;
                      const popover = c.type === "select" || c.type === "long_text" || c.type === "media";
                      return (
                        <div
                          key={c.id}
                          role="gridcell"
                          data-col={c.id}
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
                          onPaste={(e) => onCellPaste(e, row, ci)}
                          onPointerEnter={onCellPointerEnter}
                          onPointerLeave={tips.hide}
                          className={`relative flex min-w-0 border-l border-[var(--border-1)] text-[13px] text-[var(--text-1)] outline-none ${
                            wrap ? "items-start overflow-hidden py-1.5" : "min-h-[36px] items-center"
                          } ${
                            ci === 0 ? `${pin ? "sticky" : ""} z-[5] font-medium ${isSel ? "bg-[var(--surface-1)]" : "bg-[var(--surface-0)]"}` : ""
                          } ${isEditing && !popover ? "p-0" : "px-2"} ${
                            isActive ? "ring-2 ring-inset ring-[var(--brand-600,#1D4ED8)]" : ""
                          } ${editable ? "cursor-cell" : "cursor-default text-[var(--text-2)]"}`}
                          style={ci === 0 && pin ? { left: SELECT_W } : undefined}
                        >
                          {isEditing && editing ? (
                            popover ? (
                              <>
                                <CellValue column={c} value={row.cells[c.id]} wrap={wrap} />
                                <CellEditor
                                  column={c}
                                  draft={editing.draft}
                                  value={row.cells[c.id]}
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
                                value={row.cells[c.id]}
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
                            <div className="min-w-0 flex-1" data-cell-content>
                              <CellValue
                                column={c}
                                value={row.cells[c.id]}
                                wrap={wrap}
                                mediaMax={Math.max(1, Math.floor((widthOf(c) - 40) / 120))}
                                onOpenMedia={(items, index) => setViewer({ items, index })}
                              />
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
                      </>
                    )}
                  </SortableRow>
                );
              })}
                </SortableContext>
              </DndContext>
              {guideLeft !== null && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 bottom-0 z-30 w-[2px] bg-[var(--brand-600,#1D4ED8)] opacity-60"
                  style={{ left: guideLeft - 1 }}
                  data-resize-guide
                />
              )}
            </div>
          </div>

          {/* ── Phone: one card per row, label/value pairs. Tap to edit. ── */}
          <ul className="divide-y divide-[var(--border-1)] sm:hidden" aria-label={`${sheet.title} rows`}>
            {shown.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-[var(--text-4)]">
                {query || stage !== "all" || assignee !== "all" ? "No rows match." : "No rows yet."}
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
                    {/* A div with a button role, not a <button>: the card holds links and
                        media chips of its own, and buttons can't nest. */}
                    <div
                      role="button"
                      tabIndex={row.deletedAt ? -1 : 0}
                      aria-disabled={Boolean(row.deletedAt) || undefined}
                      aria-label={`Edit ${title || "row"}`}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                      onClick={() => {
                        if (!row.deletedAt) setMobileRowId(row.id);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !row.deletedAt) {
                          e.preventDefault();
                          setMobileRowId(row.id);
                        }
                      }}
                    >
                      <span className="block text-[15px] font-medium break-words text-[var(--text-1)]">
                        {title || <span className="text-[var(--text-4)]">Untitled row</span>}
                      </span>
                      {rest.length > 0 && (
                        <dl className="mt-1.5 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                          {/* Six plain values at most, but a media column always shows — its chips are
                              the only way to the viewer on a phone. */}
                          {[...rest.filter((c) => c.type !== "media").slice(0, 6), ...rest.filter((c) => c.type === "media")].map((c) => (
                            <div key={c.id} className="contents">
                              <dt
                                className="truncate text-[10px] tracking-[0.08em] text-[var(--text-3)] uppercase leading-5"
                                style={{ fontFamily: MONO }}
                                title={c.title}
                              >
                                {c.title}
                              </dt>
                              <dd className="min-w-0 break-words text-[var(--text-2)]">
                                {["checkbox", "link", "select", "person", "media"].includes(c.type) ? (
                                  <CellValue
                                    column={c}
                                    value={row.cells[c.id]}
                                    wrap={c.type === "media" || c.type === "person"}
                                    onOpenMedia={(items, index) => setViewer({ items, index })}
                                  />
                                ) : (
                                  cellText(c, row.cells[c.id])
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
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
          people={people}
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
      <CellTooltipHost store={tips} />
      {viewer && <MediaViewer items={viewer.items} start={viewer.index} onClose={() => setViewer(null)} />}
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

function TaskAvatar({ person }: { person: SheetTaskPerson }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50,rgba(29,78,216,0.08))] text-[9px] font-semibold text-[var(--brand-600,#1D4ED8)] ring-2 ring-[var(--surface-0)]"
      style={{ fontFamily: MONO }}
    >
      {person.initials}
    </span>
  );
}

function DueLabel({ due, overdue }: { due: string; overdue: boolean }) {
  return (
    <span
      className={`shrink-0 text-[10px] tracking-[0.06em] uppercase ${overdue ? "font-semibold text-[var(--warning-500)]" : "text-[var(--text-3)]"}`}
      style={{ fontFamily: MONO }}
      title={overdue ? `Overdue — was due ${shortDate(due)}` : `Due ${shortDate(due)}`}
      data-due={overdue ? "overdue" : "due"}
    >
      {shortDate(due)}
    </span>
  );
}

/**
 * The Board column (§73.1): a linked row shows the task's stage, who is on it, its due date
 * and when it last moved — all derived from the live task, the same for the team and the
 * client except what `forPublicSheets` cut from the client's copy. Hover or tap for more.
 */
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const later = (fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  // A task that has gone missing reads REVIEWING with no assignee; the team may send it again.
  const resendable = row.taskId && !row.task && row.stage === "REVIEWING" && internal;
  if (row.taskId && row.task && !resendable) {
    const task = row.task;
    const overdue = isTaskOverdue(task, row.stage);
    const first = task.assignees[0];
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Board: ${row.stage ? STAGE_LABEL[row.stage] : "on the board"}${first ? `, ${task.assignees.map((a) => a.name).join(", ")}` : ", unassigned"}${task.dueDate ? `, due ${shortDate(task.dueDate)}` : ""}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[4px] text-left hover:bg-[var(--surface-1)]"
          onClick={() => setOpen((o) => !o)}
          onMouseEnter={() => later(() => setOpen(true), 350)}
          onMouseLeave={() => later(() => setOpen(false), 250)}
          data-board-trigger
        >
          <StageChip stage={row.stage} />
          {first ? (
            <span className="flex min-w-0 items-center gap-1">
              <span className="flex shrink-0 -space-x-1">
                {task.assignees.slice(0, 2).map((a) => (
                  <TaskAvatar key={a.name} person={a} />
                ))}
              </span>
              <span className="min-w-0 truncate text-[12px] text-[var(--text-2)]">
                {first.name.split(/\s+/)[0]}
                {task.assignees.length > 1 ? ` +${task.assignees.length - 1}` : ""}
              </span>
            </span>
          ) : (
            <span className="truncate text-[12px] text-[var(--text-4)]">Unassigned</span>
          )}
          {task.dueDate && row.stage !== "DONE" && <DueLabel due={task.dueDate} overdue={overdue} />}
        </button>
        {open && (
          <CellPopover
            anchor={triggerRef.current}
            width={280}
            label="Task on the board"
            onDismiss={() => setOpen(false)}
            hover={{ onEnter: cancel, onLeave: () => later(() => setOpen(false), 250) }}
          >
            <div className="space-y-2.5 p-1.5 text-[13px]" data-board-popover>
              {internal && task.title && <p className="font-medium break-words text-[var(--text-1)]">{task.title}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <StageChip stage={row.stage} />
                <span className="text-[11px] text-[var(--text-3)]">
                  {row.stage === "DONE" && task.completedAt
                    ? `Done ${shortDate(task.completedAt)}`
                    : task.startedAt
                      ? `Started ${ageLabel(task.startedAt)}`
                      : `Updated ${ageLabel(task.updatedAt)}`}
                </span>
              </div>
              <div>
                <p className="text-[10px] tracking-[0.08em] text-[var(--text-4)] uppercase" style={{ fontFamily: MONO }}>
                  On it
                </p>
                {task.assignees.length ? (
                  <ul className="mt-1 space-y-1">
                    {task.assignees.map((a) => (
                      <li key={a.name} className="flex items-center gap-1.5 text-[var(--text-2)]">
                        <TaskAvatar person={a} />
                        <span className="min-w-0 truncate">{a.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[var(--text-4)]">Unassigned</p>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-3)]">
                <span>
                  Due{" "}
                  {task.dueDate ? (
                    <span className={overdue ? "font-semibold text-[var(--warning-500)]" : "text-[var(--text-2)]"}>
                      {shortDate(task.dueDate)}
                      {overdue ? " · overdue" : ""}
                    </span>
                  ) : (
                    <span className="text-[var(--text-4)]">—</span>
                  )}
                </span>
                <span>Updated {ageLabel(task.updatedAt)}</span>
              </div>
              {internal && slug && (
                <a
                  href={`/app/portal/${slug}/tasks`}
                  className="app-button app-button-secondary app-button-xs"
                  data-board-link
                >
                  Open on board
                </a>
              )}
            </div>
          </CellPopover>
        )}
      </>
    );
  }
  if (row.taskId && !resendable) return <StageChip stage={row.stage} />;
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
  people,
  canEditCol,
  onClose,
  onImport,
}: {
  sheet: WikiSheet;
  internal: boolean;
  people: SheetPerson[];
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
        ? planImport(grid, sheet.columns, { firstRowHeaders: headers, allowNewColumns: internal, isEditable: canEditCol, people })
        : null,
    [grid, sheet.columns, headers, internal, canEditCol, people],
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
            {plan.unmatchedPeople > 0 && (
              <p className="text-[12px] text-[var(--text-3)]" data-import-unmatched>
                {plan.unmatchedPeople} name{plan.unmatchedPeople === 1 ? "" : "s"} in a person column didn&apos;t match exactly one
                person on this client&apos;s list, so {plan.unmatchedPeople === 1 ? "it is" : "they are"} kept as plain text. Pick
                the person in the cell afterwards to link them.
              </p>
            )}
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
  people: SheetPerson[];
  canEditCol: (c: SheetColumn) => boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (changes: Record<string, CommitValue>) => Promise<boolean>;
  onDelete: () => void;
}) {
  /** What each field starts from: a ready value for person/media/checkbox, a draft string otherwise. */
  const initial = (c: SheetColumn): CommitValue => {
    const v = row.cells[c.id];
    if (c.type === "checkbox") return v === true;
    if (c.type === "person" || c.type === "media") return v ?? null;
    return draftFor(c, v);
  };
  const [values, setValues] = useState<Record<string, CommitValue>>(() =>
    Object.fromEntries(columns.map((c) => [c.id, initial(c)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="EDIT ROW" panelClassName="app-dialog-fixed w-full max-w-lg">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {columns.map((c) => {
          const editable = canEditCol(c);
          const v = values[c.id];
          const set = (nv: CommitValue) => setValues((s) => ({ ...s, [c.id]: nv }));
          const caption = (
            <span className="text-[10px] tracking-[0.08em] text-[var(--text-3)] uppercase" style={{ fontFamily: MONO }}>
              {c.title}
              {!editable && " · read-only"}
            </span>
          );
          if (c.type === "person" || c.type === "media") {
            // Not a <label>: these hold more than one control.
            return (
              <div key={c.id} className="block" data-field={c.type}>
                {caption}
                {!editable ? (
                  <div className="mt-1 text-[14px] text-[var(--text-2)]">
                    <CellValue column={c} value={(v ?? undefined) as SheetCellValue | undefined} wrap />
                  </div>
                ) : c.type === "person" ? (
                  <PersonPicker
                    people={people}
                    value={(v ?? undefined) as SheetCellValue | undefined}
                    label={c.title}
                    variant="field"
                    onPick={(p) => set(p)}
                  />
                ) : (
                  <div className="mt-1">
                    <MediaListEditor value={isMediaList(v) ? v : []} label={`"${c.title}"`} onChange={(items) => set(items.length ? items : null)} />
                  </div>
                )}
              </div>
            );
          }
          return (
            <label key={c.id} className="block">
              {caption}
              {c.type === "checkbox" ? (
                <input type="checkbox" disabled={!editable} checked={v === true} onChange={(e) => set(e.target.checked)} className="mt-1 block h-5 w-5" />
              ) : c.type === "select" ? (
                <select disabled={!editable} value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="app-input app-select-chevron mt-1 w-full pr-9 text-base">
                  <option value="">—</option>
                  {(c.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : c.type === "long_text" ? (
                <textarea disabled={!editable} value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="app-input mt-1 min-h-[96px] w-full py-2 text-base leading-6" />
              ) : (
                <input
                  disabled={!editable}
                  type={c.type === "date" ? "date" : "text"}
                  inputMode={c.type === "number" ? "decimal" : c.type === "link" ? "url" : undefined}
                  value={String(v ?? "")}
                  onChange={(e) => set(e.target.value)}
                  className="app-input mt-1 w-full text-base"
                />
              )}
            </label>
          );
        })}
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
              const changes: Record<string, CommitValue> = {};
              for (const c of columns) {
                if (!canEditCol(c)) continue;
                const before = initial(c);
                const now = values[c.id];
                if (typeof now === "object" || typeof before === "object" ? sameCellValue(now as SheetCellValue | null, before as SheetCellValue | null) : now === before) continue;
                const res = coerceCellValue(c, now);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                changes[c.id] = now;
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
