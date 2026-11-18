import { describe, expect, it } from "vitest";
import { buildForgePlan, type BoardTask } from "../plan";
import { renderForgePlanMarkdown } from "../report";
import { FORGE_STAGES } from "../stages";
import type { ForgeItem } from "../feed";

const columns = Object.values(FORGE_STAGES)
  .filter((p) => p.column)
  .map((p, i) => ({ id: `col_${String(i).padStart(6, "0")}`, name: p.column!, stage: p.status }));
const it0 = (id: string, title: string, stage = "future-idea"): ForgeItem => ({
  id, title, stage, type: "feature", releaseId: null, category: null, price: null, priority: null, timeEstimate: null,
  parentFeatureId: null, linkedFeatureId: null, linkedSubItemId: null, linkedBugId: null, dependsOn: [], links: [], images: [], date: null, stageDates: {},
});
const t0 = (id: string, title: string): BoardTask => ({
  id, title, status: "BACKLOG", parentId: null, archived: false, itemType: null, productCardId: null, externalRef: null,
  description: null, releaseId: null, tier: null, area: null, estimateHours: null,
});

describe("the dry-run report", () => {
  const plan = buildForgePlan({
    feed: { items: [it0("1", "Rate Course"), it0("2", "Targeted Notification"), it0("3", "Blind | Shot", "triage")], releases: [], skipped: 0 },
    tasks: [t0("a", "Rate Course"), t0("b", "Targeted Notifications")],
    releases: [],
    columns,
  });
  const md = renderForgePlanMarkdown(plan);

  it("leads with the promise that nothing is moved, archived or deleted", () => {
    expect(md.split("\n").slice(0, 4).join(" ")).toMatch(/never moves, reparents, archives or deletes/);
  });

  it("lists what needs a decision with the suggested task, and what is linked", () => {
    expect(md).toContain("## Waiting for your decision (1)");
    expect(md).toContain("Targeted Notifications (BACKLOG)");
    expect(md).toContain("**Rate Course** → Rate Course (BACKLOG)");
    expect(md).toContain("### Triage (1)");
  });

  it("escapes table pipes in titles", () => {
    expect(md).toContain("Blind \\| Shot");
  });

  it("warns loudly when the board is missing a column", () => {
    const missing = buildForgePlan({ feed: { items: [], releases: [], skipped: 0 }, tasks: [], releases: [], columns: [] });
    expect(renderForgePlanMarkdown(missing)).toContain("⛔ Board columns missing");
  });
});
