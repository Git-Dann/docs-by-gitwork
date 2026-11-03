import { describe, expect, it } from "vitest";
import { byUrgency, churnMultiplier, compareVersions, planPortfolio, summariseRepo, workItemsFor, type WorkItem } from "@/lib/code-portfolio";
import type { CodeHealthReport, DebtItem } from "@/types/code-health";

function report(over: Partial<CodeHealthReport> = {}): CodeHealthReport {
  return {
    repo: "acme/app",
    branch: "main",
    commit: "a".repeat(40),
    measuredAt: "2026-10-01T00:00:00.000Z",
    score: 70,
    band: "fair",
    totals: { files: 10, loc: 5000, testLoc: 500, functions: 100, classes: 5, complexityPerKloc: 120, complexLocShare: 0.1, averageComplexity: 4 },
    languages: [{ language: "typescript", files: 10, loc: 5000 }],
    debt: [],
    debtCounts: { complex_function: 0, long_function: 0, long_parameter_list: 0, deep_nesting: 0, large_class: 0, large_file: 0 },
    coverage: { analysedFiles: 10, skippedLarge: 0, skippedMinified: 0, skippedGenerated: 0, unsupportedSourceFiles: 0, unsupportedLanguages: [], filesWithParseErrors: 0, truncated: false },
    ...over,
  };
}

const debt = (path: string, severity: DebtItem["severity"], effortHours = 6): DebtItem => ({
  kind: "complex_function",
  severity,
  path,
  line: 10,
  symbol: `fn_${path}`,
  metrics: { complexity: 30, loc: 80 },
  reason: "Too many paths.",
  effortHours,
});

const item = (id: string, lane: WorkItem["lane"], value: number, days: number, repo = "a/b"): WorkItem => ({
  id, repo, kind: lane === "security" ? "vulnerable_dependency" : "debt", title: id, why: "", path: null, value, days, lane,
});

describe("planPortfolio", () => {
  it("puts known vulnerabilities first even when a refactor removes more risk per day", () => {
    const plan = planPortfolio([item("refactor", "change_risk", 1000, 1), item("cve", "security", 5, 1)], 1);
    expect(plan.chosen.map((c) => c.id)).toEqual(["cve"]);
  });

  it("ranks the rest by risk removed per day, not by size", () => {
    const plan = planPortfolio([item("big", "maintainability", 30, 5), item("small", "maintainability", 10, 1)], 5);
    expect(plan.chosen[0].id).toBe("small");
  });

  it("skips what does not fit and keeps filling with smaller work", () => {
    const plan = planPortfolio([item("huge", "change_risk", 100, 3), item("a", "maintainability", 5, 1), item("b", "maintainability", 4, 1)], 2);
    expect(plan.chosen.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(plan.usedDays).toBe(2);
  });

  it("says how many security fixes did not fit, never drops them silently", () => {
    const plan = planPortfolio([item("c1", "security", 100, 1), item("c2", "security", 100, 1)], 1);
    expect(plan.securityLeftOut).toBe(1);
  });

  it("reports the share of risk removed and the days per repository", () => {
    const plan = planPortfolio([item("x", "maintainability", 30, 1, "r/1"), item("y", "maintainability", 10, 2, "r/2")], 3);
    expect(plan.riskRemovedShare).toBe(1);
    expect(plan.byRepo).toEqual([{ repo: "r/2", days: 2, items: 1 }, { repo: "r/1", days: 1, items: 1 }]);
    expect(planPortfolio([], 10).riskRemovedShare).toBe(0);
  });
});

describe("workItemsFor", () => {
  it("weights debt in a hotspot above the same debt in a quiet file", () => {
    const r = report({
      debt: [debt("hot.ts", "high"), debt("cold.ts", "high")],
      history: { months: 12, commits: 100, massEditsIgnored: 0, botCommitsIgnored: 0, contributors: 3, firstCommitAt: null, lastCommitAt: null, busFactor: 2, owners: [], coupling: [],
        hotspots: [{ path: "hot.ts", changes: 50, complexity: 90, loc: 400, authors: 2, mainAuthorShare: 0.6, score: 1 }] },
    });
    const items = workItemsFor(r);
    const hot = items.find((i) => i.path?.startsWith("hot.ts"))!;
    const cold = items.find((i) => i.path?.startsWith("cold.ts"))!;
    expect(hot.value).toBe(cold.value * 4);
    expect(hot.lane).toBe("change_risk");
    expect(cold.lane).toBe("maintainability");
  });

  it("treats unknown churn as ordinary, not as zero", () => {
    expect(churnMultiplier(null)).toBe(1);
    expect(churnMultiplier(undefined)).toBe(1);
    expect(churnMultiplier(0)).toBe(1);
    expect(churnMultiplier(5)).toBe(4);
  });

  it("only turns a CHECKED library audit into work, and names the highest fixed version", () => {
    const deps = {
      status: "checked" as const, reason: null, lockfiles: [], packages: 40, checkedAt: "2026-10-01T00:00:00Z",
      counts: { critical: 1, high: 0, moderate: 0, low: 0, unknown: 0 },
      vulnerable: [{
        ecosystem: "npm", name: "lodash", version: "4.17.15", lockfile: "package-lock.json", direct: true, severity: "critical" as const,
        advisories: [
          { id: "GHSA-1", aliases: ["CVE-2020-8203"], summary: "Prototype pollution", severity: "critical" as const, fixedIn: "4.17.19", url: "" },
          { id: "GHSA-2", aliases: ["CVE-2021-23337"], summary: "Command injection", severity: "high" as const, fixedIn: "4.17.21", url: "" },
        ],
      }],
    };
    const items = workItemsFor(report({ dependencies: deps }));
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Upgrade lodash 4.17.15 → 4.17.21");
    expect(items[0].lane).toBe("security");
    expect(items[0].why).toContain("CVE-2020-8203");
    expect(workItemsFor(report({ dependencies: { ...deps, status: "unavailable", reason: "OSV did not answer." } }))).toHaveLength(0);
  });

  it("turns import cycles into work with a concrete loop to cut", () => {
    const items = workItemsFor(report({
      structure: { modules: 3, edges: 3, unresolvedShare: 0, languages: ["typescript"], cycleCount: 1, filesInCycles: 3, hubs: [], maxDepth: 1,
        cycles: [{ files: ["src/a.ts", "src/b.ts", "src/c.ts"], path: ["src/a.ts", "src/b.ts", "src/c.ts", "src/a.ts"] }] },
    }));
    expect(items[0].kind).toBe("dependency_cycle");
    expect(items[0].why).toContain("a.ts → b.ts → c.ts → a.ts");
  });
});

describe("summariseRepo", () => {
  it("keeps 'not checked' distinct from 'no vulnerabilities'", () => {
    const meta = { scanId: "s1", projectName: "p", clientName: null, history: [] };
    expect(summariseRepo(report(), meta).vulnerable).toBeNull();
    expect(summariseRepo(report(), meta).dependencyNote).toMatch(/Re-scan/);
    expect(summariseRepo(report(), meta).cycles).toBeNull();
  });

  it("flags knowledge risk only for a real codebase with a bus factor of one", () => {
    const h = { months: 12, commits: 10, massEditsIgnored: 0, botCommitsIgnored: 0, contributors: 1, firstCommitAt: null, lastCommitAt: null, busFactor: 1, owners: [], hotspots: [], coupling: [] };
    const meta = { scanId: "s1", projectName: "p", clientName: null, history: [] };
    expect(summariseRepo(report({ history: h }), meta).knowledgeRisk).toBe(true);
    expect(summariseRepo(report({ history: h, totals: { ...report().totals, loc: 300 } }), meta).knowledgeRisk).toBe(false);
  });
});

describe("urgency", () => {
  const meta = { scanId: "s", projectName: "p", clientName: null };
  const deps = (critical: number) => ({
    status: "checked" as const, reason: null, lockfiles: [], packages: 5, checkedAt: "", vulnerable: [],
    counts: { critical, high: 0, moderate: 0, low: 0, unknown: 0 },
  });

  it("puts a tidy repo with a security hole ahead of a messy one without", () => {
    const tidy = summariseRepo(report({ score: 92, band: "good", dependencies: deps(1) }), { ...meta, history: [] });
    const messy = summariseRepo(report({ score: 41, band: "poor", dependencies: deps(0) }), { ...meta, history: [] });
    expect([messy, tidy].sort(byUrgency)[0]).toBe(tidy);
    expect(tidy.urgency.reason).toBe("1 serious security hole");
    expect(messy.urgency.reason).toBe("Hard to change safely");
  });

  it("flags getting worse above condition, and says an unchecked repo needs a re-scan", () => {
    const worse = summariseRepo(report({ dependencies: deps(0) }), { ...meta, history: [{ at: "a", score: 75 }, { at: "b", score: 70 }] });
    expect(worse.urgency).toEqual({ rank: 1, reason: "Getting worse (down 5)" });
    const unchecked = summariseRepo(report({ score: 90, band: "good" }), { ...meta, history: [] });
    expect(unchecked.urgency.reason).toMatch(/scan it again/);
  });
});

describe("compareVersions", () => {
  it("orders numerically, not as text", () => {
    expect(["4.17.9", "4.17.21", "4.17.19"].sort(compareVersions)).toEqual(["4.17.9", "4.17.19", "4.17.21"]);
    expect(compareVersions("v1.10.0", "1.9.9")).toBeGreaterThan(0);
  });
});
