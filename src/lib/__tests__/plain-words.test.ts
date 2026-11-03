import { describe, expect, it } from "vitest";
import { debtImpact, libraryImpact, productArea } from "@/lib/plain-words";
import { actionPlan } from "@/lib/plain-impact";
import type { WorkItem } from "@/lib/code-portfolio";

const pkg = (summary: string, severity: "critical" | "high" | "moderate" | "low" = "high") => ({
  severity,
  advisories: [{ id: "GHSA-x", aliases: [], summary, severity, fixedIn: null, url: "" }],
});

describe("libraryImpact", () => {
  // Real advisory summaries from OSV (NodeGoat, zod and the demo report).
  it.each([
    ["Inefficient Regular Expression Complexity in axios", "slow the app to a crawl"],
    ["Prototype Pollution in lodash", "change how parts of the app behave"],
    ["jsonwebtoken unrestricted key type could lead to legacy keys usage", "get past sign-in"],
    ["Command Injection in lodash", "run their own code on your server"],
    ["Django SQL injection in QuerySet.values()", "read or change your database"],
    ["XSS in sanitize-html", "script in your users' browsers"],
    ["Denial of service in bson", "crash or overload the app"],
    ["Path traversal in tar", "expose or overwrite files"],
  ])("%s → %s", (summary, expected) => {
    expect(libraryImpact(pkg(summary))).toContain(expected);
  });

  it("puts the worse consequence first when one advisory names two", () => {
    // Code execution must win over "denial of service" in the same text.
    expect(libraryImpact(pkg("Denial of service and remote code execution in x"))).toContain("run their own code");
  });

  it("falls back on severity, never on silence", () => {
    expect(libraryImpact(pkg("Improper handling in parser", "critical"))).toMatch(/straight away/);
    expect(libraryImpact(pkg("Improper handling in parser", "low"))).toMatch(/low risk/);
  });
});

describe("debtImpact and productArea", () => {
  it("names the part of the product a non-developer recognises", () => {
    expect(productArea("server/billing/invoice.ts")).toBe("payments");
    expect(productArea("app/Http/Controllers/AuthController.php")).toBe("sign-in and accounts");
    expect(productArea("src/utils/strings.ts")).toBeNull();
  });

  it("matches whole words, never substrings (each of these was wrong on a real app)", () => {
    expect(productArea("lib/features/episode/presentation/blocs/video_player_inner_cubit/video_player_inner_state.dart")).toBe("content");
    expect(productArea("lib/features/profile/presentation/state.dart")).toBeNull(); // not "reporting" via "stat"
    expect(productArea("lib/widgets/rounded_border.dart")).toBeNull(); // not "payments" via "order"
    expect(productArea("lib/features/feed/presentation/pages/feed_page.dart")).toBe("content"); // not "data syncing"
    expect(productArea("src/paymentController.ts")).toBe("payments"); // camelCase split
  });

  it("says what the debt costs, and says when it is paid every week", () => {
    const hot = debtImpact({ kind: "complex_function", path: "server/billing/invoice.ts", severity: "very_high" }, true);
    expect(hot).toMatch(/^This is payments code: .*bugs slip through, and the team changes it often/);
    const cold = debtImpact({ kind: "large_file", path: "src/x.ts", severity: "high" }, false);
    expect(cold).toMatch(/^This code: /);
    expect(cold).not.toMatch(/changes it often/);
  });
});

describe("actionPlan", () => {
  const item = (id: string, over: Partial<WorkItem> = {}): WorkItem => ({
    id, repo: "acme/app", kind: "debt", title: id, why: `why ${id}`, path: null, value: 5, days: 1, lane: "maintainability", ...over,
  });

  it("folds every security fix into the first step, whatever its value", () => {
    const plan = actionPlan([item("big", { value: 500, area: "payments" }), item("v1", { lane: "security", kind: "vulnerable_dependency", value: 5, days: 0.25 }), item("v2", { lane: "security", kind: "vulnerable_dependency", value: 5, days: 0.5 })]);
    expect(plan.steps[0].title).toMatch(/2 outside libraries/);
    expect(plan.steps[0].days).toBe(0.75);
  });

  it("puts a big knot ahead of small loops, however cheap the small ones are (a real app had this backwards)", () => {
    const plan = actionPlan([
      item("small1", { kind: "dependency_cycle", title: "Untangle 2 files that depend on each other in a loop", value: 10, days: 0.5 }),
      item("small2", { kind: "dependency_cycle", title: "Untangle 2 files that depend on each other in a loop", value: 10, days: 0.5 }),
      item("knot", { kind: "dependency_cycle", title: "Untangle 181 files that depend on each other in a loop", value: 368, days: 5 }),
    ]);
    expect(plan.steps.map((s) => s.title)).toEqual(["Untangle 181 files that depend on each other in a loop", "Untangle 2 small loops between files"]);
  });

  it("groups debt by product area and by most-changed file, and leaves the scattered rest for last", () => {
    const plan = actionPlan([
      item("p1", { area: "payments", file: "lib/billing/plan.dart", value: 8 }),
      item("p2", { area: "payments", file: "lib/billing/trial.dart", value: 8 }),
      item("h1", { hot: true, file: "lib/feed/feed_page.dart", area: "content", value: 30 }),
      item("loose", { value: 40 }),
    ]);
    // Payments outranks the busier content file: its step says it is worth making safe first, so the order agrees.
    expect(plan.steps.map((s) => s.title)).toEqual(["Simplify the payments code (2 places)", "Simplify feed_page.dart (content)", "Tidy the remaining 1 hard-to-change place"]);
    expect(plan.steps[0].benefit).toMatch(/plan.dart and trial.dart/);
    expect(plan.steps[2].cumulativeShare).toBeCloseTo(1);
  });

  it("names the repository on every step when planning across several", () => {
    const a = item("x", { area: "payments", repo: "acme/web" });
    expect(actionPlan([a], 5, { nameRepos: true }).steps[0].title).toBe("Simplify the payments code (1 place) (acme/web)");
    expect(actionPlan([a]).steps[0].title).toBe("Simplify the payments code (1 place)");
  });

  it("reports when most of the risk is gone, following the plan's order", () => {
    const plan = actionPlan([item("v", { lane: "security", kind: "vulnerable_dependency", value: 90, days: 0.5 }), item("rest", { value: 10, days: 9 })]);
    expect(plan.daysToMost).toBe(0.5);
    expect(plan.totalDays).toBe(9.5);
    expect(actionPlan([]).daysToMost).toBeNull();
  });
});
