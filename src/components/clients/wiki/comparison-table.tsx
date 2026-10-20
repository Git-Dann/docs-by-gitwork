"use client";

/**
 * One comparison table — read, or edited in place.
 *
 * ⚠️ Three layout rules, each learned elsewhere in this wiki:
 *  1. The table sits in its OWN scroller that holds the header and the body together.
 *     `.widget-card` is `overflow: hidden`, so a wide child with no scroller of its own is
 *     unreachable, not merely off-screen (CLAUDE.md §45.2) — and a header outside the
 *     scroller desyncs from its rows the moment anyone scrolls sideways.
 *  2. 2–5 columns share the width evenly; 6+ get a fixed comfortable width and scroll, with
 *     the feature column pinned and an edge shadow saying there is more (`comparisonLayout`).
 *  3. Menus are Headless UI `anchor`ed, so they portal out of the scroller instead of being
 *     clipped by it (CLAUDE.md §55).
 *
 * Every glyph carries its meaning in words for a screen reader (CELL_LABEL), and absence is
 * muted grey rather than red: "not in this plan" is a fact, not an error.
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  CheckIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { MONO } from "@/components/analytics/analytics-widgets";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import {
  CELL_LABEL,
  COMPARISON_LIMITS,
  addColumns,
  addRows,
  canAddColumn,
  columnCounts,
  comparisonLayout,
  cycleCellState,
  moveColumn,
  moveRow,
  parseCellValue,
  removeColumn,
  removeRow,
  setCell,
  updateColumn,
  updateRow,
  type ComparisonContent,
} from "@/lib/wiki-comparisons";
import type { ComparisonCell, ComparisonColumn, ComparisonRow } from "@/types/wiki-comparisons";

/* ──────────────────────────────────────────────────────────────── glyphs ── */

function PartialGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
    </svg>
  );
}

/** The visible mark plus its meaning in words — never a bare icon. */
export function CellGlyph({ cell }: { cell: ComparisonCell | undefined }) {
  const state = cell?.state ?? "none";
  const qualifier =
    cell?.text && state !== "text" ? (
      <span className="text-[11px] leading-tight text-[var(--text-3)]">{cell.text}</span>
    ) : null;
  if (state === "yes") {
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <CheckIcon aria-hidden="true" className="h-[18px] w-[18px] stroke-[2.4] text-[var(--success-500)]" />
        <span className="sr-only">{CELL_LABEL.yes}</span>
        {qualifier}
      </span>
    );
  }
  if (state === "no") {
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <XMarkIcon aria-hidden="true" className="h-4 w-4 stroke-2 text-[var(--text-4)] opacity-70" />
        <span className="sr-only">{CELL_LABEL.no}</span>
        {qualifier}
      </span>
    );
  }
  if (state === "partial") {
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <PartialGlyph className="h-4 w-4 text-[var(--warning-500)]" />
        <span className="sr-only">{CELL_LABEL.partial}</span>
        {qualifier}
      </span>
    );
  }
  if (state === "text") {
    return (
      <span className="text-[13px] font-medium leading-snug break-words text-[var(--text-1)]">
        {cell?.text}
      </span>
    );
  }
  return <span className="sr-only">{CELL_LABEL.none}</span>;
}

/** The legend under every table — the glyphs explained once, in words. */
export function ComparisonLegend({ trailing }: { trailing?: ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] tracking-[0.04em] text-[var(--text-4)] uppercase"
      style={{ fontFamily: MONO }}
    >
      <span className="inline-flex items-center gap-1.5">
        <CheckIcon aria-hidden="true" className="h-3.5 w-3.5 stroke-[2.4] text-[var(--success-500)]" />
        {CELL_LABEL.yes}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <PartialGlyph className="h-3.5 w-3.5 text-[var(--warning-500)]" />
        {CELL_LABEL.partial}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <XMarkIcon aria-hidden="true" className="h-3.5 w-3.5 stroke-2 text-[var(--text-4)]" />
        {CELL_LABEL.no}
      </span>
      <span>Blank · not stated</span>
      {trailing}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── scroller ── */

/** Tracks whether the scroller is scrolled off its start / has more to its end. */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ scrolled: false, more: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const scrolled = el.scrollLeft > 1;
      const more = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.scrolled === scrolled && prev.more === more ? prev : { scrolled, more }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);
  return { ref, ...edges };
}

/* ──────────────────────────────────────────────────────────────── table ── */

const STICKY_SHADOW = "group-data-[scrolled=true]/cmp:shadow-[6px_0_8px_-6px_rgba(0,0,0,0.22)]";
const FIELD = "w-full rounded-[4px] border border-[var(--border-1)] bg-[var(--surface-0)] px-2 py-1 text-[16px] text-[var(--text-1)] sm:text-[13px]";

function highlightHead(col: ComparisonColumn): CSSProperties | undefined {
  return col.highlight
    ? { background: "var(--brand-50)", boxShadow: "inset 0 3px 0 var(--brand-600)" }
    : undefined;
}
function highlightBody(col: ComparisonColumn): CSSProperties | undefined {
  return col.highlight
    ? { background: "color-mix(in srgb, var(--brand-50) 55%, var(--surface-0))" }
    : undefined;
}

export interface ComparisonTableProps {
  content: ComparisonContent;
  /** Accessible name — the table's title. */
  caption: string;
  /** Show only these columns (the phone's compare-two view). */
  columnIds?: string[];
  /** Narrower feature column and plan columns, for a phone. */
  compact?: boolean;
  editing?: boolean;
  onChange?: (next: ComparisonContent) => void;
  /** Reports a refused edit (e.g. the 46th column) in words. */
  onNotice?: (message: string) => void;
}

export function ComparisonTable({
  content,
  caption,
  columnIds,
  compact = false,
  editing = false,
  onChange,
  onNotice,
}: ComparisonTableProps) {
  const columns = columnIds
    ? columnIds
        .map((id) => content.columns.find((c) => c.id === id))
        .filter((c): c is ComparisonColumn => Boolean(c))
    : content.columns;
  const layout = comparisonLayout(columns.length, compact);
  const { ref, scrolled, more } = useScrollEdges();
  const counts = columnCounts({ columns, rows: content.rows });
  const hasGlyphs = counts.some((c) => c.yes + c.partial + c.no > 0);
  const addWidth = 56;
  const tableWidth = layout.minTableWidth + (editing ? addWidth : 0);
  const change = (next: ComparisonContent) => onChange?.(next);
  const span = columns.length + 1 + (editing ? 1 : 0);

  return (
    <div className="group/cmp relative" data-scrolled={scrolled ? "true" : "false"}>
      <div
        ref={ref}
        data-comparison-scroller=""
        className="max-h-[min(72vh,760px)] overflow-auto overscroll-x-contain"
      >
        <table
          className="border-separate border-spacing-0 text-left"
          style={{
            tableLayout: "fixed",
            width: layout.mode === "fit" ? "100%" : tableWidth,
            minWidth: tableWidth,
          }}
        >
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            <col style={{ width: layout.featureWidth }} />
            {columns.map((c) => (
              <col key={c.id} style={layout.mode === "scroll" ? { width: layout.columnWidth } : undefined} />
            ))}
            {editing && <col style={{ width: addWidth }} />}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className={`sticky top-0 left-0 z-30 border-b border-[var(--border-1)] bg-[var(--surface-0)] px-3 py-2.5 align-bottom ${STICKY_SHADOW}`}
              >
                <span
                  className="text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase"
                  style={{ fontFamily: MONO }}
                >
                  Feature
                </span>
              </th>
              {columns.map((col, i) => (
                <th
                  key={col.id}
                  scope="col"
                  className="sticky top-0 z-20 border-b border-[var(--border-1)] bg-[var(--surface-0)] px-2 py-2.5 text-center align-bottom"
                  style={highlightHead(col)}
                >
                  {editing ? (
                    <EditableColumnHead
                      col={col}
                      first={i === 0}
                      last={i === columns.length - 1}
                      cellCount={content.rows.filter((r) => r.cells[col.id]).length}
                      onRename={(title) => change(updateColumn(content, col.id, { title }))}
                      onSubtitle={(subtitle) => change(updateColumn(content, col.id, { subtitle }))}
                      onHighlight={() => change(updateColumn(content, col.id, { highlight: !col.highlight }))}
                      onMove={(d) => change(moveColumn(content, col.id, d))}
                      onDelete={() => change(removeColumn(content, col.id))}
                    />
                  ) : (
                    <ColumnHead col={col} />
                  )}
                </th>
              ))}
              {editing && (
                <th
                  scope="col"
                  className="sticky top-0 z-20 border-b border-[var(--border-1)] bg-[var(--surface-0)] px-1 py-2.5 align-bottom"
                >
                  <button
                    type="button"
                    className="app-button app-button-secondary app-button-icon-sm mx-auto"
                    aria-label="Add column"
                    title={
                      canAddColumn(content)
                        ? "Add column"
                        : `A comparison can have at most ${COMPARISON_LIMITS.maxColumns} columns`
                    }
                    aria-disabled={!canAddColumn(content)}
                    onClick={() => {
                      if (!canAddColumn(content)) {
                        onNotice?.(
                          `A comparison can have at most ${COMPARISON_LIMITS.maxColumns} columns — remove one to add another.`,
                        );
                        return;
                      }
                      change(addColumns(content, [{ title: `Column ${content.columns.length + 1}` }]));
                    }}
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row, ri) =>
              row.kind === "group" ? (
                <tr key={row.id}>
                  <th
                    scope="colgroup"
                    colSpan={span}
                    className="border-b border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-1.5 text-left"
                  >
                    <span className="sticky left-3 inline-flex max-w-full items-center gap-2">
                      {editing ? (
                        <>
                          <input
                            aria-label="Group heading"
                            className={`${FIELD} w-[200px] uppercase`}
                            style={{ fontFamily: MONO }}
                            value={row.label}
                            maxLength={COMPARISON_LIMITS.maxLabel}
                            placeholder="Group heading"
                            onChange={(e) => change(updateRow(content, row.id, { label: e.target.value }))}
                          />
                          <RowMenu
                            row={row}
                            first={ri === 0}
                            last={ri === content.rows.length - 1}
                            content={content}
                            onChange={change}
                            onNotice={onNotice}
                          />
                        </>
                      ) : (
                        <span
                          className="text-[10px] font-medium tracking-[0.14em] text-[var(--text-3)] uppercase"
                          style={{ fontFamily: MONO }}
                        >
                          {row.label || "—"}
                        </span>
                      )}
                    </span>
                  </th>
                </tr>
              ) : (
                <tr key={row.id} className="group/row">
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 border-b border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2.5 align-middle font-normal group-hover/row:bg-[var(--surface-1)] ${STICKY_SHADOW}`}
                  >
                    {editing ? (
                      <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1 space-y-1">
                          <input
                            aria-label="Feature"
                            className={FIELD}
                            value={row.label}
                            maxLength={COMPARISON_LIMITS.maxLabel}
                            placeholder="Feature name"
                            onChange={(e) => change(updateRow(content, row.id, { label: e.target.value }))}
                          />
                          <input
                            aria-label="Note"
                            className={`${FIELD} text-[13px] text-[var(--text-3)] sm:text-[12px]`}
                            value={row.note ?? ""}
                            maxLength={COMPARISON_LIMITS.maxNote}
                            placeholder="Note (optional)"
                            onChange={(e) => change(updateRow(content, row.id, { note: e.target.value }))}
                          />
                        </div>
                        <RowMenu
                          row={row}
                          first={ri === 0}
                          last={ri === content.rows.length - 1}
                          content={content}
                          onChange={change}
                          onNotice={onNotice}
                        />
                      </div>
                    ) : (
                      <>
                        <span className="block text-[13px] leading-snug break-words text-[var(--text-1)]">
                          {row.label || "—"}
                        </span>
                        {row.note && (
                          <span className="mt-0.5 block text-[12px] leading-snug break-words text-[var(--text-4)]">
                            {row.note}
                          </span>
                        )}
                      </>
                    )}
                  </th>
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className="border-b border-[var(--border-2)] px-1.5 py-1.5 text-center align-middle group-hover/row:bg-[var(--surface-1)]"
                      style={highlightBody(col)}
                    >
                      {editing ? (
                        <EditableCell
                          row={row}
                          col={col}
                          cell={row.cells[col.id]}
                          onSet={(cell) => change(setCell(content, row.id, col.id, cell))}
                        />
                      ) : (
                        <span className="flex min-h-[32px] items-center justify-center px-1">
                          <CellGlyph cell={row.cells[col.id]} />
                        </span>
                      )}
                    </td>
                  ))}
                  {editing && <td className="border-b border-[var(--border-2)]" />}
                </tr>
              ),
            )}
            {!editing && hasGlyphs && (
              <tr>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 bg-[var(--surface-1)] px-3 py-2 text-left ${STICKY_SHADOW}`}
                >
                  <span
                    className="text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase"
                    style={{ fontFamily: MONO }}
                  >
                    Included
                  </span>
                </th>
                {counts.map((c) => (
                  <td
                    key={c.columnId}
                    className="bg-[var(--surface-1)] px-2 py-2 text-center text-[11px] text-[var(--text-3)]"
                    style={{ fontFamily: MONO }}
                    title={`${c.yes} included, ${c.partial} partly, ${c.no} not included, of ${c.rows} features`}
                  >
                    {c.yes}
                    <span className="text-[var(--text-4)]">/{c.rows}</span>
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {more && (
        <div
          aria-hidden="true"
          data-comparison-more=""
          className="pointer-events-none absolute inset-y-0 right-0 w-10"
          style={{ background: "linear-gradient(to left, var(--border-1), transparent)" }}
        />
      )}
    </div>
  );
}

function ColumnHead({ col }: { col: ComparisonColumn }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      {col.highlight && (
        <span
          className="text-[9.5px] font-semibold tracking-[0.14em] text-[var(--brand-700)] uppercase"
          style={{ fontFamily: MONO }}
        >
          Featured
        </span>
      )}
      <span className="text-[13px] leading-snug font-semibold break-words text-[var(--text-1)]">
        {col.title}
      </span>
      {col.subtitle && (
        <span className="text-[11px] leading-snug break-words text-[var(--text-4)]" style={{ fontFamily: MONO }}>
          {col.subtitle}
        </span>
      )}
    </span>
  );
}

/** Commit on Enter or blur, cancel on Escape — the same contract everywhere in the table. */
function InlineInput({
  initial,
  label,
  maxLength,
  onCommit,
  onCancel,
  className,
}: {
  initial: string;
  label: string;
  maxLength: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };
  return (
    <input
      autoFocus
      aria-label={label}
      className={`${FIELD} ${className ?? ""}`}
      value={value}
      maxLength={maxLength}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}

function EditableColumnHead({
  col,
  first,
  last,
  cellCount,
  onRename,
  onSubtitle,
  onHighlight,
  onMove,
  onDelete,
}: {
  col: ComparisonColumn;
  first: boolean;
  last: boolean;
  cellCount: number;
  onRename: (title: string) => void;
  onSubtitle: (subtitle: string) => void;
  onHighlight: () => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const [field, setField] = useState<"title" | "subtitle" | null>(null);
  return (
    <div className="flex flex-col items-stretch gap-1">
      {col.highlight && (
        <span
          className="text-center text-[9.5px] font-semibold tracking-[0.14em] text-[var(--brand-700)] uppercase"
          style={{ fontFamily: MONO }}
        >
          Featured
        </span>
      )}
      <div className="flex items-start gap-0.5">
        {field === "title" ? (
          <InlineInput
            initial={col.title}
            label="Column title"
            maxLength={COMPARISON_LIMITS.maxColumnTitle}
            onCommit={(v) => {
              if (v.trim()) onRename(v);
              setField(null);
            }}
            onCancel={() => setField(null)}
            className="text-center"
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 rounded-[4px] px-1 py-0.5 text-[13px] leading-snug font-semibold break-words text-[var(--text-1)] hover:bg-[var(--surface-1)]"
            title="Rename"
            onClick={() => setField("title")}
          >
            {col.title}
          </button>
        )}
        <Menu>
          <MenuButton
            className="shrink-0 rounded-[4px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
            aria-label={`Column options: ${col.title}`}
          >
            <EllipsisHorizontalIcon className="h-4 w-4" />
          </MenuButton>
          <MenuItems anchor="bottom end" className={`${menuPanel} w-48`}>
            <MenuItem>
              <button type="button" className={menuItem} onClick={() => setField("title")}>
                Rename
              </button>
            </MenuItem>
            <MenuItem>
              <button type="button" className={menuItem} onClick={() => setField("subtitle")}>
                {col.subtitle ? "Edit subtitle" : "Add subtitle"}
              </button>
            </MenuItem>
            <MenuItem>
              <button type="button" className={menuItem} onClick={onHighlight}>
                {col.highlight ? "Remove feature" : "Feature this column"}
              </button>
            </MenuItem>
            <MenuItem disabled={first}>
              <button type="button" className={`${menuItem} data-[disabled]:opacity-40`} onClick={() => onMove(-1)}>
                Move left
              </button>
            </MenuItem>
            <MenuItem disabled={last}>
              <button type="button" className={`${menuItem} data-[disabled]:opacity-40`} onClick={() => onMove(1)}>
                Move right
              </button>
            </MenuItem>
            <MenuItem>
              <button
                type="button"
                className={`${menuItem} text-[var(--danger-500)]`}
                onClick={() => {
                  const what = cellCount > 0 ? ` Its ${cellCount} filled cell${cellCount === 1 ? "" : "s"} go with it.` : "";
                  if (window.confirm(`Delete the column "${col.title}"?${what}`)) onDelete();
                }}
              >
                Delete column
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      </div>
      {field === "subtitle" ? (
        <InlineInput
          initial={col.subtitle ?? ""}
          label="Column subtitle"
          maxLength={COMPARISON_LIMITS.maxColumnSubtitle}
          onCommit={(v) => {
            onSubtitle(v);
            setField(null);
          }}
          onCancel={() => setField(null)}
          className="text-center text-[12px]"
        />
      ) : col.subtitle ? (
        <button
          type="button"
          className="rounded-[4px] px-1 text-[11px] break-words text-[var(--text-4)] hover:bg-[var(--surface-1)]"
          style={{ fontFamily: MONO }}
          onClick={() => setField("subtitle")}
        >
          {col.subtitle}
        </button>
      ) : null}
    </div>
  );
}

/** Click cycles ✓ → ◐ → ✕ → blank; typing (or the pencil) writes a value instead. */
function EditableCell({
  row,
  col,
  cell,
  onSet,
}: {
  row: ComparisonRow;
  col: ComparisonColumn;
  cell: ComparisonCell | undefined;
  onSet: (cell: ComparisonCell) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const state = cell?.state ?? "none";
  if (typing !== null) {
    return (
      <InlineInput
        initial={typing}
        label={`Value for ${row.label || "feature"} — ${col.title}`}
        maxLength={COMPARISON_LIMITS.maxText}
        onCommit={(v) => {
          onSet(parseCellValue(v));
          setTyping(null);
        }}
        onCancel={() => setTyping(null)}
        className="text-center"
      />
    );
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    // Start typing on a focused cell to write a value; Enter/Space still cycle.
    if (e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setTyping(e.key);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onSet({ state: "none" });
    }
  };
  return (
    <div className="group/cell relative">
      <button
        type="button"
        className="flex min-h-[36px] w-full items-center justify-center rounded-[4px] px-1 transition hover:bg-[var(--surface-2)]"
        aria-label={`${row.label || "Feature"} — ${col.title}: ${CELL_LABEL[state]}${
          state === "text" ? ` "${cell?.text}"` : ""
        }. Click to change, or type a value.`}
        onClick={() => onSet({ state: cycleCellState(state) })}
        onKeyDown={onKeyDown}
      >
        <CellGlyph cell={cell} />
      </button>
      <button
        type="button"
        aria-label={`Type a value for ${row.label || "feature"} — ${col.title}`}
        title="Type a value"
        className="absolute top-0.5 right-0.5 rounded-[3px] p-0.5 text-[var(--text-4)] opacity-60 hover:bg-[var(--surface-0)] hover:text-[var(--text-1)] focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/cell:opacity-100"
        onClick={() => setTyping(state === "text" ? (cell?.text ?? "") : (cell?.text ?? ""))}
      >
        <PencilIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

function RowMenu({
  row,
  first,
  last,
  content,
  onChange,
  onNotice,
}: {
  row: ComparisonRow;
  first: boolean;
  last: boolean;
  content: ComparisonContent;
  onChange: (next: ComparisonContent) => void;
  onNotice?: (message: string) => void;
}) {
  const index = content.rows.findIndex((r) => r.id === row.id);
  const insert = (kind: "row" | "group") => {
    try {
      onChange(addRows(content, [{ kind, label: "" }], index + 1));
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : "Could not add a row.");
    }
  };
  const filled = Object.keys(row.cells).length;
  return (
    <Menu>
      <MenuButton
        className="mt-0.5 shrink-0 rounded-[4px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
        aria-label={`Row options: ${row.label || (row.kind === "group" ? "group" : "feature")}`}
      >
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </MenuButton>
      <MenuItems anchor="bottom start" className={`${menuPanel} w-52`}>
        <MenuItem disabled={first}>
          <button type="button" className={`${menuItem} data-[disabled]:opacity-40`} onClick={() => onChange(moveRow(content, row.id, -1))}>
            Move up
          </button>
        </MenuItem>
        <MenuItem disabled={last}>
          <button type="button" className={`${menuItem} data-[disabled]:opacity-40`} onClick={() => onChange(moveRow(content, row.id, 1))}>
            Move down
          </button>
        </MenuItem>
        <MenuItem>
          <button type="button" className={menuItem} onClick={() => insert("row")}>
            Insert feature below
          </button>
        </MenuItem>
        <MenuItem>
          <button type="button" className={menuItem} onClick={() => insert("group")}>
            Insert group below
          </button>
        </MenuItem>
        <MenuItem>
          <button
            type="button"
            className={menuItem}
            onClick={() => {
              if (
                row.kind === "row" &&
                filled > 0 &&
                !window.confirm(`Turn "${row.label}" into a group heading? Its ${filled} filled cells are cleared.`)
              )
                return;
              onChange(updateRow(content, row.id, { kind: row.kind === "group" ? "row" : "group" }));
            }}
          >
            {row.kind === "group" ? "Make it a feature row" : "Make it a group heading"}
          </button>
        </MenuItem>
        <MenuItem>
          <button
            type="button"
            className={`${menuItem} text-[var(--danger-500)]`}
            onClick={() => {
              if (filled > 0 && !window.confirm(`Delete "${row.label || "this row"}" and its ${filled} filled cells?`)) return;
              onChange(removeRow(content, row.id));
            }}
          >
            Delete {row.kind === "group" ? "group" : "row"}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
