import { describe, expect, it } from "vitest";
import { evaluateStandard, type ProvenanceCheckEvidence } from "../evaluate";
import { DEMO_NAMES, SCENARIOS } from "../demo-scenarios";
import { SAS_1 } from "../standard";

// The seed route cannot be run locally — there is no local database and no staging
// environment (docs/build-checklist.md §4). So the demo data's correctness is established
// HERE, against the real engine, before it is ever seeded. Without this the certificates
// Dan shows in a pitch would be unverified until someone eyeballed production.
//
// A failure here means either a fixture is wrong or the engine's grading changed. Both
// want looking at before the demo is shown to anyone.

const asEvidence = (checks: (typeof SCENARIOS)[number]["checks"]): ProvenanceCheckEvidence[] =>
  checks.map((c) => ({ checkKey: c.checkKey, status: c.status, confidence: c.confidence, detail: c.detail }));

describe("demo scenarios produce the grades they claim", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.projectName} → ${scenario.expectGrade}`, () => {
      const result = evaluateStandard(asEvidence(scenario.checks), SAS_1);
      expect(result.grade, result.gradeReason).toBe(scenario.expectGrade);
    });
  }
});

describe("the demo set covers every grade", () => {
  it("includes all four grades, so a demo shows the full range", () => {
    const grades = new Set(SCENARIOS.map((s) => s.expectGrade));
    expect([...grades].sort()).toEqual(["CERTIFIED", "CONDITIONAL", "INCOMPLETE", "NOT_CERTIFIED"]);
  });

  it("includes a mark to revoke and a subject issued twice", () => {
    // Otherwise the register never shows REVOKED or SUPERSEDED, which are the two states
    // that prove withdrawal and renewal are visible rather than silent.
    expect(SCENARIOS.some((s) => s.revokeReason)).toBe(true);
    expect(SCENARIOS.some((s) => s.issueTwice)).toBe(true);
  });

  it("has unique project names, since the seed is idempotent on them", () => {
    expect(new Set(DEMO_NAMES).size).toBe(DEMO_NAMES.length);
  });
});

describe("the INCOMPLETE scenario is the one that matters", () => {
  const unreadable = SCENARIOS.find((s) => s.expectGrade === "INCOMPLETE")!;

  it("is graded INCOMPLETE, not NOT_CERTIFIED — nothing was proven broken", () => {
    const result = evaluateStandard(asEvidence(unreadable.checks), SAS_1);
    expect(result.grade).toBe("INCOMPLETE");
    // The distinction the product turns on: no critical clause FAILED, several are UNPROVEN.
    const critical = result.clauses.filter((c) => c.critical);
    expect(critical.some((c) => c.verdict === "FAILED")).toBe(false);
    expect(critical.some((c) => c.verdict === "UNPROVEN")).toBe(true);
  });

  it("reports its unmeasured clauses as blind spots rather than passing them", () => {
    const result = evaluateStandard(asEvidence(unreadable.checks), SAS_1);
    expect(result.blindSpots.some((b) => b.kind === "CLAUSE_NOT_MEASURED")).toBe(true);
    expect(result.coverage.unmeasured).toBeGreaterThan(0);
  });
});

describe("the NOT_CERTIFIED scenario fails on confirmed evidence", () => {
  it("fails a critical clause at provable confidence", () => {
    const bad = SCENARIOS.find((s) => s.expectGrade === "NOT_CERTIFIED")!;
    const result = evaluateStandard(asEvidence(bad.checks), SAS_1);
    const failedCritical = result.clauses.filter((c) => c.critical && c.verdict === "FAILED");
    expect(failedCritical.length).toBeGreaterThan(0);
    // Not a LOW-confidence guess — an actual finding, which is what licenses a fail.
    expect(failedCritical.every((c) => c.confidence === "HIGH" || c.confidence === "MEDIUM")).toBe(true);
  });
});

describe("fixtures reference only real checks", () => {
  it("every seeded checkKey is one SAS-1 actually relies on", () => {
    // A fixture key that no clause covers is dead weight: it would seed a check that
    // contributes to nothing and quietly overstate how much the demo exercises.
    const clauseKeys = new Set(SAS_1.clauses.flatMap((c) => c.checkKeys));
    const stray = new Set<string>();
    for (const s of SCENARIOS) {
      for (const c of s.checks) if (!clauseKeys.has(c.checkKey)) stray.add(c.checkKey);
    }
    expect([...stray]).toEqual([]);
  });
});
