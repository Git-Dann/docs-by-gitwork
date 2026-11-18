/**
 * The Board's Table view rules (src/lib/wiki-board-table.ts): what a cell may edit and send,
 * grouping, sorting, paste and export, and which cards a bulk change reaches.
 */
import { describe, expect, it } from "vitest";
import {
  EDITABLE_COLUMNS,
  TABLE_COLUMN_KEYS,
  TABLE_PASTE_MAX,
  boardLists,
  bulkTargets,
  cellEditable,
  cellPatch,
  defaultGroupBy,
  exportTable,
  groupTableCards,
  parseBoardPrefs,
  planTablePaste,
  sortTableCards,
  type TableContext,
} from "../wiki-board-table";
import type { WikiBoardCard } from "@/types/wiki-board";

const ctx: TableContext = {
  lanes: [
    { key: "BACKLOG", label: "Future Idea" },
    { key: "TODO", label: "Up Next" },
    { key: "DOING", label: "In Development" },
    { key: "DONE", label: "Live Features" },
  ],
  releases: [
    { id: "r1", label: "v1.0" },
    { id: "r2", label: "v2.0" },
  ],
};
const pasteCtx = { ...ctx, addLaneKeys: ["BACKLOG", "TODO"] };

function card(id: string, over: Partial<WikiBoardCard> = {}): WikiBoardCard {
  return {
    id,
    title: id,
    itemType: "feature",
    tier: null,
    area: null,
    list: null,
    priority: "MEDIUM",
    estimateHours: null,
    status: "BACKLOG",
    laneKey: "BACKLOG",
    orderKey: 0,
    release: null,
    progress: null,
    dueDate: null,
    people: [],
    signOff: null,
    feedbackCount: 0,
    description: null,
    subtasks: [],
    images: [],
    stageHistory: [],
    doneAt: null,
    dependsOn: [],
    isCard: true,
    addedByClient: false,
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...over,
  };
}
const dev = card("dev", { itemType: null, isCard: false, title: "Backend: rounds endpoint" });
const added = card("added", { itemType: null, isCard: false, addedByClient: true });

describe("which cells may be edited", () => {
  it("never People: who works on a card isn't a table cell for anyone", () => {
    expect(EDITABLE_COLUMNS).not.toContain("people");
    expect(cellEditable(card("a"), "people", false)).toBe(false);
    expect(cellEditable(card("a"), "people", true)).toBe(false);
  });

  it("the client edits their cards' fields, but nothing on a team dev task", () => {
    for (const key of EDITABLE_COLUMNS) {
      expect(cellEditable(card("a"), key, true)).toBe(true);
      expect(cellEditable(dev, key, true)).toBe(false);
    }
  });

  it("a card the client added is theirs to edit even without a type", () => {
    expect(cellEditable(added, "title", true)).toBe(true);
  });

  it("the team only moves a dev task from here; its fields are edited on the task board", () => {
    expect(cellEditable(dev, "lane", false)).toBe(true);
    expect(cellEditable(dev, "title", false)).toBe(false);
    expect(cellEditable(dev, "list", false)).toBe(false);
  });

  it("readouts (depends on, screenshots, updated) are never edited in a cell", () => {
    for (const key of TABLE_COLUMN_KEYS.filter((k) => !(EDITABLE_COLUMNS as readonly string[]).includes(k))) {
      expect(cellEditable(card("a"), key, false)).toBe(false);
    }
  });
});

describe("what a cell edit sends", () => {
  it("exactly one field, never an assignee", () => {
    for (const [key, raw] of [
      ["title", "New name"],
      ["type", "bug"],
      ["list", "QA"],
      ["area", "Bags"],
      ["release", "r1"],
      ["priority", "HIGH"],
      ["tier", "premium"],
      ["hours", "4.5"],
      ["due", "21/11/2026"],
    ] as const) {
      const res = cellPatch(key, raw, ctx);
      expect(res.ok).toBe(true);
      if (!res.ok || !res.patch) throw new Error("no patch");
      expect(Object.keys(res.patch)).toHaveLength(1);
      expect(Object.keys(res.patch).some((k) => /assign/i.test(k))).toBe(false);
    }
  });

  it("reads a UK date and blank clears", () => {
    expect(cellPatch("due", "03/11/2026", ctx)).toEqual({ ok: true, patch: { dueDate: "2026-11-03" } });
    expect(cellPatch("due", "", ctx)).toEqual({ ok: true, patch: { dueDate: null } });
    expect(cellPatch("list", "  ", ctx)).toEqual({ ok: true, patch: { list: null } });
  });

  it("refuses what the server would, with a sentence", () => {
    expect(cellPatch("title", " ", ctx)).toMatchObject({ ok: false });
    expect(cellPatch("list", "x".repeat(81), ctx)).toMatchObject({ ok: false });
    expect(cellPatch("hours", "-1", ctx)).toMatchObject({ ok: false });
    expect(cellPatch("hours", "1001", ctx)).toMatchObject({ ok: false });
    expect(cellPatch("release", "r-other-client", ctx)).toMatchObject({ ok: false });
    expect(cellPatch("type", "subitem", ctx)).toMatchObject({ ok: false });
    expect(cellPatch("due", "next tuesday", ctx)).toMatchObject({ ok: false });
  });

  it("a column change is a move, not a field", () => {
    expect(cellPatch("lane", "DOING", ctx)).toEqual({ ok: true, patch: null });
    expect(cellPatch("lane", "NOPE", ctx)).toMatchObject({ ok: false });
  });
});

describe("grouping", () => {
  const cards = [
    card("a", { list: "Sprint 10" }),
    card("b", { list: null }),
    card("c", { list: "Sprint 2" }),
    card("d", { list: "sprint 2" }),
  ];

  it("defaults to List when any card is in one, otherwise the columns", () => {
    expect(defaultGroupBy(cards)).toBe("list");
    expect(defaultGroupBy([card("x")])).toBe("lane");
  });

  it("lists sort naturally, one group regardless of case, and No list comes last", () => {
    const groups = groupTableCards(cards, "list", ctx);
    expect(groups.map((g) => g.label)).toEqual(["Sprint 2", "Sprint 10", "No list"]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(["c", "d"]);
    expect(groups.at(-1)!.seed).toEqual({ list: null });
  });

  it("columns and releases keep the board's order, empty groups are left out, the unset group last", () => {
    const by = [card("a", { laneKey: "DONE" }), card("b", { laneKey: "BACKLOG" })];
    expect(groupTableCards(by, "lane", ctx).map((g) => g.label)).toEqual(["Future Idea", "Live Features"]);
    const rel = [card("a"), card("b", { release: { id: "r2", label: "v2.0" } }), card("c", { release: { id: "r1", label: "v1.0" } })];
    expect(groupTableCards(rel, "release", ctx).map((g) => g.label)).toEqual(["v1.0", "v2.0", "No release"]);
  });

  it("suggests each list once", () => {
    expect(boardLists(cards)).toEqual(["Sprint 2", "Sprint 10"]);
  });
});

describe("sorting", () => {
  it("blanks go last in both directions", () => {
    const cards = [card("none"), card("late", { dueDate: "2026-12-01T12:00:00.000Z" }), card("soon", { dueDate: "2026-11-02T12:00:00.000Z" })];
    expect(sortTableCards(cards, { key: "due", dir: "asc" }, ctx).map((c) => c.id)).toEqual(["soon", "late", "none"]);
    expect(sortTableCards(cards, { key: "due", dir: "desc" }, ctx).map((c) => c.id)).toEqual(["late", "soon", "none"]);
  });

  it("priority and column sort by rank, not alphabetically", () => {
    const cards = [card("m"), card("h", { priority: "HIGH" }), card("l", { priority: "LOW" })];
    expect(sortTableCards(cards, { key: "priority", dir: "asc" }, ctx).map((c) => c.id)).toEqual(["l", "m", "h"]);
    const lanes = [card("live", { laneKey: "DONE" }), card("idea", { laneKey: "BACKLOG" }), card("dev", { laneKey: "DOING" })];
    expect(sortTableCards(lanes, { key: "lane", dir: "asc" }, ctx).map((c) => c.id)).toEqual(["idea", "dev", "live"]);
  });

  it("numbers sort as numbers, and no sort keeps the board order", () => {
    const cards = [card("ten", { estimateHours: 10 }), card("two", { estimateHours: 2 }), card("none")];
    expect(sortTableCards(cards, { key: "hours", dir: "asc" }, ctx).map((c) => c.id)).toEqual(["two", "ten", "none"]);
    expect(sortTableCards(cards, null, ctx).map((c) => c.id)).toEqual(["ten", "two", "none"]);
  });
});

describe("pasting rows from Google Sheets", () => {
  it("maps the header to card fields and keeps every other cell in the description", () => {
    const text = "Issue\tType\tPriority\tBuild\tNotes\nBag sheet has two handles\tBug\tHigh\tPREPROD 2.0.1\tSeen on iOS";
    const plan = planTablePaste(text, pasteCtx, { list: "QA review" });
    expect(plan.mapping).toEqual(["title", "type", "priority", null, "description"]);
    expect(plan.cards).toHaveLength(1);
    expect(plan.cards[0]).toMatchObject({ title: "Bag sheet has two handles", itemType: "bug", priority: "HIGH", list: "QA review" });
    expect(plan.cards[0].description).toContain("**Build:** PREPROD 2.0.1");
    expect(plan.cards[0].description).toContain("Seen on iOS");
  });

  it("a value that doesn't fit its field is kept, not dropped", () => {
    const plan = planTablePaste("Title\tPriority\tDue\nA\tWhenever\tsoonish", pasteCtx);
    expect(plan.cards[0].priority).toBe("MEDIUM");
    expect(plan.cards[0].description).toContain("**Priority:** Whenever");
    expect(plan.cards[0].description).toContain("**Due:** soonish");
  });

  it("a later column is moved to after adding; an early one isn't", () => {
    const plan = planTablePaste("Title\tStatus\nA\tIn Development\nB\tUp Next", pasteCtx);
    expect(plan.cards.map((c) => c.moveToLaneKey)).toEqual(["DOING", null]);
  });

  it("with no header, the first column is the title", () => {
    const plan = planTablePaste("Saved filters\nRecent searches", pasteCtx);
    expect(plan.cards.map((c) => c.title)).toEqual(["Saved filters", "Recent searches"]);
  });

  it("rows without a title are left out and counted", () => {
    const plan = planTablePaste("Title\tNotes\nA\tx\n\tonly notes", pasteCtx);
    expect(plan.cards).toHaveLength(1);
    expect(plan.skippedRows).toBe(1);
    expect(plan.problems[0]).toMatch(/no title/);
  });

  it("stops at the paste limit and says so", () => {
    const text = ["Title", ...Array.from({ length: TABLE_PASTE_MAX + 5 }, (_, i) => `Row ${i}`)].join("\n");
    const plan = planTablePaste(text, pasteCtx);
    expect(plan.cards).toHaveLength(TABLE_PASTE_MAX);
    expect(plan.problems.join(" ")).toMatch(/first 200/);
  });

  it("a column chosen by hand wins over the guess", () => {
    const plan = planTablePaste("Name\tStuff\nA\tBags", pasteCtx, { mapping: ["title", "area"] });
    expect(plan.cards[0].area).toBe("Bags");
  });
});

describe("export", () => {
  it("neutralises a formula so the CSV can't run one when opened", () => {
    const csv = exportTable([card("a", { title: "=HYPERLINK(\"http://x\")" })], ["title"], ctx, ",");
    expect(csv.split("\r\n")[1]).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).not.toMatch(/\r\n=/);
  });

  it("a TSV keeps each value in one cell", () => {
    const tsv = exportTable([card("a", { title: "two\tparts" })], ["title", "lane"], ctx, "\t");
    expect(tsv).toBe("Title\tColumn\ntwo parts\tFuture Idea");
  });
});

describe("bulk changes", () => {
  const cards = [card("a"), dev, added, card("b")];
  const all = new Set(cards.map((c) => c.id));

  it("the client's bulk reaches only cards they may act on, and counts the rest", () => {
    const res = bulkTargets(cards, all, "priority", true);
    expect(res.cards.map((c) => c.id)).toEqual(["a", "added", "b"]);
    expect(res.skipped).toBe(1);
  });

  it("delete never reaches a dev task, even for the team", () => {
    expect(bulkTargets(cards, all, "delete", false).cards.map((c) => c.id)).not.toContain("dev");
    expect(bulkTargets(cards, all, "delete", true).cards.map((c) => c.id)).not.toContain("dev");
  });

  it("the team can move a dev task in bulk", () => {
    expect(bulkTargets(cards, all, "lane", false).cards.map((c) => c.id)).toContain("dev");
    expect(bulkTargets(cards, all, "lane", true).cards.map((c) => c.id)).not.toContain("dev");
  });

  it("only the selection", () => {
    expect(bulkTargets(cards, new Set(["b"]), "list", false).cards.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("this viewer's choices", () => {
  it("reads back what was saved, and ignores anything it doesn't recognise", () => {
    expect(parseBoardPrefs(JSON.stringify({ view: "table", groupBy: "release", sort: { key: "due", dir: "desc" } }))).toEqual({
      view: "table",
      groupBy: "release",
      sort: { key: "due", dir: "desc" },
    });
    expect(parseBoardPrefs(JSON.stringify({ view: "spreadsheet", groupBy: "people", sort: { key: "secret", dir: "up" } }))).toEqual({});
    expect(parseBoardPrefs("not json")).toEqual({});
    // The Schedule replaced the Calendar (§128): a remembered Calendar opens the Schedule.
    expect(parseBoardPrefs(JSON.stringify({ view: "calendar" }))).toEqual({ view: "schedule" });
    expect(parseBoardPrefs(null)).toEqual({});
  });
});
