/**
 * Matching runs on the thread that answers every request. Run straight through, the first live
 * dry run froze foundry.gitwork.co.uk for minutes (Nov 2026). It now hands control back between
 * feed items, and stops with a clear error if it ever runs past its budget.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { matchFeedYielding } from "../forge-import";
import { buildForgePlan, matchFeedToTasks, type BoardTask } from "@/lib/forge-import/plan";
import { parseForgeFeed } from "@/lib/forge-import/feed";

function task(id: number, t: string): BoardTask {
  return {
    id: `t${id}`, title: t, status: "TODO", parentId: null, archived: false, itemType: null, productCardId: null,
    externalRef: null, description: null, releaseId: null, tier: null, area: null, estimateHours: null, forgeFilled: [],
  } as BoardTask;
}
const feed = parseForgeFeed({
  features: Array.from({ length: 30 }, (_, i) => ({ id: String(100 + i), type: "feature", name: `Feature number ${i}`, workflowStage: "triage" })),
  subitems: [],
  bugs: [],
  feedback: [],
  releases: [],
});
const tasks = Array.from({ length: 50 }, (_, i) => task(i, `Feature number ${i}`));

describe("matching hands control back to the server", () => {
  it("lets other work run while it matches", async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 0);
    await matchFeedYielding(feed, tasks);
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(0);
  });

  it("gives the same matches as matching in one go", async () => {
    const a = await matchFeedYielding(feed, tasks);
    const b = matchFeedToTasks(feed, tasks);
    expect([...a.matches.entries()].map(([k, v]) => [k, v.map((m) => m.t.id)])).toEqual(
      [...b.matches.entries()].map(([k, v]) => [k, v.map((m) => m.t.id)]),
    );
  });

  it("stops with a clear error past its budget", async () => {
    let t = 0;
    await expect(matchFeedYielding(feed, tasks, { budgetMs: 5, now: () => (t += 10) })).rejects.toThrow(/taking too long/);
  });

  it("a plan built from yielded matches equals one built in one go", async () => {
    const matched = await matchFeedYielding(feed, tasks);
    const base = { feed, tasks, releases: [], columns: [] };
    expect(JSON.stringify(buildForgePlan({ ...base, matched }))).toBe(JSON.stringify(buildForgePlan(base)));
  });
});
