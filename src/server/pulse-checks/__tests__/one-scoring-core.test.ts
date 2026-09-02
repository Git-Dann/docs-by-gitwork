import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeScoreBreakdown } from "../score-breakdown";
import { computePillarBreakdown, PILLARS } from "../pillars";
import { CATEGORIES } from "../categories";
import type { PulseScanCheckInput } from "@/types/pulse";

// ─────────────────────────────────────────────────────────────────────────────
// Every surface that shows a Pulse number reads the same core.
//
// The headline, the per-category bars, the pillars and the public badge are four
// places a client can read a score, and each had drifted or could drift:
//   • the category bars ran a hand-rolled PASS=1/WARN=0.5 ratio under a comment
//     claiming it matched calculateHealthScore — it ignored severity, evidence,
//     confidence and correlation damping entirely;
//   • the badge picked its dimensions per scan, so the same client's mark showed
//     different bars from one scan to the next.
//
// Two numbers that disagree about the same software is worse than one number
// nobody can decompose.
// ─────────────────────────────────────────────────────────────────────────────

function check(category: PulseScanCheckInput["category"], key: string, status: PulseScanCheckInput["status"], extra: Partial<PulseScanCheckInput> = {}): PulseScanCheckInput {
  return { category, checkKey: key, label: key, status, confidence: "HIGH", severity: "HIGH", evidenceStrength: "VERIFIED", ...extra } as PulseScanCheckInput;
}

describe("the category bars use the shared core", () => {
  it("does not carry its own PASS/WARN arithmetic any more", () => {
    const report = readFileSync("src/components/pulse/pulse-scan-results.tsx", "utf8");
    const fn = report.slice(report.indexOf("function categoryScore("), report.indexOf("function PillarStrip("));
    expect(fn).toContain("computeScoreBreakdown");
    // The old formula, which weighted nothing.
    expect(fn).not.toContain("earned += 0.5");
  });

  it("agrees with the stored breakdown's own arithmetic for a category", () => {
    // The stored path renders `earned / possible`; the fallback must produce the
    // same figure from the same checks, or a legacy scan reads differently from a
    // current one for no reason the client can see.
    const checks = [
      check(CATEGORIES.SECURITY, "a", "PASS"),
      check(CATEGORIES.SECURITY, "b", "WARN"),
      check(CATEGORIES.SECURITY, "c", "FAIL"),
    ];
    const [row] = computeScoreBreakdown(checks).byCategory;
    expect(Math.round((row.earned / row.possible) * 100)).toBe(50);
  });
});

describe("pillars are a rollup of the headline, not a rival to it", () => {
  const checks = [
    check(CATEGORIES.SECURITY, "sec_pass", "PASS"),
    check(CATEGORIES.SECURITY, "sec_fail", "FAIL"),
    check(CATEGORIES.PERFORMANCE, "perf_pass", "PASS"),
    check(CATEGORIES.LEGAL, "legal_warn", "WARN"),
  ];

  it("reports the same overall figure as computeScoreBreakdown", () => {
    expect(computePillarBreakdown(checks).overall).toBe(computeScoreBreakdown(checks).finalScore);
  });

  it("names every pillar it could not assess instead of scoring it zero", () => {
    const { pillars, dropped } = computePillarBreakdown(checks);
    expect(dropped.length).toBeGreaterThan(0);
    for (const key of dropped) {
      const pillar = pillars.find((candidate) => candidate.key === key)!;
      expect(pillar.score).toBeNull();
      expect(pillar.droppedReason, `${key} must say why it was dropped`).toBeTruthy();
    }
  });

  it("redistributes a dropped pillar's weight rather than losing it", () => {
    const { pillars } = computePillarBreakdown(checks);
    const applied = pillars.filter((pillar) => pillar.score !== null);
    const total = applied.reduce((sum, pillar) => sum + pillar.effectiveWeight, 0);
    expect(Math.round(total)).toBe(100);
    // And each applied pillar carries MORE than its published share, because the
    // dropped ones' points went somewhere rather than nowhere.
    for (const pillar of applied) {
      expect(pillar.effectiveWeight).toBeGreaterThanOrEqual(pillar.publishedWeight);
    }
  });

  it("publishes weights that sum to 100", () => {
    expect(PILLARS.reduce((sum, pillar) => sum + pillar.weight, 0)).toBe(100);
  });
});

describe("pillars are actually shipped", () => {
  // They existed for a release as 239 correct lines imported only by their own
  // test. A rollup nobody can see is not a rollup.
  it("renders in the report", () => {
    const report = readFileSync("src/components/pulse/pulse-scan-results.tsx", "utf8");
    expect(report).toContain("computePillarBreakdown");
    expect(report, "the strip must be mounted, not merely defined").toContain("<PillarStrip");
  });

  it("drives the public badge's bars", () => {
    const badge = readFileSync("src/app/api/badge/pulse/[token]/route.ts", "utf8");
    expect(badge).toContain("computePillarBreakdown");
    // The old per-scan domain pick, which made a client's mark unstable between scans.
    expect(badge).not.toContain("DOMAIN_DEFS");
  });

  it("has the doc it cites", () => {
    const doc = readFileSync("docs/pulse-pillars.md", "utf8");
    for (const pillar of PILLARS) {
      expect(doc, `${pillar.label} must be published`).toContain(pillar.label);
    }
  });
});
