/**
 * The first live dry run against Wedge's board froze foundry.gitwork.co.uk for minutes
 * (Nov 2026): title matching is n × m and each spelling comparison is O(len²). These pin the
 * speed-up's two promises: it never changes a result, and it stays fast at real board sizes.
 */
import { describe, expect, it } from "vitest";
import { compareTitles, containsWords, ratioUpperBound, sequenceRatio, titled } from "../match";
import { matchFeedToTasks, type BoardTask } from "../plan";
import { parseForgeFeed } from "../feed";

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const WORDS = ["leaderboard", "handicap", "round", "score", "course", "filter", "premium", "watch", "ios", "bag", "tee", "shot", "planner", "stats", "advanced", "social", "feed", "update", "add", "fix"];
function title(r: () => number): string {
  const n = 1 + Math.floor(r() * 6);
  return Array.from({ length: n }, () => WORDS[Math.floor(r() * WORDS.length)]).join(" ");
}
function typo(t: string, r: () => number): string {
  const i = Math.floor(r() * t.length);
  return t.slice(0, i) + "x" + t.slice(i + 1);
}

describe("the cheap bound never hides a match", () => {
  it("is always at least the real spelling ratio", () => {
    const r = rng(7);
    for (let k = 0; k < 4000; k++) {
      const a = titled(title(r));
      const b = titled(r() < 0.5 ? typo(a.ns, r) : title(r));
      expect(ratioUpperBound(a, b) + 1e-12).toBeGreaterThanOrEqual(sequenceRatio(a.ns, b.ns));
    }
  });

  it("still finds a one-letter typo as a probable match", () => {
    expect(compareTitles(titled("Leaderboard Filters Basic"), titled("Leaderboard Filtres Basic"))?.kind).toBe("probable");
  });
});

describe("whole-word containment agrees with the RegExp it replaced", () => {
  const regex = (hay: string, needle: string) => new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay);
  const cases: Array<[string, string]> = [
    ["tee shot planner feature", "tee shot planner"],
    ["teeshot planner", "tee shot planner"],
    ["add tee shot planners", "tee shot planner"],
    ["x tee shot planner", "tee shot planner"],
    ["a.b c", "b c"],
    ["café crème", "crème"],
    ["round round round", "round round"],
    ["", "a"],
  ];
  it.each(cases)("%s ⊇ %s", (hay, needle) => {
    expect(containsWords(hay, needle)).toBe(regex(hay, needle));
  });
});

function task(id: number, t: string): BoardTask {
  return {
    id: `t${id}`, title: t, status: "TODO", parentId: null, archived: false, itemType: null, productCardId: null,
    externalRef: null, description: null, releaseId: null, tier: null, area: null, estimateHours: null, forgeFilled: [],
  } as BoardTask;
}
function feedOf(titles: string[]) {
  return parseForgeFeed({
    features: titles.map((t, i) => ({ id: String(1000 + i), type: "feature", name: t, workflowStage: "triage" })),
    subitems: [],
    bugs: [],
    feedback: [],
    releases: [],
  });
}

describe("matching stays fast at real board sizes", () => {
  it("matches 200 items against 3,000 tasks in well under the time that froze the site", () => {
    const r = rng(11);
    const feed = feedOf(Array.from({ length: 200 }, () => title(r)));
    const tasks = Array.from({ length: 3000 }, (_, i) => task(i, title(r) + (i % 3 ? " - IOS" : "")));
    const t0 = performance.now();
    matchFeedToTasks(feed, tasks);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
