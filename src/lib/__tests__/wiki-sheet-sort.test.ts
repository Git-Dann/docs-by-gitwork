import { describe, expect, it } from "vitest";
import {
  STAGE_SORT_KEY,
  encodeSort,
  inView,
  isDoneStage,
  parseSort,
  sortChoices,
  sortSheetRows,
} from "@/lib/wiki-sheet-sort";
import type { RequestStage } from "@/lib/wiki-request-stage";
import type { SheetCells, SheetColumn } from "@/types/wiki-sheets";

const col = (id: string, type: SheetColumn["type"], extra: Partial<SheetColumn> = {}): SheetColumn => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  type,
  clientEditable: true,
  ...extra,
});

const priority = col("priority", "select", { options: ["Low", "Medium", "High"] });
const issue = col("issue", "text");
const due = col("due", "date");
const est = col("est", "number");
const fixed = col("fixed", "checkbox");
const shots = col("shots", "media");
const columns = [issue, priority, due, est, fixed, shots];

type Row = { id: string; cells: SheetCells; stage: RequestStage | null };
const row = (id: string, cells: SheetCells, stage: RequestStage | null = null): Row => ({ id, cells, stage });
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("sortChoices", () => {
  it("labels a dropdown with its own first and last options", () => {
    const labels = sortChoices(columns).map((c) => c.label);
    expect(labels).toContain("Priority · Low → High");
    expect(labels).toContain("Priority · High → Low");
    expect(labels).toContain("Issue · A → Z");
    expect(labels).toContain("Due · Newest first");
  });

  it("offers no sort for media, and the Board last", () => {
    const keys = sortChoices(columns).map((c) => c.key);
    expect(keys).not.toContain("shots");
    expect(keys.at(-1)).toBe(STAGE_SORT_KEY);
  });
});

describe("sortSheetRows", () => {
  const rows = [
    row("a", { priority: "Medium", issue: "item 10" }),
    row("b", { priority: "High", issue: "Item 2" }),
    row("c", { issue: "apple" }),
    row("d", { priority: "low", issue: "Banana" }),
    row("e", { priority: "High", issue: "" }),
  ];

  it("sorts a dropdown by option order, not alphabetically — High → Low", () => {
    expect(ids(sortSheetRows(rows, columns, { key: "priority", dir: "desc" }))).toEqual(["b", "e", "a", "d", "c"]);
    expect(ids(sortSheetRows(rows, columns, { key: "priority", dir: "asc" }))).toEqual(["d", "a", "b", "e", "c"]);
  });

  it("puts empty cells last in BOTH directions", () => {
    expect(ids(sortSheetRows(rows, columns, { key: "issue", dir: "asc" })).at(-1)).toBe("e");
    expect(ids(sortSheetRows(rows, columns, { key: "issue", dir: "desc" })).at(-1)).toBe("e");
  });

  it("sorts text naturally and without case", () => {
    expect(ids(sortSheetRows(rows, columns, { key: "issue", dir: "asc" }))).toEqual(["c", "d", "b", "a", "e"]);
    expect(ids(sortSheetRows(rows, columns, { key: "issue", dir: "desc" }))).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("keeps the sheet order between ties", () => {
    const tied = [row("x", { priority: "High" }), row("y", { priority: "High" }), row("z", { priority: "High" })];
    expect(ids(sortSheetRows(tied, columns, { key: "priority", dir: "desc" }))).toEqual(["x", "y", "z"]);
    expect(ids(sortSheetRows(tied, columns, { key: "priority", dir: "asc" }))).toEqual(["x", "y", "z"]);
  });

  it("puts a value no longer among the options after the options", () => {
    const r = [row("old", { priority: "Urgent" }), row("hi", { priority: "High" }), row("lo", { priority: "Low" })];
    expect(ids(sortSheetRows(r, columns, { key: "priority", dir: "asc" }))).toEqual(["lo", "hi", "old"]);
  });

  it("sorts numbers and dates by value", () => {
    const r = [row("a", { est: 10, due: "2026-11-02" }), row("b", { est: 9, due: "2026-10-30" }), row("c", {})];
    expect(ids(sortSheetRows(r, columns, { key: "est", dir: "asc" }))).toEqual(["b", "a", "c"]);
    expect(ids(sortSheetRows(r, columns, { key: "due", dir: "desc" }))).toEqual(["a", "b", "c"]);
  });

  it("treats an unset checkbox as unticked, not empty", () => {
    const r = [row("off", {}), row("on", { fixed: true })];
    expect(ids(sortSheetRows(r, columns, { key: "fixed", dir: "asc" }))).toEqual(["on", "off"]);
    expect(ids(sortSheetRows(r, columns, { key: "fixed", dir: "desc" }))).toEqual(["off", "on"]);
  });

  it("sorts by the board stage in the journey's order", () => {
    const r = [row("d", {}, "DONE"), row("n", {}, null), row("p", {}, "IN_PROGRESS")];
    expect(ids(sortSheetRows(r, columns, { key: STAGE_SORT_KEY, dir: "asc" }))).toEqual(["n", "p", "d"]);
  });

  it("never touches the input, and null keeps the sheet order", () => {
    const before = ids(rows);
    sortSheetRows(rows, columns, { key: "issue", dir: "asc" });
    expect(ids(rows)).toEqual(before);
    expect(ids(sortSheetRows(rows, columns, null))).toEqual(before);
  });
});

describe("parseSort", () => {
  it("round-trips, and forgets a column that has gone", () => {
    expect(parseSort(encodeSort({ key: "priority", dir: "desc" }), columns)).toEqual({ key: "priority", dir: "desc" });
    expect(parseSort("deleted:asc", columns)).toBeNull();
    expect(parseSort("shots:asc", columns)).toBeNull();
    expect(parseSort("priority:sideways", columns)).toBeNull();
    expect(parseSort(`${STAGE_SORT_KEY}:asc`, columns)).toEqual({ key: STAGE_SORT_KEY, dir: "asc" });
  });
});

describe("Workstream / Done", () => {
  it("a done or closed row leaves the workstream", () => {
    expect(isDoneStage("DONE")).toBe(true);
    expect(isDoneStage("CLOSED")).toBe(true);
    for (const s of ["NEW", "REVIEWING", "SCHEDULED", "IN_PROGRESS", "IN_REVIEW", null] as const) {
      expect(isDoneStage(s)).toBe(false);
      expect(inView({ stage: s }, "workstream")).toBe(true);
      expect(inView({ stage: s }, "done")).toBe(false);
    }
    expect(inView({ stage: "DONE" }, "workstream")).toBe(false);
    expect(inView({ stage: "DONE" }, "done")).toBe(true);
  });
});
