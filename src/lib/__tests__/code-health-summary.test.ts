import { describe, expect, it } from "vitest";
import { comparisonWords, humanDays, summariseCodeHealth, summarisePortfolio } from "@/lib/code-health-summary";
import { summariseRepo, workItemsFor } from "@/lib/code-portfolio";
import { DEMO_CODE_HEALTH, DEMO_PORTFOLIO_REPORTS } from "@/lib/demo/demo-code-health";

const JARGON = /complexity|cyclomatic|cycle|bus factor|hotspot|fan-?in|instability|lockfile|OSV|CVE|KLOC|percentile/i;

describe("summariseCodeHealth", () => {
  const s = summariseCodeHealth(DEMO_CODE_HEALTH);

  it("speaks plain English: no developer jargon anywhere in it", () => {
    for (const t of [s.headline, ...s.lines.map((l) => l.text)]) expect(t, t).not.toMatch(JARGON);
  });

  it("states the score, and every claim comes from the report", () => {
    expect(s.headline).toContain("71 out of 100");
    expect(s.lines.some((l) => l.text.includes("2 of them serious"))).toBe(true);
    expect(s.lines.some((l) => l.text.includes("2 groups of files depend on each other in a loop (7 files)"))).toBe(true);
  });

  it("puts the security fix first as where to start", () => {
    expect(s.firstStep).toMatch(/^Upgrade jsonwebtoken/);
  });

  it("never claims libraries are safe when they were not checked", () => {
    const t = summariseCodeHealth({ ...DEMO_CODE_HEALTH, dependencies: { ...DEMO_CODE_HEALTH.dependencies!, status: "unavailable", vulnerable: [] } });
    expect(t.lines.some((l) => /could not be checked/.test(l.text))).toBe(true);
    expect(t.lines.some((l) => /no known security hole/i.test(l.text))).toBe(false);
  });
});

describe("the comparison line", () => {
  it("weighs all four measures, so it cannot contradict the table under it", async () => {
    const { compareToBenchmarks } = await import("@/server/code-health/benchmark");
    const cmp = compareToBenchmarks(DEMO_CODE_HEALTH)!;
    const line = summariseCodeHealth(DEMO_CODE_HEALTH, cmp).lines.find((l) => l.text.startsWith("Compared with"))!;
    // Cadenza is simpler than most per line but has far more code in complex functions: average.
    expect(cmp.metrics.complexityPerKloc.betterThan).toBeGreaterThanOrEqual(15);
    expect(cmp.metrics.complexLocShare.betterThan).toBeLessThanOrEqual(1);
    expect(line.text).toContain("about average overall");
  });
});

describe("summarisePortfolio", () => {
  const repos = DEMO_PORTFOLIO_REPORTS.map((r) => summariseRepo(r.report, { scanId: r.scanId, projectName: r.projectName, clientName: r.clientName, history: r.history.map((score, i) => ({ at: String(i), score })) }));
  const p = summarisePortfolio(repos, DEMO_PORTFOLIO_REPORTS.flatMap((r) => workItemsFor(r.report)));

  it("names the codebase that needs attention first, in plain words", () => {
    expect(p.headline).toContain("fairway-nine/booking-api");
    for (const t of [p.headline, ...p.lines.map((l) => l.text)]) expect(t, t).not.toMatch(JARGON);
  });

  it("calls out getting worse and one-person knowledge", () => {
    expect(p.lines.some((l) => l.text.startsWith("Getting worse") && l.text.includes("fairway-nine"))).toBe(true);
    expect(p.lines.some((l) => l.text.startsWith("Only one person really knows fairway-nine"))).toBe(true);
  });
});

describe("words for numbers", () => {
  it("turns days and positions into speech", () => {
    expect(humanDays(0.25)).toBe("about half a day");
    expect(humanDays(1)).toBe("about a day");
    expect(humanDays(9.75)).toBe("about 10 days");
    expect(humanDays(68.7)).toBe("about 14 weeks of one developer's time");
    expect(comparisonWords(15, 20)).toBe("simpler than most");
    expect(comparisonWords(10, 20)).toBe("about average");
    expect(comparisonWords(1, 20)).toBe("more complicated than almost all");
  });
});
