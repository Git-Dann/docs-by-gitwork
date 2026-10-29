import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMN_LIMITS,
  boardLanes,
  laneKeyFor,
  newBoardColumnId,
  parseBoardColumns,
  type BoardColumnDef,
} from "@/lib/tasks/board-columns";

const QA: BoardColumnDef = { id: "col_qa000001", name: "QA", stage: "IN_REVIEW" };
const BLOCKED: BoardColumnDef = { id: "col_blk00001", name: "Blocked", stage: "DOING" };

describe("boardLanes", () => {
  it("keeps the five statuses in order with no custom columns", () => {
    expect(boardLanes([]).map((l) => l.key)).toEqual(["BACKLOG", "TODO", "DOING", "IN_REVIEW", "DONE"]);
  });

  it("puts each custom column straight after the status it counts as", () => {
    const lanes = boardLanes([QA, BLOCKED]);
    expect(lanes.map((l) => l.label)).toEqual(["Backlog", "To Do", "Doing", "Blocked", "In Review", "QA", "Done"]);
    expect(lanes.find((l) => l.key === QA.id)).toMatchObject({ stage: "IN_REVIEW", columnId: QA.id });
    expect(lanes.find((l) => l.key === "DOING")).toMatchObject({ columnId: null });
  });
});

describe("laneKeyFor", () => {
  it("places a task in its custom column while the status matches", () => {
    expect(laneKeyFor({ status: "IN_REVIEW", boardColumnId: QA.id }, [QA])).toBe(QA.id);
  });

  it("falls back to the status column when the task's status moved on", () => {
    // Moved to Done from the drawer: it must not stay in a column that counts as In review.
    expect(laneKeyFor({ status: "DONE", boardColumnId: QA.id }, [QA])).toBe("DONE");
  });

  it("falls back to the status column when the column was removed", () => {
    expect(laneKeyFor({ status: "IN_REVIEW", boardColumnId: QA.id }, [])).toBe("IN_REVIEW");
  });

  it("uses the status column when there is no column id", () => {
    expect(laneKeyFor({ status: "TODO", boardColumnId: null }, [QA])).toBe("TODO");
  });
});

describe("parseBoardColumns", () => {
  it("keeps valid columns and trims names", () => {
    expect(parseBoardColumns([{ ...QA, name: "  QA  " }])).toEqual([QA]);
  });

  it("drops anything malformed rather than throwing", () => {
    expect(
      parseBoardColumns([
        QA,
        { id: "bad", name: "x", stage: "DOING" },
        { id: "col_zzzzzz01", name: "   ", stage: "DOING" },
        { id: "col_zzzzzz02", name: "Retired", stage: "UI_DONE" },
        { ...QA, name: "Duplicate id" },
        null,
        "nope",
      ]),
    ).toEqual([QA]);
    expect(parseBoardColumns(null)).toEqual([]);
    expect(parseBoardColumns({})).toEqual([]);
  });

  it("caps the number of columns and the name length", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `col_${String(i).padStart(8, "0")}`, name: `${i}${"x".repeat(80)}`, stage: "DOING" }));
    const out = parseBoardColumns(many);
    expect(out).toHaveLength(BOARD_COLUMN_LIMITS.columns);
    expect(out[0].name).toHaveLength(BOARD_COLUMN_LIMITS.name);
  });

  it("accepts the ids it mints", () => {
    const id = newBoardColumnId();
    expect(parseBoardColumns([{ id, name: "QA", stage: "DONE" }])).toHaveLength(1);
  });
});

describe("Slack lines name the board column", () => {
  it("names the custom column, and nothing for a plain status column", async () => {
    const { columnNameFor } = await import("@/lib/tasks/board-columns");
    const { buildProjectUpdateCard } = await import("@/server/slack/blocks");
    expect(columnNameFor({ status: "IN_REVIEW", boardColumnId: QA.id }, [QA])).toBe("QA");
    expect(columnNameFor({ status: "DONE", boardColumnId: QA.id }, [QA])).toBeNull();

    const card = buildProjectUpdateCard({
      clientName: "Acme",
      clientSlug: "acme",
      who: "Dev",
      dateLabel: "2026-10-29",
      detail: "TITLES",
      note: null,
      groups: [
        {
          label: "In progress",
          tasks: [
            { taskId: "t1", title: "Retry payment", clientSlug: "acme", status: "IN_REVIEW", columnName: "QA" },
            { taskId: "t2", title: "Login screen", clientSlug: "acme", status: "DOING", columnName: null },
          ],
        },
      ],
    });
    const json = JSON.stringify(card.blocks);
    expect(json).toContain("Retry payment  _· QA_");
    // A plain status column adds nothing to the line.
    expect(json).toContain('• Login screen"');
  });
});

describe("column names", () => {
  it("drops a column whose name repeats another column or a status", () => {
    expect(
      parseBoardColumns([
        QA,
        { id: "col_qa000002", name: "qa", stage: "DOING" },
        { id: "col_rev00001", name: "In review", stage: "DOING" },
      ]),
    ).toEqual([QA]);
  });
});
