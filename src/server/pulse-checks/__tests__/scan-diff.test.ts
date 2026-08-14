import { describe, expect, it } from "vitest";
import { diffChecks, describeDiff, isProvenPass, type DiffCheck } from "../scan-diff";

// ─────────────────────────────────────────────────────────────────────────────
// The asymmetry these tests exist to defend:
//
//   A FIX MUST BE PROVEN. A DISAPPEARANCE MUST NOT BE MISTAKEN FOR ONE.
//
// Both halves had really shipped. A previously-failing check that was missing
// from the current scan appeared in NO list at all, and any PASS closed a
// finding regardless of whether the probe that produced it completed.
// ─────────────────────────────────────────────────────────────────────────────

function chk(over: Partial<DiffCheck> & Pick<DiffCheck, "checkKey" | "status">): DiffCheck {
  return {
    label: over.checkKey,
    category: "Security",
    confidence: "HIGH",
    ...over,
  };
}

describe("a fix must be proven", () => {
  it("counts a HIGH-confidence PASS over a previous FAIL as fixed", () => {
    const diff = diffChecks([chk({ checkKey: "ssl_valid", status: "FAIL" })], [chk({ checkKey: "ssl_valid", status: "PASS" })]);
    expect(diff.fixed.map((item) => item.checkKey)).toEqual(["ssl_valid"]);
    expect(diff.unverified).toHaveLength(0);
  });

  it("refuses to close a finding on a LOW-confidence PASS", () => {
    const diff = diffChecks(
      [chk({ checkKey: "ssl_valid", status: "FAIL" })],
      [chk({ checkKey: "ssl_valid", status: "PASS", confidence: "LOW" })],
    );
    expect(diff.fixed, "a probe too weak to score cannot be strong enough to resolve").toHaveLength(0);
    expect(diff.unverified[0].reason).toBe("PASS_NOT_PROVEN");
  });

  it("treats an unannotated PASS as unproven rather than trusting it", () => {
    const diff = diffChecks(
      [chk({ checkKey: "ssl_valid", status: "FAIL" })],
      [chk({ checkKey: "ssl_valid", status: "PASS", confidence: null })],
    );
    expect(diff.fixed).toHaveLength(0);
    expect(diff.unverified[0].reason).toBe("PASS_NOT_PROVEN");
  });

  it("isProvenPass is the whole rule, and only PASS satisfies it", () => {
    expect(isProvenPass(chk({ checkKey: "a", status: "PASS" }))).toBe(true);
    expect(isProvenPass(chk({ checkKey: "a", status: "PASS", confidence: "MEDIUM" }))).toBe(true);
    expect(isProvenPass(chk({ checkKey: "a", status: "PASS", confidence: "LOW" }))).toBe(false);
    expect(isProvenPass(chk({ checkKey: "a", status: "WARN" }))).toBe(false);
    expect(isProvenPass(chk({ checkKey: "a", status: "INCONCLUSIVE" }))).toBe(false);
  });
});

describe("a finding that disappears is not a finding that was fixed", () => {
  it("reports a previously-failing check that is absent entirely", () => {
    // The collector errored, or the repo stopped being reachable. Under the old
    // implementation this appeared in no list at all.
    const diff = diffChecks([chk({ checkKey: "no_exposed_env", status: "FAIL" })], []);

    expect(diff.fixed).toHaveLength(0);
    expect(diff.regressed).toHaveLength(0);
    expect(diff.newIssues).toHaveLength(0);
    expect(diff.unverified).toHaveLength(1);
    expect(diff.unverified[0].reason).toBe("CHECK_ABSENT");
    expect(diff.unverified[0].status, "no current status, because there is no current row").toBeNull();
    expect(diff.unverified[0].prevStatus).toBe("FAIL");
  });

  it("names switching a check off as its own reason", () => {
    // Otherwise "turn the check off" is a way to make a finding go away, and
    // the report would say nothing about it.
    const diff = diffChecks(
      [chk({ checkKey: "has_tests", status: "WARN" })],
      [chk({ checkKey: "has_tests", status: "NOT_TESTED" })],
    );
    expect(diff.unverified[0].reason).toBe("CHECK_DISABLED");
    expect(diff.unverified[0].detail).toContain("does not resolve");
  });

  it("distinguishes a broken probe from a resolved finding", () => {
    const diff = diffChecks(
      [chk({ checkKey: "gql_introspection", status: "FAIL" })],
      [chk({ checkKey: "gql_introspection", status: "INCONCLUSIVE", confidence: "LOW" })],
    );
    expect(diff.unverified[0].reason).toBe("PROBE_INCONCLUSIVE");
  });

  it("distinguishes a control that stopped applying", () => {
    const diff = diffChecks(
      [chk({ checkKey: "supabase_rls_enforced", status: "FAIL" })],
      [chk({ checkKey: "supabase_rls_enforced", status: "SKIPPED" })],
    );
    expect(diff.unverified[0].reason).toBe("NOT_APPLICABLE_NOW");
  });

  it("says nothing about a finding that is simply still failing", () => {
    const diff = diffChecks(
      [chk({ checkKey: "ssl_valid", status: "FAIL" })],
      [chk({ checkKey: "ssl_valid", status: "FAIL" })],
    );
    expect(diff.fixed).toHaveLength(0);
    expect(diff.unverified, "persisting is not the same as unverifiable").toHaveLength(0);
    expect(diff.newIssues, "and it is not new either").toHaveLength(0);
  });

  it("counts a FAIL that became a WARN as persisting, not as fixed", () => {
    const diff = diffChecks(
      [chk({ checkKey: "ssl_valid", status: "FAIL" })],
      [chk({ checkKey: "ssl_valid", status: "WARN" })],
    );
    expect(diff.fixed).toHaveLength(0);
    expect(diff.unverified).toHaveLength(0);
  });
});

describe("the other three buckets still behave", () => {
  it("reports a regression", () => {
    const diff = diffChecks(
      [chk({ checkKey: "ssl_valid", status: "PASS" })],
      [chk({ checkKey: "ssl_valid", status: "FAIL" })],
    );
    expect(diff.regressed.map((item) => item.checkKey)).toEqual(["ssl_valid"]);
    expect(diff.regressed[0].prevStatus).toBe("PASS");
  });

  it("reports an issue that was not there before", () => {
    const diff = diffChecks([], [chk({ checkKey: "ios_token_storage", status: "FAIL" })]);
    expect(diff.newIssues.map((item) => item.checkKey)).toEqual(["ios_token_storage"]);
  });

  it("does not call a new PASS a new issue", () => {
    const diff = diffChecks([], [chk({ checkKey: "has_readme", status: "PASS" })]);
    expect(diff.newIssues).toHaveLength(0);
    expect(diff.fixed, "it was never an issue, so it was not fixed").toHaveLength(0);
  });

  it("puts every previously-failing check in exactly one conclusion", () => {
    // The partition property. A finding that lands in none of the buckets is
    // precisely the bug this file was written for.
    const previous = [
      chk({ checkKey: "a", status: "FAIL" }),
      chk({ checkKey: "b", status: "FAIL" }),
      chk({ checkKey: "c", status: "WARN" }),
      chk({ checkKey: "d", status: "FAIL" }),
      chk({ checkKey: "e", status: "FAIL" }),
    ];
    const current = [
      chk({ checkKey: "a", status: "PASS" }),
      chk({ checkKey: "b", status: "PASS", confidence: "LOW" }),
      chk({ checkKey: "c", status: "FAIL" }),
      chk({ checkKey: "d", status: "NOT_TESTED" }),
      // "e" is gone.
    ];
    const diff = diffChecks(previous, current);

    const accountedFor = new Set([
      ...diff.fixed.map((item) => item.checkKey),
      ...diff.unverified.map((item) => item.checkKey),
      // "c" is still failing, which is its own conclusion — reported by its
      // continued presence in the scan, not by the diff.
      "c",
    ]);
    for (const check of previous) {
      expect(accountedFor.has(check.checkKey), `${check.checkKey} reached no conclusion`).toBe(true);
    }
    expect(diff.fixed.map((i) => i.checkKey)).toEqual(["a"]);
    expect(diff.unverified.map((i) => i.checkKey).sort()).toEqual(["b", "d", "e"]);
  });
});

describe("the one-line summary", () => {
  it("states the unverifiable count even when it is zero", () => {
    // Mentioning it only when non-zero would teach a reader that its absence
    // means nothing went missing. Silence does not prove that.
    const clean = diffChecks([chk({ checkKey: "a", status: "FAIL" })], [chk({ checkKey: "a", status: "PASS" })]);
    expect(describeDiff(clean)).toContain("0 no longer verifiable");
  });

  it("counts them when there are some", () => {
    const diff = diffChecks([chk({ checkKey: "a", status: "FAIL" })], []);
    expect(describeDiff(diff)).toContain("1 no longer verifiable");
  });
});
