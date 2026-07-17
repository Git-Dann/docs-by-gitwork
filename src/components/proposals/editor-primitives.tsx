/**
 * Shared primitives for the Docs block editors.
 *
 * LAYOUT CONTRACT (read before touching any editor): editors render inside the ~280–360px Options
 * rail, NOT a wide canvas. So:
 *   • Repeatable items use <ItemCard>: a `@container` whose move/delete controls live in a HEADER
 *     row (never beside the fields, where they overlap in the rail).
 *   • Field grids inside an ItemCard use container-query widths (`@[26rem]:grid-cols-2`,
 *     `@[26rem]:col-span-2`) so they stack to one column in the rail and only go two-up when the
 *     rail is genuinely wide. NEVER use viewport breakpoints (`sm:`/`md:`/`lg:`) for editor field
 *     grids — they key off the window width, not the rail's, and re-break the layout.
 *   • A single-block editor (no repeatable rows) just needs `@container` on its root panel and the
 *     same `@[26rem]:` field-grid utilities.
 */

"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

/** Stable id for new list items (SSR-safe). */
export function editorId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;
}

/** Move-up / move-down / delete cluster. Lives in an <ItemCard> header, never beside fields.
 *  Compact (icon-sm, tight gap) so the header label keeps room in the narrow rail. */
export function MoveDeleteControls({
  onMoveUp,
  onMoveDown,
  onDelete,
  ariaLabel,
}: {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button type="button" onClick={onMoveUp} variant="secondary" size="icon-sm" aria-label={`Move ${ariaLabel} up`}>
        <ArrowUpIcon className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" onClick={onMoveDown} variant="secondary" size="icon-sm" aria-label={`Move ${ariaLabel} down`}>
        <ArrowDownIcon className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" onClick={onDelete} variant="danger" size="icon-sm" aria-label={`Delete ${ariaLabel}`}>
        <TrashIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * Header for a list section inside an editor: a label on the left + an action (usually an
 * "Add …" button) on the right. Wraps the action below the label when the rail is too narrow to
 * hold both on one line — so the label and button never overlap (the old `justify-between` row
 * with no wrap collided in the ~280px rail).
 */
export function EditorSectionHeader({
  label,
  action,
}: {
  label: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="app-eyebrow min-w-0">{label}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A repeatable item row. Header carries a short (truncating) label + the move/delete controls; the
 * fields go underneath, full-width. It's a `@container`, so field grids inside can use
 * `@[26rem]:grid-cols-2` to go two-up only when the rail is wide — otherwise one clean column.
 */
export function ItemCard({
  label,
  onMoveUp,
  onMoveDown,
  onDelete,
  ariaLabel,
  children,
}: {
  label: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="@container rounded-[10px] border border-[var(--border-2)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="app-eyebrow min-w-0 truncate">{label}</span>
        <MoveDeleteControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} ariaLabel={ariaLabel} />
      </div>
      {children}
    </div>
  );
}

/** Small caps field label. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="app-field-label">{children}</span>;
}

/** Dashed empty-state hint for a list with no items yet. */
export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-4 text-sm text-[var(--text-4)]">
      {children}
    </p>
  );
}

/** Reorder helper: returns a `move(index, delta)` that emits the reordered array. */
export function makeMover<T>(items: T[], onChange: (next: T[]) => void) {
  return (index: number, delta: -1 | 1) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const clone = [...items];
    const [entry] = clone.splice(index, 1);
    clone.splice(nextIndex, 0, entry);
    onChange(clone);
  };
}
