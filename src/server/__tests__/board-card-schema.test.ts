/**
 * The Board's write schemas are the allow-list (§126): the client has full control of their cards
 * EXCEPT who works on them. Anything not named is a 400, never silently dropped.
 */
import { describe, expect, it } from "vitest";
import { boardCardCreateSchema, boardCardEditSchema } from "../validators";

describe("editing a card from the Board", () => {
  it("takes every card field, due date included", () => {
    const ok = boardCardEditSchema.safeParse({
      title: "Bags",
      itemType: "bug",
      tier: "premium",
      area: "Bags",
      priority: "HIGH",
      estimateHours: 12.5,
      dueDate: "2026-12-04",
      releaseId: "cm3release0000000000000000",
      description: "x",
      links: ["https://x.dev"],
      dependsOn: ["cm3dep00000000000000000000"],
    });
    expect(ok.success).toBe(true);
  });

  it.each([
    ["assignees", { assignees: ["u1"] }],
    ["assigneeId", { assigneeId: "u1" }],
    ["assigneeIds", { assigneeIds: ["u1"] }],
  ])("refuses %s: who works on a card is the team's", (_k, body) => {
    expect(boardCardEditSchema.safeParse({ title: "x", ...body }).success).toBe(false);
  });

  it("refuses fields it doesn't name (status goes through the move route), and bad values", () => {
    expect(boardCardEditSchema.safeParse({ status: "DONE" }).success).toBe(false);
    expect(boardCardEditSchema.safeParse({ clientId: "other" }).success).toBe(false);
    expect(boardCardEditSchema.safeParse({ estimateHours: 1001 }).success).toBe(false);
    expect(boardCardEditSchema.safeParse({ estimateHours: -1 }).success).toBe(false);
    expect(boardCardEditSchema.safeParse({ links: ["javascript:alert(1)"] }).success).toBe(false);
    expect(boardCardEditSchema.safeParse({ area: "x".repeat(81) }).success).toBe(false);
    expect(boardCardEditSchema.safeParse({ itemType: "subitem" }).success).toBe(false);
    expect(boardCardEditSchema.safeParse({}).success).toBe(false);
  });
});

describe("a card's list (the Table view)", () => {
  it("takes a list name, or clears it", () => {
    expect(boardCardEditSchema.safeParse({ list: "QA review: 20 Oct 2026" }).success).toBe(true);
    expect(boardCardEditSchema.safeParse({ list: null }).success).toBe(true);
    expect(boardCardCreateSchema.safeParse({ title: "x", itemType: "bug", laneKey: "BACKLOG", list: "QA" }).success).toBe(true);
  });

  it("refuses a list name over 80 characters", () => {
    expect(boardCardEditSchema.safeParse({ list: "x".repeat(81) }).success).toBe(false);
    expect(boardCardEditSchema.safeParse({ list: "x".repeat(80) }).success).toBe(true);
  });

  it("a table cell can't carry an assignee alongside its field", () => {
    expect(boardCardEditSchema.safeParse({ list: "QA", assigneeId: "u1" }).success).toBe(false);
    expect(boardCardEditSchema.safeParse({ priority: "HIGH", assignees: ["u1"] }).success).toBe(false);
  });
});

describe("adding a card from the Board", () => {
  it("a sub-item must name its feature card", () => {
    expect(boardCardCreateSchema.safeParse({ title: "x", itemType: "subitem", laneKey: "BACKLOG" }).success).toBe(false);
    expect(boardCardCreateSchema.safeParse({ title: "x", itemType: "subitem", laneKey: "BACKLOG", parentId: "p1" }).success).toBe(true);
  });

  it("refuses an assignee here too", () => {
    expect(boardCardCreateSchema.safeParse({ title: "x", itemType: "feature", laneKey: "BACKLOG", assigneeId: "u1" }).success).toBe(false);
  });
});
