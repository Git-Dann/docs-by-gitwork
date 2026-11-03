import { describe, expect, it } from "vitest";
import {
  EMPTY_HISTORY,
  historyKey,
  invertEdit,
  recordEdit,
  takeRedo,
  takeUndo,
  type SheetEdit,
} from "@/lib/wiki-sheet-history";

const cell = (before: string | null, after: string | null): SheetEdit => ({
  kind: "cells",
  label: "edit",
  changes: [{ rowId: "r1", colId: "c1", before, after }],
});

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  historyKey({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe("invertEdit", () => {
  it("swaps a cell's before and after", () => {
    const inv = invertEdit(cell("Low", "High"));
    expect(inv.kind === "cells" && inv.changes[0]).toMatchObject({ before: "High", after: "Low" });
  });
  it("turns a removal into a restore and back", () => {
    const rows: SheetEdit = { kind: "rows", label: "x", action: "delete", rowIds: ["a"] };
    expect(invertEdit(rows)).toMatchObject({ action: "restore" });
    expect(invertEdit(invertEdit(rows))).toEqual(rows);
  });
  it("swaps a move's orders", () => {
    expect(invertEdit({ kind: "order", label: "m", before: ["a", "b"], after: ["b", "a"] })).toMatchObject({
      before: ["b", "a"],
      after: ["a", "b"],
    });
  });
});

describe("undo / redo stacks", () => {
  it("undo applies the inverse, redo the original", () => {
    const h = recordEdit(EMPTY_HISTORY, cell("Low", "High"));
    const u = takeUndo(h)!;
    expect(u.apply.kind === "cells" && u.apply.changes[0].after).toBe("Low");
    const r = takeRedo(u.history)!;
    expect(r.apply.kind === "cells" && r.apply.changes[0].after).toBe("High");
    expect(r.history.past).toHaveLength(1);
    expect(r.history.future).toHaveLength(0);
  });

  it("undoes the most recent first", () => {
    let h = recordEdit(EMPTY_HISTORY, cell(null, "one"));
    h = recordEdit(h, cell("one", "two"));
    const u = takeUndo(h)!;
    expect(u.apply.kind === "cells" && u.apply.changes[0].after).toBe("one");
  });

  it("a new edit clears redo", () => {
    const h = takeUndo(recordEdit(EMPTY_HISTORY, cell("a", "b")))!.history;
    expect(h.future).toHaveLength(1);
    expect(recordEdit(h, cell("a", "c")).future).toHaveLength(0);
  });

  it("drops the oldest past the limit, and ignores empty edits", () => {
    let h = EMPTY_HISTORY;
    for (let i = 0; i < 5; i++) h = recordEdit(h, cell(null, String(i)), 3);
    expect(h.past).toHaveLength(3);
    expect(h.past[0].kind === "cells" && h.past[0].changes[0].after).toBe("2");
    expect(recordEdit(EMPTY_HISTORY, { kind: "cells", label: "x", changes: [] })).toBe(EMPTY_HISTORY);
  });

  it("nothing to undo or redo is null", () => {
    expect(takeUndo(EMPTY_HISTORY)).toBeNull();
    expect(takeRedo(EMPTY_HISTORY)).toBeNull();
  });
});

describe("historyKey", () => {
  it("⌘Z and Ctrl+Z undo; ⇧⌘Z, Ctrl+Shift+Z and Ctrl+Y redo", () => {
    expect(key("z", { metaKey: true })).toBe("undo");
    expect(key("z", { ctrlKey: true })).toBe("undo");
    expect(key("Z", { metaKey: true, shiftKey: true })).toBe("redo");
    expect(key("z", { ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(key("y", { ctrlKey: true })).toBe("redo");
  });
  it("a bare z, ⌥Z and ⌘Y are neither", () => {
    expect(key("z")).toBeNull();
    expect(key("z", { metaKey: true, altKey: true })).toBeNull();
    expect(key("y", { metaKey: true })).toBeNull();
  });
});
