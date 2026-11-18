import { describe, expect, it } from "vitest";
import type { BoardColumnDef } from "@/lib/tasks/board-columns";
import type { ForgeFeed, ForgeItem } from "../feed";
import { buildForgePlan, forgeRef, type BoardTask } from "../plan";
import { FORGE_STAGES, requiredColumns } from "../stages";

function item(over: Partial<ForgeItem> & Pick<ForgeItem, "id" | "title">): ForgeItem {
  return {
    type: "feature",
    stage: "future-idea",
    releaseId: null,
    category: null,
    price: null,
    priority: null,
    timeEstimate: null,
    parentFeatureId: null,
    linkedFeatureId: null,
    linkedSubItemId: null,
    linkedBugId: null,
    dependsOn: [],
    links: [],
    images: [],
    date: null,
    stageDates: {},
    ...over,
  };
}

function task(over: Partial<BoardTask> & Pick<BoardTask, "id" | "title">): BoardTask {
  return {
    status: "BACKLOG",
    parentId: null,
    archived: false,
    itemType: null,
    productCardId: null,
    externalRef: null,
    description: null,
    releaseId: null,
    tier: null,
    area: null,
    estimateHours: null,
    ...over,
  };
}

const columns: BoardColumnDef[] = Object.values(FORGE_STAGES)
  .filter((p) => p.column)
  .map((p, i) => ({ id: `col_${String(i).padStart(6, "0")}`, name: p.column!, stage: p.status }));

const feed = (items: ForgeItem[], releases: ForgeFeed["releases"] = []): ForgeFeed => ({ items, releases, skipped: 0 });
const plan = (items: ForgeItem[], tasks: BoardTask[] = [], extra: Partial<Parameters<typeof buildForgePlan>[0]> = {}) =>
  buildForgePlan({ feed: feed(items), tasks, releases: [], columns, ...extra });
const one = (p: ReturnType<typeof plan>, id: string) => p.items.find((i) => i.forgeId === id)!;

describe("where Big Wedge's stages land", () => {
  it("never needs an \"In Review\" column (a column can't repeat a status name)", () => {
    expect(requiredColumns()).not.toContain("In Review");
    expect(FORGE_STAGES["in-review"]).toEqual({ status: "IN_REVIEW", column: null });
    expect(requiredColumns()).toHaveLength(11);
  });

  it("puts Live Features in Done, dated from when it went live, never today", () => {
    const p = plan([item({ id: "1", title: "Live thing", stage: "live-features", stageDates: { "live-features": "2026-07-01" } })]);
    expect(one(p, "1").card).toMatchObject({ status: "DONE", column: "Live Features", completedAt: "2026-07-01" });
  });

  it("files an unknown stage in Future Idea and says so, rather than dropping it", () => {
    const p = plan([item({ id: "1", title: "Odd", stage: "somewhere-new" })]);
    expect(one(p, "1")).toMatchObject({ action: "create", stageKnown: false, card: { status: "BACKLOG", column: "Future Idea" } });
    expect(p.counts.unknownStages).toBe(1);
  });

  it("refuses to plan an import onto a board that is missing a column", () => {
    const p = plan([item({ id: "1", title: "A" })], [], { columns: columns.filter((c) => c.name !== "Triage") });
    expect(p.missingColumns).toEqual(["Triage"]);
  });
});

describe("matching items to the team's tasks", () => {
  it("turns an exact, one-to-one, live, top-level task into the card", () => {
    const p = plan([item({ id: "1", title: "Rate Course" })], [task({ id: "t1", title: "Rate Course" })]);
    expect(one(p, "1")).toMatchObject({ action: "link", target: { id: "t1" }, devLinks: [] });
  });

  it("makes a new card for an exact match that is archived, and links the dev task to it", () => {
    const p = plan([item({ id: "1", title: "Distance to Hazards", stage: "live-features" })], [task({ id: "t1", title: "Distance to Hazards", status: "DONE", archived: true })]);
    expect(one(p, "1")).toMatchObject({ action: "create", devLinks: [{ id: "t1" }] });
  });

  it("never reparents a team task: a matching sub-item gets a new card and the task is linked", () => {
    const p = plan(
      [item({ id: "f", title: "Match Formats" }), item({ id: "s", title: "Scramble Mode", type: "subitem", parentFeatureId: "f" })],
      [task({ id: "t1", title: "Scramble Mode" })],
    );
    expect(one(p, "s")).toMatchObject({ action: "create", devLinks: [{ id: "t1" }], card: { parentForgeId: "f" } });
  });

  it("sends a near match to review instead of acting on it", () => {
    const p = plan([item({ id: "1", title: "Targeted Notification" })], [task({ id: "t1", title: "Targeted Notifications" })]);
    expect(one(p, "1")).toMatchObject({ action: "review", candidates: [{ id: "t1", kind: "probable" }] });
  });

  it("sends a one-to-many match to review", () => {
    const p = plan([item({ id: "1", title: "Social Feed" })], [task({ id: "a", title: "Social Feed" }), task({ id: "b", title: "Social Feed" })]);
    expect(one(p, "1").action).toBe("review");
  });

  it("sends two items that both match one task to review, rather than linking it twice", () => {
    const p = plan([item({ id: "1", title: "Leaderboard flags" }), item({ id: "2", title: "Leaderboard Flags", type: "feedback" })], [task({ id: "t", title: "Leaderboard flags" })]);
    expect(p.items.map((i) => i.action)).toEqual(["review", "review"]);
  });

  it("keeps the team's status when it differs, and says so", () => {
    const p = plan([item({ id: "1", title: "Onboarding Process", stage: "technical-audit" })], [task({ id: "t1", title: "Onboarding Process", status: "BACKLOG" })]);
    expect(one(p, "1").action).toBe("link");
    expect(one(p, "1").reason).toContain("Kept at BACKLOG");
  });

  it("never matches another card, and never links a task that already delivers one", () => {
    const p = plan(
      [item({ id: "1", title: "Rate Course" }), item({ id: "2", title: "Course Map" })],
      [task({ id: "c", title: "Rate Course", itemType: "feature" }), task({ id: "t", title: "Course Map", archived: true, productCardId: "x" })],
    );
    expect(one(p, "1")).toMatchObject({ action: "create", devLinks: [] });
    expect(one(p, "2")).toMatchObject({ action: "create", devLinks: [] });
  });
});

describe("review decisions", () => {
  const items = [item({ id: "1", title: "Targeted Notification" })];
  const tasks = [task({ id: "t1abcdefgh", title: "Targeted Notifications" })];

  it("applies a chosen task, a new card, or a skip", () => {
    expect(one(plan(items, tasks, { decisions: [{ forgeId: "1", decision: "t1abcdefgh" }] }), "1")).toMatchObject({ action: "link", target: { id: "t1abcdefgh" } });
    expect(one(plan(items, tasks, { decisions: [{ forgeId: "1", decision: "create" }] }), "1").action).toBe("create");
    expect(one(plan(items, tasks, { decisions: [{ forgeId: "1", decision: "skip" }] }), "1").action).toBe("skip");
  });

  it("refuses a chosen task that isn't a team task on this board", () => {
    expect(one(plan(items, tasks, { decisions: [{ forgeId: "1", decision: "nope000000" }] }), "1").action).toBe("review");
  });
});

describe("running it again", () => {
  it("never imports an item twice: a card made last time only gets empty fields filled", () => {
    const first = plan([item({ id: "1", title: "Rate Course", category: "Premium Perks" })]);
    expect(first.counts.create).toBe(1);
    const again = plan([item({ id: "1", title: "Rate Course", category: "Premium Perks" })], [task({ id: "c", title: "Rate Course (renamed by us)", itemType: "feature", externalRef: forgeRef("1"), area: null })]);
    expect(one(again, "1")).toMatchObject({ action: "already-imported", target: { id: "c" }, fill: ["area", "description"] });
    expect(again.counts.create).toBe(0);
  });

  it("has no action that deletes, archives or moves a task", () => {
    const p = plan([item({ id: "1", title: "A" }), item({ id: "2", title: "B", stage: "live-features" })], [task({ id: "t", title: "A" })]);
    for (const i of p.items) expect(["create", "link", "already-imported", "review", "skip"]).toContain(i.action);
  });
});

describe("what a card says", () => {
  it("carries type, tier, area, hours, priority, links, and what it's about", () => {
    const p = plan([
      item({ id: "f", title: "Leaderboards" }),
      item({
        id: "b",
        title: "Rank spacing",
        type: "bug",
        priority: "high",
        price: "Premium",
        category: "Games & Leaderboards",
        timeEstimate: 6,
        linkedFeatureId: "f",
        dependsOn: ["f", "404"],
        links: [{ label: "Spec", url: "https://docs.example/spec" }],
        images: ["https://ops.example/a.jpg"],
      }),
    ]);
    const c = one(p, "b").card;
    expect(c).toMatchObject({ itemType: "bug", priority: "HIGH", tier: "premium", area: "Games & Leaderboards", estimateHours: 6, externalRef: "forge:b" });
    expect(c.description).toContain("About: Leaderboards");
    expect(c.description).toContain("Depends on: Leaderboards, #404");
    expect(c.description).toContain("- [Spec](https://docs.example/spec)");
    expect(c.description).toContain("- [Screenshot](https://ops.example/a.jpg)");
  });

  it("treats a zero estimate as no estimate", () => {
    expect(one(plan([item({ id: "1", title: "A", timeEstimate: 0 })]), "1").card.estimateHours).toBeNull();
  });
});

describe("releases", () => {
  it("reuses a release with the same version AND name, and creates the rest", () => {
    const releases: ForgeFeed["releases"] = [
      { id: "r1", version: "v2.0.0", name: "Q3: Premium", startDate: null, endDate: null, links: [] },
      { id: "r2", version: "v2.0.0", name: "Q4: Refinement", startDate: null, endDate: null, links: [] },
    ];
    const p = buildForgePlan({ feed: feed([], releases), tasks: [], releases: [{ id: "x", version: "2.0.0", name: "q3: premium" }], columns });
    expect(p.releases.map((r) => r.existingId)).toEqual(["x", null]);
    expect(p.counts.releasesToCreate).toBe(1);
  });
});
