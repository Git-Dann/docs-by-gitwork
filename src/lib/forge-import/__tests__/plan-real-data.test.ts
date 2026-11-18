/**
 * The plan against the REAL data: Big Wedge's whole Forge feed and a snapshot of the Wedge board
 * (1,052 tasks), checked against the read-only comparison done by hand (match-report.json).
 *
 * ⚠️ The files are NOT in the repo, deliberately: the repo is public and they are a client's
 * plan and our task list. Point FORGE_FIXTURES_DIR at a folder holding items.json,
 * foundry-wedge-tasks.json and match-report.json to run it; without it the suite is skipped.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseForgeFeed, parseForgeJson } from "../feed";
import { buildForgePlan, forgeRef, type BoardTask } from "../plan";
import { FORGE_STAGES } from "../stages";

const DIR = process.env.FORGE_FIXTURES_DIR ?? "";
const have = DIR && ["items.json", "foundry-wedge-tasks.json", "match-report.json"].every((f) => existsSync(join(DIR, f)));

function load() {
  const feed = parseForgeFeed(parseForgeJson(readFileSync(join(DIR, "items.json"), "utf8")));
  const raw = JSON.parse(readFileSync(join(DIR, "foundry-wedge-tasks.json"), "utf8")) as Array<Record<string, unknown>>;
  const report = JSON.parse(readFileSync(join(DIR, "match-report.json"), "utf8")) as {
    items: Array<{ id: string; verdict: string; matches: Array<{ taskId: string }> }>;
  };
  const tasks: BoardTask[] = raw.map((t) => ({
    id: String(t.id),
    title: String(t.title),
    status: String(t.status),
    parentId: (t.parentId as string | null) ?? null,
    archived: Boolean(t.archivedAt),
    itemType: null,
    productCardId: null,
    externalRef: null,
    description: null,
    releaseId: null,
    tier: null,
    area: null,
    estimateHours: null,
  }));
  const columns = Object.values(FORGE_STAGES)
    .filter((p) => p.column)
    .map((p, i) => ({ id: `col_${String(i).padStart(6, "0")}`, name: p.column!, stage: p.status }));
  const plan = buildForgePlan({ feed, tasks, releases: [], columns });
  const byId = new Map(plan.items.map((i) => [i.forgeId, i]));
  return { feed, tasks, report, columns, plan, byId };
}

describe.skipIf(!have)("the plan against Big Wedge's real feed and the Wedge board", () => {
  const { feed, tasks, report, columns, plan, byId } = have ? load() : ({} as ReturnType<typeof load>);

  it("considers all 199 items and needs no columns beyond the agreed eleven", () => {
    expect(plan.counts.considered).toBe(199);
    expect(plan.missingColumns).toEqual([]);
    expect(plan.counts.unknownStages).toBe(0);
  });

  it("acts on every exact match from the hand-checked comparison, and on nothing looser", () => {
    for (const r of report.items) {
      const i = byId.get(r.id)!;
      if (r.verdict === "exact") {
        const touched = [i.target?.id, ...i.devLinks.map((d) => d.id)];
        expect(touched, r.id).toContain(r.matches[0].taskId);
      } else if (r.verdict === "probable" || r.verdict === "ambiguous") {
        expect(i.action, r.id).toBe("review");
      } else {
        expect(i.action, r.id).toBe("create");
        expect(i.devLinks, r.id).toEqual([]);
      }
    }
  });

  it("puts every Live Features item in Done", () => {
    for (const i of plan.items.filter((x) => x.stage === "live-features" && x.action === "create")) expect(i.card.status).toBe("DONE");
  });

  it("makes every sub-item its feature's subtask, and never a team task's", () => {
    for (const i of plan.items.filter((x) => x.forgeType === "subitem")) {
      expect(i.action === "link").toBe(false);
      expect(i.card.parentForgeId).toBeTruthy();
    }
  });

  it("a second run against the imported board imports nothing again", () => {
    const after: BoardTask[] = [
      ...tasks,
      ...plan.items.map((i, n) => ({ ...tasks[0], id: `card${n}`, title: i.title, itemType: i.forgeType, externalRef: forgeRef(i.forgeId) })),
    ];
    const again = buildForgePlan({ feed, tasks: after, releases: [], columns });
    expect(again.counts.alreadyImported).toBe(199);
    expect(again.counts.create + again.counts.link + again.counts.review).toBe(0);
  });
});
