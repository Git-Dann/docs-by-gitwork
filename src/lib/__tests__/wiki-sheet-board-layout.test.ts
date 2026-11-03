/**
 * §73.1's pure rules: row order, resize bounds, automatic column widths, the person
 * directory match, and the Board column tracker (assignees, overdue, the client's copy).
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clampColumnWidth,
  clampRowHeight,
  localLayoutKey,
  mergeRowOrder,
  moveRow,
  planRowMove,
  readLocalLayout,
  writeLocalLayout,
} from "@/lib/wiki-sheet-layout";
import {
  UNASSIGNED,
  assigneeOptions,
  deriveRowTask,
  isTaskOverdue,
  matchesAssignee,
  publicRowTask,
  shortPersonName,
  stageSummary,
  taskAssignees,
} from "@/lib/wiki-sheet-board";
import {
  AUTO_WIDTH_BOUNDS,
  coerceCellValue,
  estimateColumnWidth,
  personInitials,
  planImport,
  resolvePersonRef,
  sameCellValue,
} from "@/lib/wiki-sheets";
import type { SheetColumn, SheetPerson, WikiSheetRow } from "@/types/wiki-sheets";

afterEach(() => window.localStorage.clear());

describe("row order", () => {
  it("moveRow moves by id, both directions; unknown ids change nothing", () => {
    expect(moveRow(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveRow(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveRow(["a", "b"], "zz", "a")).toEqual(["a", "b"]);
  });

  it("mergeRowOrder: wanted first (unknown + repeats dropped), the rest after in their order", () => {
    expect(mergeRowOrder(["a", "b", "c", "d"], ["c", "x", "a", "c"])).toEqual(["c", "a", "b", "d"]);
    expect(mergeRowOrder(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("planRowMove: before / after, and a sentence when it can't", () => {
    expect(planRowMove(["a", "b", "c"], { row: "c", before: "a" })).toEqual(["c", "a", "b"]);
    expect(planRowMove(["a", "b", "c"], { row: "a", after: "c" })).toEqual(["b", "c", "a"]);
    expect(() => planRowMove(["a", "b"], { row: "a" })).toThrow(/exactly one/);
    expect(() => planRowMove(["a", "b"], { row: "a", before: "b", after: "b" })).toThrow(/exactly one/);
    expect(() => planRowMove(["a", "b"], { row: "q", before: "a" })).toThrow(/isn't in this sheet/);
  });
});

describe("resize bounds", () => {
  it("columns 60–600px, rows 28–300px; a row's null stays auto", () => {
    expect(clampColumnWidth(10)).toBe(60);
    expect(clampColumnWidth(9999)).toBe(600);
    expect(clampColumnWidth(123.6)).toBe(124);
    expect(clampRowHeight(4)).toBe(28);
    expect(clampRowHeight(1000)).toBe(300);
    expect(clampRowHeight(null)).toBeNull();
    expect(clampRowHeight(Number.NaN)).toBeNull();
  });

  it("a client's local layout round-trips, clamps what it reads, and keeps 0 as 'auto here'", () => {
    writeLocalLayout("s1", { cols: { a: 150 }, rows: { r: 80, r2: 0 } });
    expect(readLocalLayout("s1")).toEqual({ cols: { a: 150 }, rows: { r: 80, r2: 0 } });
    window.localStorage.setItem(localLayoutKey("s2"), JSON.stringify({ cols: { a: 99999, b: "x" }, rows: { r: 1 } }));
    expect(readLocalLayout("s2")).toEqual({ cols: { a: 600 }, rows: { r: 28 } });
    window.localStorage.setItem(localLayoutKey("s3"), "{not json");
    expect(readLocalLayout("s3")).toEqual({ cols: {}, rows: {} });
  });
});

describe("automatic column widths", () => {
  const col = (type: SheetColumn["type"], title: string): SheetColumn => ({ id: "c", title, type, clientEditable: true });

  it("a short REF column of 01, 02, 03 comes out narrow — the bug Harry saw at ~400px", () => {
    const w = estimateColumnWidth(col("text", "Ref"), ["01", "02", "03"]);
    expect(w).toBeLessThanOrEqual(80);
    expect(w).toBeGreaterThanOrEqual(AUTO_WIDTH_BOUNDS.text.min);
  });

  it("long text is capped at its type's maximum, however long the value", () => {
    const essay = "A very long note that goes on and on. ".repeat(40);
    expect(estimateColumnWidth(col("long_text", "Notes"), [essay])).toBe(AUTO_WIDTH_BOUNDS.long_text.max);
    expect(estimateColumnWidth(col("text", "Item"), [essay])).toBe(AUTO_WIDTH_BOUNDS.text.max);
  });

  it("the header counts, numbers/checkboxes stay narrow, and only the sample is read", () => {
    expect(estimateColumnWidth(col("number", "Words"), [650, 1800])).toBeLessThanOrEqual(AUTO_WIDTH_BOUNDS.number.max);
    expect(estimateColumnWidth(col("checkbox", "Done"), [true])).toBeLessThan(80);
    const longHeader = estimateColumnWidth(col("text", "Our estimate in working days"), ["3"]);
    expect(longHeader).toBeGreaterThan(200);
    const sampled = estimateColumnWidth(col("text", "X"), ["a", "b", "x".repeat(40)], { sample: 2 });
    expect(sampled).toBeLessThan(80);
  });

  it("is deterministic — same input, same width", () => {
    const vals = ["Pricing page", "Class timetable filters"];
    expect(estimateColumnWidth(col("text", "Item"), vals)).toBe(estimateColumnWidth(col("text", "Item"), vals));
  });
});

describe("people", () => {
  const people = [
    { id: "client:wu-priya", name: "Priya Shah", kind: "CLIENT" as const, email: "priya@acme.com" },
    { id: "team:u-sam", name: "Sam Okafor", kind: "TEAM" as const, email: "sam@gitwork.co.uk" },
    { id: "team:u-sam2", name: "Sam Okafor", kind: "TEAM" as const, email: "sam.o@gitwork.co.uk" },
  ];

  it("matches exactly one person by email or name, without case; never returns the email", () => {
    expect(resolvePersonRef(people, "PRIYA@acme.com")).toEqual({ ok: true, person: { id: "client:wu-priya", name: "Priya Shah", kind: "CLIENT" } });
    expect(resolvePersonRef(people, "  priya   shah ")).toMatchObject({ ok: true });
  });

  it("two people with the same name are ambiguous — resolved by email, not guessed", () => {
    expect(resolvePersonRef(people, "Sam Okafor")).toMatchObject({ ok: false, reason: "ambiguous" });
    expect(resolvePersonRef(people, "sam.o@gitwork.co.uk")).toMatchObject({ ok: true, person: { id: "team:u-sam2" } });
  });

  it("no fuzzy match: a near-miss is 'none'", () => {
    expect(resolvePersonRef(people, "Priya")).toMatchObject({ ok: false, reason: "none" });
  });

  it("a person value must look like a directory entry; legacy text is still text", () => {
    const PERSON: SheetColumn = { id: "p", title: "Owner", type: "person", clientEditable: true };
    expect(coerceCellValue(PERSON, { id: "client:wu-priya", name: "Priya Shah", kind: "CLIENT" }).ok).toBe(true);
    expect(coerceCellValue(PERSON, { id: "admin", name: "x", kind: "TEAM" }).ok).toBe(false);
    expect(coerceCellValue(PERSON, { id: "team:u-1", name: "x", kind: "OWNER" }).ok).toBe(false);
    expect(coerceCellValue(PERSON, "Tom Riley")).toEqual({ ok: true, value: "Tom Riley" });
    expect(personInitials("Priya Shah")).toBe("PS");
    expect(sameCellValue({ id: "team:a", name: "A", kind: "TEAM" }, { id: "team:a", name: "A", kind: "TEAM" })).toBe(true);
  });

  it("a paste resolves names it can, keeps the rest as text, and counts them for the preview", () => {
    const PERSON: SheetColumn = { id: "p", title: "Owner", type: "person", clientEditable: true };
    const plan = planImport([["Owner"], ["Priya Shah"], ["Sam Okafor"], ["Someone Else"]], [PERSON], {
      firstRowHeaders: true,
      allowNewColumns: false,
      people: people as SheetPerson[],
    });
    expect(plan.rows[0].p).toMatchObject({ id: "client:wu-priya" });
    expect(plan.rows[1].p).toBe("Sam Okafor"); // ambiguous → text, not a guess
    expect(plan.rows[2].p).toBe("Someone Else");
    expect(plan.unmatchedPeople).toBe(2);
  });
});

describe("the Board column tracker", () => {
  const base = {
    title: "Pricing page",
    status: "DOING",
    dueDate: new Date("2026-10-10T00:00:00Z"),
    updatedAt: new Date("2026-10-18T10:00:00Z"),
    startedAt: new Date("2026-10-11T09:00:00Z"),
    completedAt: null,
    assignees: [],
    assignee: null,
  };

  it("assignees: the join wins; the legacy assignee is the fallback; nobody is []", () => {
    expect(taskAssignees({ assignees: [{ name: "Waqar Ali", email: "w@x" }], assignee: { name: "Old", email: "o@x" } })).toEqual(["Waqar Ali"]);
    expect(taskAssignees({ assignees: [], assignee: { name: null, email: "legacy@x.com" } })).toEqual(["legacy"]);
    expect(taskAssignees({ assignees: [], assignee: null })).toEqual([]);
  });

  it("overdue = not done and due before today (UTC) — due today isn't overdue yet", () => {
    const now = new Date("2026-10-20T15:00:00Z");
    expect(isTaskOverdue({ dueDate: "2026-10-19" }, "IN_PROGRESS", now)).toBe(true);
    expect(isTaskOverdue({ dueDate: "2026-10-20" }, "IN_PROGRESS", now)).toBe(false);
    expect(isTaskOverdue({ dueDate: "2026-10-19" }, "DONE", now)).toBe(false);
    expect(isTaskOverdue({ dueDate: null }, "SCHEDULED", now)).toBe(false);
  });

  it("completedAt only shows on a done task", () => {
    expect(deriveRowTask({ ...base, completedAt: new Date("2026-10-12T00:00:00Z") }).completedAt).toBeNull();
    expect(deriveRowTask({ ...base, status: "DONE", completedAt: new Date("2026-10-12T00:00:00Z") }).completedAt).toBe("2026-10-12T00:00:00.000Z");
  });

  it("the client's copy: no title, first name + last initial, and no field it wasn't built with", () => {
    const team = deriveRowTask({ ...base, assignees: [{ name: "Waqar Ali", email: "waqar@gitwork.co.uk" }] });
    const pub = publicRowTask({ ...team, ...({ priority: "HIGH", comments: ["x"] } as object) })!;
    expect(pub.title).toBeNull();
    expect(pub.assignees).toEqual([{ name: "Waqar A.", initials: "WA" }]);
    expect(Object.keys(pub).sort()).toEqual(["assignees", "completedAt", "dueDate", "startedAt", "title", "updatedAt"]);
    expect(JSON.stringify(pub)).not.toMatch(/waqar@|priority|comments/);
    expect(shortPersonName("Cher")).toBe("Cher");
    expect(publicRowTask(null)).toBeNull();
  });

  const row = (over: Partial<WikiSheetRow>): Pick<WikiSheetRow, "task" | "taskId" | "stage"> => ({ taskId: null, task: null, stage: null, ...over });

  it("assignee filter: names on linked tasks, plus Unassigned for a linked row with nobody on it", () => {
    const t = deriveRowTask({ ...base, assignees: [{ name: "Waqar Ali", email: "w@x" }] });
    const rows = [
      row({ taskId: "t1", task: t, stage: "IN_PROGRESS" }),
      row({ taskId: "t2", task: deriveRowTask(base), stage: "SCHEDULED" }),
      row({}),
    ];
    expect(assigneeOptions(rows)).toEqual(["Waqar Ali", UNASSIGNED]);
    expect(rows.filter((r) => matchesAssignee(r, UNASSIGNED))).toHaveLength(1);
    expect(rows.filter((r) => matchesAssignee(r, "Waqar Ali"))).toHaveLength(1);
    expect(rows.filter((r) => matchesAssignee(r, "all"))).toHaveLength(3);
  });

  it("the summary counts by stage, in board order, leaving out empty stages", () => {
    const rows = [row({ stage: "DONE" }), row({ stage: "IN_PROGRESS" }), row({ stage: "DONE" }), row({})];
    expect(stageSummary(rows).map((x) => `${x.count} ${x.label}`)).toEqual(["1 not on board", "1 in progress", "2 done"]);
  });
});
