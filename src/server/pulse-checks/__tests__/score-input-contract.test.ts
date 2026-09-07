import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCORE_INPUT_FIELDS, computeScoreBreakdown } from "../score-breakdown";
import { CATEGORIES } from "../categories";
import type { PulseScanCheckInput } from "@/types/pulse";

// ─────────────────────────────────────────────────────────────────────────────
// A narrowed SELECT is a silent way to get a different score.
//
// `computeScoreBreakdown` is pure and total: every field it reads has a fallback,
// so omitting one produces a plausible number rather than an error. The public
// Pulse badge shipped that — it selected category/status/confidence under a
// comment asserting those were all the maths touched, while severity,
// evidenceStrength, scoreEligible, completenessEligible and controlId defaulted.
// Its domain bars could therefore contradict the report they link to, which is
// the one thing CLAUDE.md §39 says a badge must never do.
//
// So the contract is declared next to the maths and checked from both ends.
// ─────────────────────────────────────────────────────────────────────────────

const source = readFileSync("src/server/pulse-checks/score-breakdown.ts", "utf8");

/** Fields the module is actually observed to read, straight from its source. */
function fieldsReadInSource(): string[] {
  return [...new Set([...source.matchAll(/\bcheck\.([a-zA-Z]+)/g)].map((m) => m[1]))].sort();
}

describe("the declared score inputs match what the code reads", () => {
  it("declares every field, and no field it does not read", () => {
    expect(fieldsReadInSource()).toEqual([...SCORE_INPUT_FIELDS]);
  });
});

describe("callers that recompute from a narrowed select", () => {
  // The badge is the only route that recomputes rather than reading the stored
  // breakdown. If another appears, add it here.
  const badge = readFileSync("src/app/api/badge/pulse/[token]/route.ts", "utf8");
  const select = badge.slice(badge.indexOf("checks: {"), badge.indexOf("if (!scan) return null"));

  it("the Pulse badge selects every field the score maths reads", () => {
    const missing = SCORE_INPUT_FIELDS.filter((field) => !new RegExp(`\\b${field}:\\s*true`).test(select));
    expect(
      missing,
      `the badge recomputes computeScoreBreakdown over these rows, so a field it does not select ` +
        `is silently defaulted and its bars drift from the report: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});

describe("what an omitted field actually costs", () => {
  // Two views of one underlying signal, sharing a controlId so the independence
  // damper counts them once. It is the field most easily forgotten and the one
  // whose absence is least visible.
  const failing = (checkKey: string, controlId: string): PulseScanCheckInput => ({
    category: CATEGORIES.SECURITY,
    checkKey,
    label: checkKey,
    status: "FAIL",
    confidence: "HIGH",
    severity: "HIGH",
    evidenceStrength: "VERIFIED",
    controlId,
  });
  const passingIn = (category: PulseScanCheckInput["category"], checkKey: string): PulseScanCheckInput => ({
    category,
    checkKey,
    label: checkKey,
    status: "PASS",
    confidence: "HIGH",
    severity: "HIGH",
    evidenceStrength: "VERIFIED",
  });
  const passing = passingIn(CATEGORIES.PERFORMANCE, "fast");

  it("scores differently when controlId is dropped from the row", () => {
    // The passing check must share the failures' CATEGORY. Scores are normalised
    // per category, so damping every check in a category by the same factor leaves
    // its ratio identical — the damper is only observable against an undamped
    // sibling. (My first fixture put the PASS in another category and read as a
    // no-op, which would have made this test permanently green and worthless.)
    const withDamper = [failing("a", "shared"), failing("b", "shared"), passingIn(CATEGORIES.SECURITY, "ok"), passing];
    const withoutDamper = withDamper.map((row) => {
      const narrowed = { ...row };
      delete narrowed.controlId;
      return narrowed;
    });
    expect(computeScoreBreakdown(withDamper).finalScore)
      .not.toBe(computeScoreBreakdown(withoutDamper).finalScore);
  });

  it("reports different completeness when completenessEligible is dropped", () => {
    const diagnostic: PulseScanCheckInput = {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "scan_collector_completeness",
      label: "Collector coverage",
      status: "ERROR",
      scoreEligible: false,
      completenessEligible: true,
      severity: "HIGH",
      confidence: "HIGH",
    };
    const kept = computeScoreBreakdown([passing, diagnostic]);
    const dropped = computeScoreBreakdown([
      passing,
      { ...diagnostic, completenessEligible: undefined },
    ]);
    expect(kept.completeness).toBeLessThan(100);
    expect(dropped.completeness).toBe(100);
  });
});
