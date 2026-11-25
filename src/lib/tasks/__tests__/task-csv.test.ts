import { describe, expect, it } from "vitest";
import {
  TASK_CSV_COLUMNS,
  importRowPatch,
  parseTaskList,
  planImportRows,
  splitAssigneeCell,
  tasksToCsv,
} from "../task-csv";
import type { TaskDTO } from "@/types/tasks";

function task(over: Partial<TaskDTO> = {}): TaskDTO {
  return {
    id: "ckabc123",
    title: "Fix login",
    status: "DOING",
    priority: "HIGH",
    assignees: [{ id: "u1", name: "Ali Sher" }, { id: "u2", name: "Sara" }],
    dueDate: "2026-12-01T00:00:00.000Z",
    featureBlock: { id: "b1", name: "Auth" },
    release: { id: "r1", version: "v2.0.0" },
    description: "Steps, then a fix",
    ...over,
  } as unknown as TaskDTO;
}

describe("tasksToCsv", () => {
  it("writes the import dialog's columns, with Task ID first", () => {
    const [head, row] = tasksToCsv([task()]).split("\r\n");
    expect(head).toBe(TASK_CSV_COLUMNS.join(","));
    expect(row).toBe("ckabc123,Fix login,Doing,High,Ali Sher; Sara,2026-12-01,Auth,v2.0.0,\"Steps, then a fix\"");
  });

  it("can't smuggle a spreadsheet formula through a title", () => {
    const row = tasksToCsv([task({ title: "=HYPERLINK(\"x\")" })]).split("\r\n")[1];
    expect(row).toContain("'=HYPERLINK");
  });

  it("leaves empty cells empty", () => {
    const row = tasksToCsv([
      task({ assignees: [], dueDate: null, featureBlock: null, release: null, description: null }),
    ]).split("\r\n")[1];
    expect(row).toBe("ckabc123,Fix login,Doing,High,,,,,");
  });
});

describe("splitAssigneeCell", () => {
  it("reads several assignees back out of one cell", () => {
    expect(splitAssigneeCell("Ali Sher; Sara ;")).toEqual(["Ali Sher", "Sara"]);
    expect(splitAssigneeCell("")).toEqual([]);
  });
});

describe("planImportRows", () => {
  const onThisClient = new Set(["t1", "t2"]);

  it("updates rows whose id is on this client, creates rows with no id", () => {
    const plan = planImportRows([{ id: "t1" }, {}, { id: "t2" }], onThisClient);
    expect(plan.updates.map((r) => r.id)).toEqual(["t1", "t2"]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.notFound).toBe(0);
  });

  it("skips an id from another client: never touched, never created as a copy", () => {
    const plan = planImportRows([{ id: "other-client-task" }], onThisClient);
    expect(plan.updates).toHaveLength(0);
    expect(plan.creates).toHaveLength(0);
    expect(plan.notFound).toBe(1);
  });
});

describe("importRowPatch", () => {
  it("only changes what the row carries: a blank cell is left alone, never cleared", () => {
    expect(importRowPatch({ title: "", status: "DONE" })).toEqual({ status: "DONE" });
    expect(importRowPatch({ title: "New name", description: null, assigneeIds: [] })).toEqual({ title: "New name" });
  });
});

describe("parseTaskList", () => {
  it("takes one task per line, stripping bullets, numbering and checkboxes", () => {
    const out = parseTaskList("- Fix login\n\n2. Add export\n* [ ] Write docs\n• Tidy up\n   \nPlain line");
    expect(out.titles).toEqual(["Fix login", "Add export", "Write docs", "Tidy up", "Plain line"]);
  });

  it("keeps an abbreviation that only looks like a list marker", () => {
    expect(parseTaskList("e.g. tidy the footer").titles).toEqual(["e.g. tidy the footer"]);
  });

  it("shortens over-long lines and says so", () => {
    const out = parseTaskList("x".repeat(250));
    expect(out.titles[0]).toHaveLength(200);
    expect(out.shortened).toBe(1);
  });

  it("stops at 1,000 tasks and counts the rest", () => {
    const out = parseTaskList(Array.from({ length: 1003 }, (_, i) => `Task ${i}`).join("\n"));
    expect(out.titles).toHaveLength(1000);
    expect(out.overLimit).toBe(3);
  });
});
