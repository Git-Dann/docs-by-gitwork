/**
 * Moving sheet rows onto the Board (CLAUDE.md §127): the pure plan. Fixtures are the shapes of
 * Big Wedge's two real sheets (a QA review and a front-end backlog), with made-up wording.
 */
import { describe, expect, it } from "vitest";
import {
  columnForStatus,
  isQaSheet,
  itemTypeFromCell,
  planSheetsToBoard,
  priorityFromCell,
  sheetRowRef,
  type LinkedTask,
  type SheetInput,
} from "@/lib/sheets-to-board";
import { cellText, parseRowCells, parseSheetColumns } from "@/lib/table/cells";
import type { BoardColumnDef } from "@/lib/tasks/board-columns";

const QA_COLUMNS = [
  { id: "c1", title: "Ref", type: "text", clientEditable: true },
  { id: "c2", title: "Issue", type: "text", clientEditable: true },
  { id: "c3", title: "Area", type: "text", clientEditable: true },
  { id: "c4", title: "Expected", type: "long_text", clientEditable: true },
  { id: "c5", title: "Scope", type: "select", options: ["App-wide", "Screen-specific"], clientEditable: true },
  { id: "c6", title: "Type", type: "select", options: ["UI", "Behaviour", "Bug"], clientEditable: true },
  { id: "c7", title: "Priority", type: "select", options: ["High", "Medium", "Low"], clientEditable: true },
  { id: "c8", title: "Platform", type: "select", options: ["iOS", "All"], clientEditable: true },
  { id: "c9", title: "Build", type: "text", clientEditable: true },
  { id: "c10", title: "Notes", type: "long_text", clientEditable: true },
  { id: "c11", title: "Screenshots", type: "media", clientEditable: true },
  { id: "c12", title: "Reported by", type: "person", clientEditable: true },
];

const UPLOAD_KEY = "a".repeat(40);
const QA_ROW_CELLS = {
  c1: "06",
  c2: "Club suggestion shows the wrong club",
  c3: "Rounds",
  c4: "The suggested club matches the distance to the pin.",
  c5: "Screen-specific",
  c6: "UI",
  c7: "High",
  c8: "iOS",
  c9: "PREPROD v2.0.1 b1",
  c10: "Seen twice on the 14th.",
  c11: [
    { url: `/api/wiki/files/${UPLOAD_KEY}/club.jpg`, title: "14:36 Club suggestion" },
    { url: "https://example.com/recording.mp4", title: "Recording" },
  ],
  c12: { id: "team:u1", name: "Dan Lindsay", kind: "TEAM" },
};

const BACKLOG_COLUMNS = [
  { id: "col-1", title: "Item", type: "text", clientEditable: true },
  { id: "col-2", title: "Area", type: "text", clientEditable: true },
  { id: "col-3", title: "Detail", type: "long_text", clientEditable: true },
  { id: "col-4", title: "Priority", type: "select", options: ["High", "Medium", "Low"], clientEditable: true },
  { id: "col-5", title: "Effort", type: "select", options: ["Small", "Medium", "Large"], clientEditable: true },
  { id: "col-6", title: "Status", type: "select", options: ["In review doc", "Future item", "Excluded", "To decide"], clientEditable: true },
  { id: "col-9", title: "Luke's notes", type: "long_text", clientEditable: true },
];

const WEDGE_COLUMNS: BoardColumnDef[] = [
  { id: "future-idea", name: "Future Idea", stage: "BACKLOG", isDefault: true },
  { id: "triage", name: "Triage", stage: "BACKLOG" },
  { id: "up-next", name: "Up Next (Assign Hours)", stage: "TODO", isDefault: true },
  { id: "live", name: "Live Features", stage: "DONE", isDefault: true },
];

function qaSheet(rows: SheetInput["rows"]): SheetInput {
  return { id: "s-qa", title: "QA review: 20 Oct 2026", columns: QA_COLUMNS, titleColumnId: "c2", rows };
}
function backlogSheet(rows: SheetInput["rows"]): SheetInput {
  return { id: "s-fe", title: "Front-end backlog", columns: BACKLOG_COLUMNS, titleColumnId: "col-1", rows };
}
const row = (id: string, cells: unknown, taskId: string | null = null): SheetInput["rows"][number] => ({
  id,
  cells,
  taskId,
  createdByKind: "TEAM",
  createdByName: "Dan Lindsay",
});

const plan = (sheets: SheetInput[], opts: { refs?: string[]; tasks?: LinkedTask[] } = {}) =>
  planSheetsToBoard({
    clientId: "wedge",
    sheets,
    existingRefs: new Set(opts.refs ?? []),
    linkedTasks: new Map((opts.tasks ?? []).map((t) => [t.id, t])),
    boardColumns: WEDGE_COLUMNS,
  });

const devTask = (over: Partial<LinkedTask> = {}): LinkedTask => ({
  id: "dev1",
  clientId: "wedge",
  status: "DONE",
  itemType: null,
  productCardId: null,
  boardList: null,
  startedAt: "2026-10-21T09:00:00.000Z",
  completedAt: "2026-10-23T16:15:37.000Z",
  ...over,
});

describe("every cell is carried", () => {
  it("each non-empty cell of a row is in the card's title or description", () => {
    const p = plan([qaSheet([row("r1", QA_ROW_CELLS)])]);
    const card = p.rows[0];
    const text = `${card.title}\n${card.description}`;
    const columns = parseSheetColumns(QA_COLUMNS);
    const cells = parseRowCells(QA_ROW_CELLS, columns);
    for (const c of columns) {
      const v = cells[c.id];
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const m of v) expect(text, `${c.title}: ${m.url}`).toContain(m.url);
        continue;
      }
      expect(text, c.title).toContain(cellText(c, v));
    }
    expect(card.cellsCarried).toBe(12);
    expect(card.description).toContain("**Expected:**");
    expect(card.description).toContain('From the sheet "QA review: 20 Oct 2026"');
  });

  it("the title comes from the sheet's title column, and an empty one never loses the row", () => {
    const p = plan([backlogSheet([row("r1", { "col-2": "Weather", "col-3": "Only detail" })])]);
    expect(p.rows[0].title).toBe('Untitled row from "Front-end backlog"');
    expect(p.rows[0].description).toContain("Only detail");
    expect(p.rows[0].action).toBe("create");
  });

  it("an uploaded screenshot is copied; a link elsewhere stays a link", () => {
    const p = plan([qaSheet([row("r1", QA_ROW_CELLS)])]);
    expect(p.rows[0].uploads).toEqual([{ key: UPLOAD_KEY, filename: "club.jpg" }]);
    expect(p.counts.uploads).toBe(1);
  });
});

describe("type, priority, area and lane", () => {
  it("a QA sheet makes bugs; a backlog makes features; the row's own Type wins when it names a card type", () => {
    expect(isQaSheet("QA review: 20 Oct 2026", [])).toBe(true);
    expect(isQaSheet("Front-end backlog", parseSheetColumns(BACKLOG_COLUMNS))).toBe(false);
    expect(isQaSheet("Launch list", parseSheetColumns(QA_COLUMNS))).toBe(true); // Expected / Build
    const p = plan([
      qaSheet([row("r1", QA_ROW_CELLS)]),
      backlogSheet([row("r2", { "col-1": "Weather refresh" }), row("r3", { "col-1": "Odd one", "col-2": "X" })]),
    ]);
    expect(p.rows.map((r) => r.itemType)).toEqual(["bug", "feature", "feature"]);
    expect(itemTypeFromCell("Feedback")).toBe("feedback");
    expect(itemTypeFromCell("UI")).toBeNull();
  });

  it("priority maps High / Medium / Low (Urgent counts as High), anything else is Medium", () => {
    expect(priorityFromCell("High")).toBe("HIGH");
    expect(priorityFromCell("urgent")).toBe("HIGH");
    expect(priorityFromCell("Low")).toBe("LOW");
    expect(priorityFromCell("whenever")).toBeNull();
    const p = plan([backlogSheet([row("r1", { "col-1": "A", "col-4": "Low" }), row("r2", { "col-1": "B" })])]);
    expect(p.rows.map((r) => r.priority)).toEqual(["LOW", "MEDIUM"]);
  });

  it("Area goes on the card's area", () => {
    expect(plan([qaSheet([row("r1", QA_ROW_CELLS)])]).rows[0].area).toBe("Rounds");
  });

  it("a Status that names a backlog column lands there; anything unclear goes to the default lane", () => {
    expect(columnForStatus("Future item", WEDGE_COLUMNS)?.id).toBe("future-idea");
    expect(columnForStatus("To decide", WEDGE_COLUMNS)?.id).toBe("triage");
    expect(columnForStatus("In review doc", WEDGE_COLUMNS)?.id).toBe("triage");
    expect(columnForStatus("Excluded", WEDGE_COLUMNS)).toBeNull();
    // Never further along than To do: a row that wasn't sent isn't work in progress.
    expect(columnForStatus("Live Features", WEDGE_COLUMNS)).toBeNull();
    const p = plan([
      backlogSheet([row("r1", { "col-1": "A", "col-6": "To decide" }), row("r2", { "col-1": "B", "col-6": "Excluded" })]),
    ]);
    expect(p.rows.map((r) => [r.status, r.columnId])).toEqual([
      ["BACKLOG", "triage"],
      ["BACKLOG", null],
    ]);
    // The original Status still travels in the description.
    expect(p.rows[1].description).toContain("**Status:** Excluded");
  });

  it("every card goes in a list named after its sheet", () => {
    const p = plan([qaSheet([row("r1", QA_ROW_CELLS)]), backlogSheet([row("r2", { "col-1": "A" })])]);
    expect(p.rows.map((r) => r.boardList)).toEqual(["QA review: 20 Oct 2026", "Front-end backlog"]);
  });
});

describe("rows already sent to the board", () => {
  it("a sent row gets a card in its task's status, linked to that dev task", () => {
    const p = plan([qaSheet([row("r1", QA_ROW_CELLS, "dev1")])], { tasks: [devTask()] });
    const r = p.rows[0];
    expect(r.action).toBe("create");
    expect(r.status).toBe("DONE");
    expect(r.columnId).toBeNull(); // the Done status's default lane (Live Features)
    expect(r.linkDevTaskId).toBe("dev1");
    expect(r.completedAt).toBe("2026-10-23T16:15:37.000Z");
    expect(p.counts.linkDevTask).toBe(1);
  });

  it("a dev task that already delivers another card is not relinked", () => {
    const r = plan([qaSheet([row("r1", QA_ROW_CELLS, "dev1")])], { tasks: [devTask({ productCardId: "other" })] }).rows[0];
    expect(r.action).toBe("create");
    expect(r.linkDevTaskId).toBeNull();
    expect(r.note).toMatch(/already delivers another card/);
  });

  it("a task that's already a product card just joins the list (once)", () => {
    const card = devTask({ itemType: "feature" });
    expect(plan([backlogSheet([row("r1", { "col-1": "A" }, "dev1")])], { tasks: [card] }).rows[0]).toMatchObject({ action: "join-card", cardTaskId: "dev1" });
    expect(plan([backlogSheet([row("r1", { "col-1": "A" }, "dev1")])], { tasks: [{ ...card, boardList: "Front-end backlog" }] }).rows[0].action).toBe("already");
  });

  it("⚠️ a task on another client is treated as never sent — never linked, never read", () => {
    const r = plan([qaSheet([row("r1", QA_ROW_CELLS, "dev1")])], { tasks: [devTask({ clientId: "someone-else" })] }).rows[0];
    expect(r.linkDevTaskId).toBeNull();
    expect(r.status).toBe("BACKLOG");
    expect(r.completedAt).toBeNull();
  });

  it("a task that's gone is treated as never sent, and says so", () => {
    const r = plan([qaSheet([row("r1", QA_ROW_CELLS, "gone")])]).rows[0];
    expect(r.linkDevTaskId).toBeNull();
    expect(r.status).toBe("BACKLOG");
    expect(r.note).toMatch(/no longer exists/);
  });
});

describe("idempotent", () => {
  it("a row whose card already exists is skipped, and carries nothing twice", () => {
    const p = plan([qaSheet([row("r1", QA_ROW_CELLS), row("r2", { c2: "Second" })])], { refs: [sheetRowRef("r1")] });
    expect(p.rows.map((r) => r.action)).toEqual(["already", "create"]);
    expect(p.counts).toMatchObject({ create: 1, already: 1, cellsCarried: 1, uploads: 0 });
  });
});
