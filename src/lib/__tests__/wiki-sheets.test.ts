import { describe, expect, it } from "vitest";
import {
  SHEET_LIMITS,
  cellText,
  clientCanDeleteRow,
  clientCanEditColumn,
  coerceCellValue,
  convertValues,
  deriveSheetRowStage,
  exportSheet,
  parseDelimited,
  parseRowCells,
  parseSheetColumns,
  parseSheetDate,
  planImport,
  rowTaskDescription,
  rowTaskTitle,
  safeSheetLink,
  shouldNotifyClientEdit,
  titleColumn,
  uniqueColumnTitle,
} from "@/lib/wiki-sheets";
import type { SheetColumn } from "@/types/wiki-sheets";

const col = (type: SheetColumn["type"], extra: Partial<SheetColumn> = {}): SheetColumn => ({
  id: `c-${type}`,
  title: type,
  type,
  clientEditable: true,
  ...extra,
});

describe("coerceCellValue — one rule per type, shared by the grid, the server and MCP", () => {
  it("empty in, null out, for every type (except a checkbox, where '' is false)", () => {
    for (const t of ["text", "long_text", "number", "date", "select", "link", "person"] as const) {
      expect(coerceCellValue(col(t, { options: ["A"] }), "  ")).toEqual({ ok: true, value: null });
      expect(coerceCellValue(col(t), null)).toEqual({ ok: true, value: null });
    }
    expect(coerceCellValue(col("checkbox"), "")).toEqual({ ok: true, value: false });
  });

  it("text collapses whitespace and is clipped; long text keeps its line breaks", () => {
    expect(coerceCellValue(col("text"), " a \n  b ")).toEqual({ ok: true, value: "a b" });
    const long = "x".repeat(SHEET_LIMITS.maxText + 50);
    const res = coerceCellValue(col("text"), long);
    expect(res.ok && String(res.value).length).toBe(SHEET_LIMITS.maxText);
    expect(coerceCellValue(col("long_text"), "line 1\r\nline 2")).toEqual({ ok: true, value: "line 1\nline 2" });
  });

  it("numbers accept what a pasted spreadsheet carries, and refuse what isn't one — in words", () => {
    expect(coerceCellValue(col("number"), "£1,200.50")).toEqual({ ok: true, value: 1200.5 });
    expect(coerceCellValue(col("number"), "15%")).toEqual({ ok: true, value: 15 });
    expect(coerceCellValue(col("number"), "-3")).toEqual({ ok: true, value: -3 });
    expect(coerceCellValue(col("number"), 7)).toEqual({ ok: true, value: 7 });
    const bad = coerceCellValue(col("number", { title: "Words" }), "twelve");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toContain('"Words" takes a number');
    expect(coerceCellValue(col("number"), Number.NaN).ok).toBe(false);
  });

  it("dates: ISO stays ISO, UK DD/MM/YYYY is read day-first, impossible dates are refused", () => {
    expect(parseSheetDate("2026-11-03")).toBe("2026-11-03");
    expect(parseSheetDate("03/11/2026")).toBe("2026-11-03");
    expect(parseSheetDate("3.11.2026")).toBe("2026-11-03");
    expect(parseSheetDate("2026-11-03T10:00:00Z")).toBe("2026-11-03");
    expect(parseSheetDate("31/02/2026")).toBeNull();
    expect(parseSheetDate("next tuesday")).toBeNull();
    expect(coerceCellValue(col("date"), "30/02/2026").ok).toBe(false);
  });

  it("select matches an option without case and stores the option's own spelling", () => {
    const c = col("select", { options: ["Low", "High"] });
    expect(coerceCellValue(c, "high")).toEqual({ ok: true, value: "High" });
    const bad = coerceCellValue(c, "Urgent");
    expect(!bad.ok && bad.error).toContain("must be one of: Low, High");
  });

  it("checkbox reads what Google Sheets / people write", () => {
    for (const t of ["TRUE", "yes", "1", "x", "✓"]) expect(coerceCellValue(col("checkbox"), t)).toEqual({ ok: true, value: true });
    for (const f of ["FALSE", "no", "0"]) expect(coerceCellValue(col("checkbox"), f)).toEqual({ ok: true, value: false });
    expect(coerceCellValue(col("checkbox"), "maybe").ok).toBe(false);
  });

  it("links: http(s) only — an allow-list, so javascript:/data:/vbscript:/file: never become an href", () => {
    expect(safeSheetLink("https://example.com/a")).toBe("https://example.com/a");
    expect(safeSheetLink("example.com/pricing")).toBe("https://example.com/pricing");
    // `javascript://host/%0a…` HAS a hostname, so only the protocol allow-list stops it.
    for (const bad of ["javascript:alert(1)", "javascript://example.com/%0aalert(1)", "ftp://example.com/x", "data:text/html,<b>x</b>", "vbscript:msgbox", "file:///etc/passwd", "not a url"]) {
      expect(safeSheetLink(bad), bad).toBeNull();
      expect(coerceCellValue(col("link"), bad).ok, bad).toBe(false);
    }
  });
});

describe("parsing stored JSON — whatever is stored, the grid gets a well-formed sheet", () => {
  it("columns: unknown type → text, duplicate ids made unique, options cleaned, width clamped", () => {
    const cols = parseSheetColumns([
      { id: "a", title: "  Name ", type: "nonsense" },
      { id: "a", title: "Dup", type: "select", options: ["x", "X", " y ", ""] },
      { id: "w", title: "W", type: "number", width: 9999, clientEditable: false },
      "garbage",
    ]);
    expect(cols).toHaveLength(3);
    expect(cols[0]).toMatchObject({ id: "a", title: "Name", type: "text", clientEditable: true });
    expect(cols[1].id).not.toBe("a");
    expect(cols[1].options).toEqual(["x", "y"]);
    expect(cols[2]).toMatchObject({ width: SHEET_LIMITS.maxWidth, clientEditable: false });
  });

  it("row cells: unknown columns dropped; a value the column can no longer hold is dropped, not drawn wrong", () => {
    const cols = [col("number"), col("text")];
    expect(parseRowCells({ "c-number": "abc", "c-text": "hi", "c-gone": "x" }, cols)).toEqual({ "c-text": "hi" });
    expect(parseRowCells("not an object", cols)).toEqual({});
  });

  it("changing a column's type converts values and counts the ones it couldn't", () => {
    const from = col("text");
    const to = col("number", { id: from.id });
    const { values, failed } = convertValues(from, to, ["12", "twelve", undefined]);
    expect(values).toEqual([12, null, null]);
    expect(failed).toBe(1);
    // date → text keeps the date readable the way the grid shows it
    expect(convertValues(col("date"), col("text"), ["2026-11-03"]).values).toEqual(["03/11/2026"]);
  });

  it("uniqueColumnTitle never produces a duplicate", () => {
    const cols = [col("text", { title: "Notes" }), col("number", { title: "Notes 2" })];
    expect(uniqueColumnTitle(cols, "notes")).toBe("notes 3");
    expect(uniqueColumnTitle(cols, "Other")).toBe("Other");
  });
});

describe("paste from Google Sheets / Excel", () => {
  it("tabs when the first line has one, else commas; quoted cells keep delimiters, newlines and quotes", () => {
    expect(parseDelimited("a\tb\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseDelimited('name,notes\n"Smith, J","said ""hi""\nthen left"')).toEqual([
      ["name", "notes"],
      ["Smith, J", 'said "hi"\nthen left'],
    ]);
    expect(parseDelimited("a\tb\r\n\r\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("with headers: matches columns by title; the team gets new columns, the client gets skips", () => {
    const cols = [col("text", { id: "item", title: "Item" }), col("select", { id: "pri", title: "Priority", options: ["Low", "High"] })];
    const grid = [["item", "Priority", "Owner"], ["Page", "high", "Priya"], ["", "", ""]];
    const team = planImport(grid, cols, { firstRowHeaders: true, allowNewColumns: true });
    expect(team.newColumns.map((c) => c.title)).toEqual(["Owner"]);
    expect(team.rows).toHaveLength(1);
    expect(team.rows[0]).toMatchObject({ item: "Page", pri: "High" });
    const client = planImport(grid, cols, { firstRowHeaders: true, allowNewColumns: false });
    expect(client.newColumns).toEqual([]);
    expect(client.skippedColumns).toEqual(["Owner"]);
  });

  it("a client never writes into a locked column through a paste", () => {
    const cols = [col("text", { id: "item", title: "Item" }), col("number", { id: "est", title: "Estimate", clientEditable: false })];
    const plan = planImport([["Item", "Estimate"], ["Page", "3"]], cols, {
      firstRowHeaders: true,
      allowNewColumns: false,
      isEditable: (c) => c.clientEditable,
    });
    expect(plan.rows[0]).toEqual({ item: "Page" });
    expect(plan.skippedColumns).toEqual(["Estimate"]);
  });

  it("values that don't fit are reported per row, not silently dropped", () => {
    const cols = [col("number", { id: "n", title: "N" })];
    const plan = planImport([["abc"]], cols, { firstRowHeaders: false, allowNewColumns: false });
    expect(plan.rows).toEqual([]);
    expect(plan.problems[0]).toContain("Row 1");
  });
});

describe("export", () => {
  const cols = [col("text", { id: "t", title: "Title" }), col("checkbox", { id: "b", title: "Done" })];

  it("CSV quotes what needs quoting and neutralises spreadsheet formulas", () => {
    const csv = exportSheet(cols, [{ cells: { t: 'A, "quoted"', b: true } }, { cells: { t: "=HYPERLINK(1)" } }], ",");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Title,Done");
    expect(lines[1]).toBe('"A, ""quoted""",TRUE');
    expect(lines[2]).toBe("'=HYPERLINK(1),");
  });

  it("TSV for the clipboard keeps each value in one cell", () => {
    const tsv = exportSheet(cols, [{ cells: { t: "two\nlines\tand tab" } }], "\t");
    expect(tsv.split("\n")[1]).toBe("two lines and tab\t");
  });

  it("can append the board stage as a column", () => {
    const csv = exportSheet(cols, [{ cells: {}, stage: "DONE" }], ",", { stageLabel: (s) => s ?? "" });
    expect(csv.split("\r\n")[0]).toBe("Title,Done,Board");
    expect(csv.split("\r\n")[1]).toBe(",,DONE");
  });
});

describe("the board stage is derived, never stored (§47.2)", () => {
  it("no task → not on the board", () => {
    expect(deriveSheetRowStage(null, null)).toBeNull();
    expect(deriveSheetRowStage(null, "DOING")).toBeNull();
  });

  it("a task the board can't find reads REVIEWING, never as scheduled", () => {
    expect(deriveSheetRowStage("task-1", null)).toBe("REVIEWING");
  });

  it("maps the board's columns to the Requests vocabulary", () => {
    expect(deriveSheetRowStage("t", "BACKLOG")).toBe("SCHEDULED");
    expect(deriveSheetRowStage("t", "TODO")).toBe("SCHEDULED");
    expect(deriveSheetRowStage("t", "DOING")).toBe("IN_PROGRESS");
    expect(deriveSheetRowStage("t", "UI_DONE")).toBe("IN_REVIEW");
    expect(deriveSheetRowStage("t", "DONE")).toBe("DONE");
  });
});

describe("sending a row to the board", () => {
  const cols = [
    col("text", { id: "item", title: "Item" }),
    col("select", { id: "pri", title: "Priority", options: ["High"] }),
    col("long_text", { id: "notes", title: "Notes" }),
    col("link", { id: "ref", title: "Ref" }),
  ];
  const sheet = { title: "Content", columns: cols, titleColumnId: null };

  it("the title comes from the chosen column, else the first text column", () => {
    expect(rowTaskTitle(sheet, { item: "Pricing page" })).toBe("Pricing page");
    expect(rowTaskTitle({ ...sheet, titleColumnId: "pri" }, { item: "x", pri: "High" })).toBe("High");
    expect(rowTaskTitle(sheet, { pri: "High" })).toBeNull();
    expect(titleColumn(cols, "missing")?.id).toBe("item");
  });

  it("the description carries every other cell and a link back", () => {
    const d = rowTaskDescription(sheet, { item: "P", pri: "High", notes: "a\nb", ref: "https://x.com/" }, "/app/portal/n/wiki#sheets");
    expect(d).toContain("**Priority:** High");
    expect(d).toContain("**Notes:**\na\nb");
    expect(d).toContain("**Ref:** https://x.com/");
    expect(d).not.toContain("**Item:**");
    expect(d).toContain("[Content](/app/portal/n/wiki#sheets)");
  });
});

describe("what the client may do", () => {
  const sheet = { clientCanEdit: true, clientCanAddRows: true, clientCanSendToBoard: false };

  it("a cell is editable only when the sheet AND the column allow it", () => {
    expect(clientCanEditColumn(sheet, { clientEditable: true })).toBe(true);
    expect(clientCanEditColumn(sheet, { clientEditable: false })).toBe(false);
    expect(clientCanEditColumn({ ...sheet, clientCanEdit: false }, { clientEditable: true })).toBe(false);
  });

  it("a client removes only rows they added, by their own wiki user id", () => {
    expect(clientCanDeleteRow({ createdByKind: "CLIENT", createdByWikiUserId: "u1" }, "u1")).toBe(true);
    expect(clientCanDeleteRow({ createdByKind: "CLIENT", createdByWikiUserId: "u1" }, "u2")).toBe(false);
    expect(clientCanDeleteRow({ createdByKind: "TEAM", createdByWikiUserId: null }, null)).toBe(false);
    expect(clientCanDeleteRow({ createdByKind: "CLIENT", createdByWikiUserId: null }, null)).toBe(false);
  });

  it("the team is told about client edits at most once per 15 minutes per sheet", () => {
    const t = new Date("2026-10-20T10:00:00Z");
    expect(shouldNotifyClientEdit(null, t)).toBe(true);
    expect(shouldNotifyClientEdit(new Date("2026-10-20T09:50:00Z"), t)).toBe(false);
    expect(shouldNotifyClientEdit(new Date("2026-10-20T09:45:00Z"), t)).toBe(true);
  });
});

describe("display", () => {
  it("dates read UK-style; checkboxes read TRUE/FALSE", () => {
    expect(cellText(col("date"), "2026-11-03")).toBe("03/11/2026");
    expect(cellText(col("checkbox"), false)).toBe("FALSE");
    expect(cellText(col("text"), undefined)).toBe("");
  });
});
