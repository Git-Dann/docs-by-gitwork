/**
 * Undo / redo for a wiki sheet — the pure half. No React, no fetch.
 *
 * Each entry records what changed, both ways, so undoing is "write the before" and redoing is
 * "write the after". Undo writes through the same routes as an ordinary edit, so the server's
 * rules (who may edit which column) still apply to it.
 *
 * What is undoable: cell edits (one, or a bulk set as ONE step), removing / restoring rows
 * (the team — a client cannot restore), and moving a row. What is not: sending to the board
 * (it made a task someone may already be working on) and adding a row.
 *
 * The history lives in this browser tab only. It is per viewer, like Google Sheets', and is
 * gone on reload.
 */

import type { SheetCellValue } from "@/types/wiki-sheets";

export interface CellChange {
  rowId: string;
  colId: string;
  before: SheetCellValue | null;
  after: SheetCellValue | null;
}

export type SheetEdit =
  | { kind: "cells"; label: string; changes: CellChange[] }
  | { kind: "rows"; label: string; action: "delete" | "restore"; rowIds: string[] }
  | { kind: "order"; label: string; before: string[]; after: string[] };

export interface SheetHistory {
  past: SheetEdit[];
  future: SheetEdit[];
}

export const HISTORY_LIMIT = 100;

export const EMPTY_HISTORY: SheetHistory = { past: [], future: [] };

/** The edit that takes `edit` back. Applying an edit then its inverse leaves nothing changed. */
export function invertEdit(edit: SheetEdit): SheetEdit {
  switch (edit.kind) {
    case "cells":
      return { ...edit, changes: edit.changes.map((c) => ({ ...c, before: c.after, after: c.before })) };
    case "rows":
      return { ...edit, action: edit.action === "delete" ? "restore" : "delete" };
    case "order":
      return { ...edit, before: edit.after, after: edit.before };
  }
}

/** A new edit clears the redo stack — the same rule as every editor. Oldest falls off past the limit. */
export function recordEdit(h: SheetHistory, edit: SheetEdit, limit = HISTORY_LIMIT): SheetHistory {
  if (edit.kind === "cells" && edit.changes.length === 0) return h;
  if (edit.kind === "rows" && edit.rowIds.length === 0) return h;
  const past = [...h.past, edit];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

/** The step to apply for an undo (already inverted), and the history after it. */
export function takeUndo(h: SheetHistory): { apply: SheetEdit; history: SheetHistory } | null {
  const edit = h.past.at(-1);
  if (!edit) return null;
  return { apply: invertEdit(edit), history: { past: h.past.slice(0, -1), future: [...h.future, edit] } };
}

/** The step to apply for a redo, and the history after it. */
export function takeRedo(h: SheetHistory): { apply: SheetEdit; history: SheetHistory } | null {
  const edit = h.future.at(-1);
  if (!edit) return null;
  return { apply: edit, history: { past: [...h.past, edit], future: h.future.slice(0, -1) } };
}

/**
 * ⌘Z / Ctrl+Z is undo; ⇧⌘Z, Ctrl+Shift+Z and Ctrl+Y are redo. Alt anything is neither — on a
 * Mac, ⌥Z types a character.
 */
export function historyKey(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): "undo" | "redo" | null {
  if (e.altKey || !(e.metaKey || e.ctrlKey)) return null;
  const k = e.key.toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && e.ctrlKey && !e.metaKey && !e.shiftKey) return "redo";
  return null;
}
