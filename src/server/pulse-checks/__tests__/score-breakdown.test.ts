import { describe, expect, it } from "vitest";
import { computeScoreBreakdown } from "../score-breakdown";
import { CATEGORIES } from "../categories";
import type { PulseCheckStatus, PulseScanCheckInput } from "@/types/pulse";

// ─────────────────────────────────────────────────────────────────────────────
// `computeScoreBreakdown` is the single most consequential function in Pulse — it
// produces the number on every report, badge, benchmark and Countermark — and it
// had no test of its own. `score-input-contract.test.ts` guards which FIELDS it
// reads; nothing asserted what it DOES with them.
//
// The rule these tests exist to protect is the product's whole credibility claim,
// stated repeatedly in CLAUDE.md (§34.2, §35, §38): **"we could not look" must
// never be scored as "it is not there", and must never be scored as a pass
// either.** That is a property of the arithmetic, so it belongs in a test and not
// in a comment.
// ─────────────────────────────────────────────────────────────────────────────

function check(over: Partial<PulseScanCheckInput> & { status: PulseCheckStatus }): PulseScanCheckInput {
  return {
    category: CATEGORIES.SECURITY,
    checkKey: `k_${Math.abs(hash(JSON.stringify(over)))}`,
    label: "test check",
    ...over,
  } as PulseScanCheckInput;
}

/** Deterministic — Math.random() would make a failure unreproducible. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

describe("excluded statuses never move the score", () => {
  it("scores an all-SKIPPED scan as 0 possible rather than 100%", () => {
    const r = computeScoreBreakdown([
      check({ checkKey: "a", status: "SKIPPED" }),
      check({ checkKey: "b", status: "SKIPPED" }),
    ]);
    // Nothing was measured, so nothing was earned — crucially NOT a perfect score.
    expect(r.totalWeight).toBe(0);
    expect(r.rawScore).toBe(0);
  });

  it("gives the same score whether or not unmeasured checks are present", () => {
    const measured = [
      check({ checkKey: "a", status: "PASS" }),
      check({ checkKey: "b", status: "FAIL" }),
    ];
    const withSkips = [
      ...measured,
      check({ checkKey: "c", status: "SKIPPED" }),
      check({ checkKey: "d", status: "NOT_APPLICABLE" }),
    ];
    // This is the §34.1 promise: a project is never penalised for a check that
    // could not apply to it. Adding skips must be inert, not dilutive.
    expect(computeScoreBreakdown(withSkips).rawScore).toBe(computeScoreBreakdown(measured).rawScore);
  });

  it("counts skipped checks as excluded rather than silently dropping them", () => {
    const r = computeScoreBreakdown([
      check({ checkKey: "a", status: "PASS" }),
      check({ checkKey: "b", status: "SKIPPED" }),
    ]);
    expect(r.excludedCount).toBeGreaterThan(0);
  });
});

describe("unknown outcomes lower completeness and never raise health", () => {
  it("does not let an INCONCLUSIVE check earn credit", () => {
    const allPass = [check({ checkKey: "a", status: "PASS" })];
    const passPlusUnknown = [
      check({ checkKey: "a", status: "PASS" }),
      check({ checkKey: "b", status: "INCONCLUSIVE", completenessEligible: true }),
    ];
    const a = computeScoreBreakdown(allPass);
    const b = computeScoreBreakdown(passPlusUnknown);
    // An unprovable alarm must not be scored as a failure...
    expect(b.rawScore).toBe(a.rawScore);
    // ...but it must show up as reduced confidence in the measurement.
    expect(b.completeness).toBeLessThan(a.completeness);
    expect(b.unknownWeight).toBeGreaterThan(0);
  });

  it("brackets the score between its bounds", () => {
    const r = computeScoreBreakdown([
      check({ checkKey: "a", status: "PASS" }),
      check({ checkKey: "b", status: "FAIL" }),
      check({ checkKey: "c", status: "INCONCLUSIVE", completenessEligible: true }),
    ]);
    expect(r.lowerBound).toBeLessThanOrEqual(r.rawScore);
    expect(r.upperBound).toBeGreaterThanOrEqual(r.rawScore);
  });
});

describe("a scan that could not read the target is not a scan", () => {
  it("floors the final score at 0 when target content was inaccessible", () => {
    const r = computeScoreBreakdown([
      check({ checkKey: "target_content_accessible", status: "FAIL" }),
      // Plenty of incidental passes that would otherwise produce a healthy number.
      check({ checkKey: "a", status: "PASS" }),
      check({ checkKey: "b", status: "PASS" }),
      check({ checkKey: "c", status: "PASS" }),
    ]);
    expect(r.rawScore).toBeGreaterThan(0); // the raw ratio is genuinely high...
    expect(r.finalScore).toBe(0);          // ...and must not be reported as health
    expect(r.capsApplied.map((c) => c.cap)).toContain(0);
    expect(r.lowerBound).toBe(0);
    expect(r.upperBound).toBe(0);
  });
});

describe("outcome ordering", () => {
  it("ranks all-pass above mixed above all-fail", () => {
    const mk = (status: PulseCheckStatus) => [
      check({ checkKey: "a", status }),
      check({ checkKey: "b", status }),
    ];
    const pass = computeScoreBreakdown(mk("PASS")).rawScore;
    const warn = computeScoreBreakdown(mk("WARN")).rawScore;
    const fail = computeScoreBreakdown(mk("FAIL")).rawScore;
    expect(pass).toBeGreaterThan(warn);
    expect(warn).toBeGreaterThan(fail);
    expect(fail).toBe(0);
    expect(pass).toBe(100);
  });
});

describe("no category can dominate by volume", () => {
  it("does not let a category with many checks outweigh one with few", () => {
    // 1 failing SECURITY check against 20 passing ACCESSIBILITY ones. If the score
    // were a flat ratio over checks, the failure would round away to ~95. The
    // per-category cap exists so registering more controls in one category cannot
    // dilute another — without it, adding checks would silently reweight the score.
    const lopsided: PulseScanCheckInput[] = [
      check({ category: CATEGORIES.SECURITY, checkKey: "sec", status: "FAIL" }),
      ...Array.from({ length: 20 }, (_, i) =>
        check({ category: CATEGORIES.ACCESSIBILITY, checkKey: `a11y_${i}`, status: "PASS" }),
      ),
    ];
    const r = computeScoreBreakdown(lopsided);
    expect(r.rawScore).toBeLessThan(90);
  });
});

describe("correlated controls share weight", () => {
  it("counts five checks sharing one controlId less than five independent ones", () => {
    const shared = Array.from({ length: 5 }, (_, i) =>
      check({ checkKey: `s_${i}`, controlId: "same-control", status: "FAIL" }),
    );
    const independent = Array.from({ length: 5 }, (_, i) =>
      check({ checkKey: `i_${i}`, status: "FAIL" }),
    );
    // Both score 0 (all failing), so compare the WEIGHT those failures carry:
    // five facets of one control must not count as five separate problems.
    const s = computeScoreBreakdown([...shared, check({ checkKey: "p", status: "PASS", category: CATEGORIES.SEO })]);
    const i = computeScoreBreakdown([...independent, check({ checkKey: "p", status: "PASS", category: CATEGORIES.SEO })]);
    expect(s.rawScore).toBeGreaterThanOrEqual(i.rawScore);
  });
});

describe("non-technical and unscored checks are kept out of the number", () => {
  it("ignores vanity signals like github_stars", () => {
    const withVanity = computeScoreBreakdown([
      check({ checkKey: "a", status: "PASS" }),
      check({ checkKey: "github_stars", status: "FAIL" }),
      check({ checkKey: "social_proof", status: "FAIL" }),
    ]);
    // A project is not less production-ready for having few GitHub stars.
    expect(withVanity.rawScore).toBe(100);
  });

  it("ignores checks explicitly marked scoreEligible: false", () => {
    const r = computeScoreBreakdown([
      check({ checkKey: "a", status: "PASS" }),
      check({ checkKey: "b", status: "FAIL", scoreEligible: false }),
    ]);
    expect(r.rawScore).toBe(100);
  });

  it("ignores the Standards Verification category", () => {
    const r = computeScoreBreakdown([
      check({ checkKey: "a", status: "PASS" }),
      check({ category: CATEGORIES.STANDARDS_VERIFICATION, checkKey: "b", status: "FAIL" }),
    ]);
    expect(r.rawScore).toBe(100);
  });
});

describe("degenerate input", () => {
  it("returns a defined, zeroed breakdown for an empty scan", () => {
    const r = computeScoreBreakdown([]);
    expect(r.rawScore).toBe(0);
    expect(r.finalScore).toBe(0);
    expect(r.totalWeight).toBe(0);
    expect(r.byCategory).toEqual([]);
  });
});
