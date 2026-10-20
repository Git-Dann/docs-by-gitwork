import { describe, expect, it } from "vitest";
import {
  COMPARISON_LIMITS,
  COMPARISON_TEMPLATES,
  FIT_MAX_COLUMNS,
  addColumns,
  addRows,
  canAddColumn,
  cellToText,
  cellsByTitle,
  columnCounts,
  comparisonLayout,
  comparisonLimitError,
  cycleCellState,
  findColumn,
  findRow,
  isPublishable,
  moveColumn,
  moveRow,
  parseCell,
  parseCellValue,
  parseComparisonContent,
  removeColumn,
  setCell,
  updateColumn,
  updateRow,
  type ComparisonContent,
} from "@/lib/wiki-comparisons";

function plans(): ComparisonContent {
  return parseComparisonContent(
    [
      { id: "free", title: "Free" },
      { id: "pro", title: "Pro", highlight: true },
    ],
    [
      { id: "g1", kind: "group", label: "Core", cells: { free: { state: "yes" } } },
      { id: "r1", kind: "row", label: "Sync", cells: { free: { state: "no" }, pro: { state: "yes" } } },
      { id: "r2", kind: "row", label: "Storage", cells: { free: { state: "text", text: "1 GB" }, pro: { state: "text", text: "1 TB" } } },
    ],
  );
}

describe("parseComparisonContent — whatever is stored, a well-formed table comes out", () => {
  it("reads an unknown cell state as blank, never as a tick", () => {
    const c = parseComparisonContent(
      [{ id: "a", title: "A" }],
      [{ id: "r", kind: "row", label: "X", cells: { a: { state: "maybe" } } }],
    );
    expect(c.rows[0].cells).toEqual({});
  });

  it("drops cells keyed on a column that no longer exists", () => {
    const c = parseComparisonContent(
      [{ id: "a", title: "A" }],
      [{ id: "r", kind: "row", label: "X", cells: { a: { state: "yes" }, gone: { state: "yes" } } }],
    );
    expect(Object.keys(c.rows[0].cells)).toEqual(["a"]);
  });

  it("clips over-long text to the cell limit and blanks an empty text cell", () => {
    expect(parseCell({ state: "text", text: "x".repeat(200) }).text).toHaveLength(COMPARISON_LIMITS.maxText);
    expect(parseCell({ state: "text", text: "   " })).toEqual({ state: "none" });
  });

  it("gives a group no cells, even if the stored row had some", () => {
    expect(plans().rows[0]).toMatchObject({ kind: "group", cells: {} });
  });

  it("makes ids unique and stable: a repeated or missing id is replaced, a good one kept", () => {
    const c = parseComparisonContent(
      [{ id: "a", title: "A" }, { id: "a", title: "B" }, { title: "C" }],
      [{ id: "r", label: "x" }, { id: "r", label: "y" }],
    );
    const ids = c.columns.map((x) => x.id);
    expect(ids[0]).toBe("a");
    expect(new Set(ids).size).toBe(3);
    expect(new Set(c.rows.map((r) => r.id)).size).toBe(2);
    // Stable: parsing the parsed output again changes nothing.
    expect(parseComparisonContent(c.columns, c.rows)).toEqual(c);
  });

  it("clips a stored table past 45 columns on READ rather than failing to render", () => {
    const cols = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, title: `C${i}` }));
    expect(parseComparisonContent(cols, []).columns).toHaveLength(COMPARISON_LIMITS.maxColumns);
  });

  it("survives junk: non-arrays, nulls and strings yield an empty table", () => {
    expect(parseComparisonContent("nope", null)).toEqual({ columns: [], rows: [] });
    expect(parseComparisonContent([null, 3, "x"], [null, 1])).toEqual({ columns: [], rows: [] });
  });
});

describe("limits — refused on WRITE, with a sentence that says why", () => {
  it("accepts exactly 45 columns and refuses a 46th", () => {
    const at45 = { columns: Array.from({ length: 45 }, () => ({ title: "x" })), rows: [] };
    expect(comparisonLimitError(at45)).toBeNull();
    const at46 = { columns: Array.from({ length: 46 }, () => ({ title: "x" })), rows: [] };
    expect(comparisonLimitError(at46)).toMatch(/at most 45 columns/);
  });

  it("addColumns refuses to go past 45 and leaves the table untouched", () => {
    let c: ComparisonContent = { columns: [], rows: [] };
    c = addColumns(c, Array.from({ length: 44 }, (_, i) => ({ title: `C${i}` })));
    expect(canAddColumn(c)).toBe(true);
    c = addColumns(c, [{ title: "Last" }]);
    expect(canAddColumn(c)).toBe(false);
    expect(() => addColumns(c, [{ title: "One more" }])).toThrow(/45 columns/);
    expect(c.columns).toHaveLength(45);
  });

  it("addRows refuses to go past the row limit", () => {
    const c: ComparisonContent = { columns: [], rows: [] };
    const many = Array.from({ length: COMPARISON_LIMITS.maxRows + 1 }, () => ({ label: "x" }));
    expect(() => addRows(c, many)).toThrow(/rows/);
  });
});

describe("cells", () => {
  it("cycles ✓ → ◐ → ✕ → blank → ✓, and a text cell restarts at ✓", () => {
    expect(cycleCellState("yes")).toBe("partial");
    expect(cycleCellState("partial")).toBe("no");
    expect(cycleCellState("no")).toBe("none");
    expect(cycleCellState("none")).toBe("yes");
    expect(cycleCellState("text")).toBe("yes");
  });

  it.each([
    ["yes", "yes"], ["Y", "yes"], ["✓", "yes"], ["included", "yes"], [true, "yes"],
    ["no", "no"], ["✕", "no"], ["x", "no"], ["-", "no"], ["Not included", "no"], [false, "no"],
    ["partial", "partial"], ["Limited", "partial"], ["◐", "partial"],
    ["none", "none"], ["", "none"], [null, "none"], ["  ", "none"],
  ])("parseCellValue(%j) → %s", (input, state) => {
    expect(parseCellValue(input).state).toBe(state);
  });

  it("anything else is a short text value, clipped", () => {
    expect(parseCellValue("£9/mo")).toEqual({ state: "text", text: "£9/mo" });
    expect(parseCellValue("10 GB")).toEqual({ state: "text", text: "10 GB" });
    expect(parseCellValue("a".repeat(90)).text).toHaveLength(COMPARISON_LIMITS.maxText);
  });

  it("reads a cell back as words", () => {
    expect(cellToText({ state: "yes" })).toBe("yes");
    expect(cellToText({ state: "text", text: "1 TB" })).toBe("1 TB");
    expect(cellToText(undefined)).toBe("");
  });

  it("setCell to blank removes the cell; a group row has no cells to set", () => {
    const c = setCell(plans(), "r1", "free", { state: "none" });
    expect(c.rows[1].cells.free).toBeUndefined();
    expect(() => setCell(plans(), "g1", "free", { state: "yes" })).toThrow(/group heading/);
  });
});

describe("editing operations", () => {
  it("removing a column removes every cell under it", () => {
    const c = removeColumn(plans(), "pro");
    expect(c.columns.map((x) => x.id)).toEqual(["free"]);
    expect(c.rows.every((r) => !("pro" in r.cells))).toBe(true);
  });

  it("moves columns and rows, and ignores a move off either end", () => {
    expect(moveColumn(plans(), "pro", -1).columns.map((c) => c.id)).toEqual(["pro", "free"]);
    expect(moveColumn(plans(), "pro", 1).columns.map((c) => c.id)).toEqual(["free", "pro"]);
    expect(moveRow(plans(), "r2", -1).rows.map((r) => r.id)).toEqual(["g1", "r2", "r1"]);
  });

  it("renames and features a column; a blank rename keeps the old title", () => {
    let c = updateColumn(plans(), "free", { title: "Starter", highlight: true });
    expect(c.columns[0]).toMatchObject({ title: "Starter", highlight: true });
    c = updateColumn(c, "free", { title: "  " });
    expect(c.columns[0].title).toBe("Starter");
    c = updateColumn(c, "free", { highlight: false });
    expect(c.columns[0].highlight).toBeUndefined();
  });

  it("turning a row into a group clears its cells", () => {
    expect(updateRow(plans(), "r1", { kind: "group" }).rows[1].cells).toEqual({});
  });

  it("inserts rows at a position", () => {
    const c = addRows(plans(), [{ label: "New" }], 1);
    expect(c.rows.map((r) => r.label)).toEqual(["Core", "New", "Sync", "Storage"]);
  });
});

describe("finding by name — never a guess", () => {
  it("finds a column by id or by title, case- and spacing-insensitive", () => {
    expect(findColumn(plans(), "pro").title).toBe("Pro");
    expect(findColumn(plans(), "  FREE ").id).toBe("free");
  });

  it("refuses an ambiguous title rather than writing under the wrong plan", () => {
    const c = parseComparisonContent([{ id: "a", title: "Pro" }, { id: "b", title: "pro" }], []);
    expect(() => findColumn(c, "Pro")).toThrow(/matches 2 columns/);
  });

  it("names the columns that do exist when one is not found", () => {
    expect(() => findColumn(plans(), "Enterprise")).toThrow(/Columns: Free, Pro/);
    expect(() => findRow(plans(), "Nope")).toThrow(/No row/);
  });

  it("cellsByTitle keys cells by column id and drops blanks", () => {
    expect(cellsByTitle(plans(), { Free: "no", Pro: "" })).toEqual({ free: { state: "no" } });
    expect(() => cellsByTitle(plans(), { Enterprise: "yes" })).toThrow(/No column "Enterprise"/);
  });
});

describe("summary and publishing", () => {
  it("counts per column over FEATURE rows only (groups are not features)", () => {
    const [free, pro] = columnCounts(plans());
    expect(free).toMatchObject({ yes: 0, no: 1, text: 1, rows: 2 });
    expect(pro).toMatchObject({ yes: 1, no: 0, text: 1, rows: 2 });
  });

  it("is publishable only with a column and a labelled feature row", () => {
    expect(isPublishable(plans())).toBe(true);
    expect(isPublishable({ columns: [], rows: plans().rows })).toBe(false);
    expect(isPublishable(parseComparisonContent([{ id: "a", title: "A" }], [{ kind: "group", label: "G" }]))).toBe(false);
    expect(isPublishable(parseComparisonContent([{ id: "a", title: "A" }], [{ kind: "row", label: "  " }]))).toBe(false);
  });
});

describe("layout density by column count", () => {
  it.each([2, 3, 4, 5])("%i columns share the card width", (n) => {
    expect(comparisonLayout(n).mode).toBe("fit");
  });

  it.each([6, 12, 45])("%i columns scroll at a comfortable fixed width", (n) => {
    const l = comparisonLayout(n);
    expect(l.mode).toBe("scroll");
    expect(l.columnWidth).toBeGreaterThanOrEqual(110);
    expect(l.minTableWidth).toBe(l.featureWidth + n * l.columnWidth);
  });

  it("the switch happens exactly past FIT_MAX_COLUMNS", () => {
    expect(comparisonLayout(FIT_MAX_COLUMNS).mode).toBe("fit");
    expect(comparisonLayout(FIT_MAX_COLUMNS + 1).mode).toBe("scroll");
  });

  it("a compact (phone) two-column table fits a 390px card without scrolling", () => {
    // 390 viewport − 2×24px main padding − card borders ≈ 340px of card.
    expect(comparisonLayout(2, true).minTableWidth).toBeLessThanOrEqual(340);
  });
});

describe("templates", () => {
  it.each(COMPARISON_TEMPLATES.map((t) => [t.id, t] as const))("%s builds a valid, publishable table", (_, t) => {
    const c = t.build();
    expect(comparisonLimitError(c)).toBeNull();
    expect(isPublishable(c)).toBe(true);
    expect(parseComparisonContent(c.columns, c.rows)).toEqual(c);
  });
});
