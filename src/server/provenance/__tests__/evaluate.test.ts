import { describe, expect, it } from "vitest";
import { evaluateStandard, type ProvenanceCheckEvidence } from "../evaluate";
import { SAS_1, STANDARDS } from "../standard";
import type { ProvenanceStandard } from "../types";
import { CHECKS_REGISTRY } from "@/server/checks-registry";

// A tiny standard so the verdict rules are tested in isolation from SAS-1's clause set.
const TEST_STANDARD: ProvenanceStandard = {
  id: "TEST-1",
  version: "1.0.0",
  label: "Test standard",
  summary: "Fixture.",
  validityDays: { certified: 90, conditional: 30 },
  clauses: [
    {
      id: "A",
      title: "Critical clause",
      assertion: "a",
      whyItMatters: "w",
      critical: true,
      checkKeys: ["k1", "k2"],
    },
    {
      id: "B",
      title: "Non-critical clause",
      assertion: "b",
      whyItMatters: "w",
      critical: false,
      checkKeys: ["k3"],
    },
  ],
};

const check = (
  checkKey: string,
  status: ProvenanceCheckEvidence["status"],
  confidence: ProvenanceCheckEvidence["confidence"] = "HIGH",
): ProvenanceCheckEvidence => ({ checkKey, status, confidence });

describe("clause verdicts", () => {
  it("is MET when every covering check passed", () => {
    const r = evaluateStandard([check("k1", "PASS"), check("k2", "PASS"), check("k3", "PASS")], TEST_STANDARD);
    expect(r.clauses.map((c) => c.verdict)).toEqual(["MET", "MET"]);
    expect(r.grade).toBe("CERTIFIED");
  });

  it("is UNPROVEN — never MET — when no covering check ran at all", () => {
    // The core rule. A scan that read nothing must not certify anything.
    const r = evaluateStandard([check("k3", "PASS")], TEST_STANDARD);
    const a = r.clauses.find((c) => c.clauseId === "A")!;
    expect(a.verdict).toBe("UNPROVEN");
    expect(a.evidenceKeys).toEqual([]);
    expect(a.missingKeys).toEqual(["k1", "k2"]);
    expect(a.rationale).toContain("Not established");
  });

  it("is FAILED on an adverse check at HIGH or MEDIUM confidence", () => {
    for (const conf of ["HIGH", "MEDIUM"] as const) {
      const r = evaluateStandard([check("k1", "FAIL", conf), check("k2", "PASS")], TEST_STANDARD);
      expect(r.clauses.find((c) => c.clauseId === "A")!.verdict).toBe("FAILED");
    }
  });

  it("treats an unset confidence as MEDIUM, so it still proves a failure", () => {
    // deriveConfidence's own fail-safe default. Stated explicitly because here the default
    // decides whether a failure counts at all.
    const r = evaluateStandard(
      [{ checkKey: "k1", status: "FAIL" }, check("k2", "PASS")],
      TEST_STANDARD,
    );
    expect(r.clauses.find((c) => c.clauseId === "A")!.verdict).toBe("FAILED");
  });

  it("does NOT fail a clause on a LOW-confidence adverse check — and does not pass it either", () => {
    // Mirrors score-breakdown.ts (an unproven alarm shouldn't tank the score); the stronger
    // consequence here is that it must not earn a pass on the way through.
    const r = evaluateStandard([check("k1", "FAIL", "LOW"), check("k2", "FAIL", "LOW")], TEST_STANDARD);
    const a = r.clauses.find((c) => c.clauseId === "A")!;
    expect(a.verdict).toBe("UNPROVEN");
    expect(a.confidence).toBe("LOW");
    expect(a.rationale).toContain("low-confidence");
  });

  it("is QUALIFIED on a proven warning", () => {
    const r = evaluateStandard([check("k1", "WARN"), check("k2", "PASS"), check("k3", "PASS")], TEST_STANDARD);
    expect(r.clauses.find((c) => c.clauseId === "A")!.verdict).toBe("QUALIFIED");
    expect(r.grade).toBe("CONDITIONAL");
  });

  it("prefers FAILED over QUALIFIED when both are present in one clause", () => {
    const r = evaluateStandard([check("k1", "FAIL"), check("k2", "WARN")], TEST_STANDARD);
    expect(r.clauses.find((c) => c.clauseId === "A")!.verdict).toBe("FAILED");
  });

  it("is NOT_APPLICABLE when every covering check was skipped", () => {
    const r = evaluateStandard([check("k1", "SKIPPED"), check("k2", "SKIPPED"), check("k3", "PASS")], TEST_STANDARD);
    const a = r.clauses.find((c) => c.clauseId === "A")!;
    expect(a.verdict).toBe("NOT_APPLICABLE");
    // A clause that does not apply must not block certification — that is the whole point
    // of Pulse's SKIPPED semantics (§34.1: a Swift repo has no ESLint config by design).
    expect(r.grade).toBe("CERTIFIED");
  });

  it("still passes a clause that is partly skipped and partly passing", () => {
    const r = evaluateStandard([check("k1", "PASS"), check("k2", "SKIPPED"), check("k3", "PASS")], TEST_STANDARD);
    expect(r.clauses.find((c) => c.clauseId === "A")!.verdict).toBe("MET");
  });

  it("records the strongest adverse confidence, not the first seen", () => {
    const r = evaluateStandard([check("k1", "FAIL", "MEDIUM"), check("k2", "FAIL", "HIGH")], TEST_STANDARD);
    expect(r.clauses.find((c) => c.clauseId === "A")!.confidence).toBe("HIGH");
  });
});

describe("grades", () => {
  it("NOT_CERTIFIED when a critical clause provably failed", () => {
    const r = evaluateStandard([check("k1", "FAIL"), check("k3", "PASS")], TEST_STANDARD);
    expect(r.grade).toBe("NOT_CERTIFIED");
    expect(r.gradeReason).toContain("A");
  });

  it("INCOMPLETE when a critical clause could not be established", () => {
    // The distinction the product turns on: "we could not check this" is not "this is broken".
    const r = evaluateStandard([check("k3", "PASS")], TEST_STANDARD);
    expect(r.grade).toBe("INCOMPLETE");
    expect(r.gradeReason).toContain("cannot certify what was not checked");
  });

  it("reports a confirmed failure ahead of an unproven one", () => {
    // Both conditions hold: A fails, and there is nothing for a second critical clause.
    const twoCritical: ProvenanceStandard = {
      ...TEST_STANDARD,
      clauses: [TEST_STANDARD.clauses[0], { ...TEST_STANDARD.clauses[1], critical: true }],
    };
    const r = evaluateStandard([check("k1", "FAIL")], twoCritical);
    expect(r.grade).toBe("NOT_CERTIFIED");
  });

  it("CONDITIONAL when only non-critical clauses failed", () => {
    const r = evaluateStandard([check("k1", "PASS"), check("k2", "PASS"), check("k3", "FAIL")], TEST_STANDARD);
    expect(r.grade).toBe("CONDITIONAL");
  });

  it("never certifies on an empty check set", () => {
    const r = evaluateStandard([], TEST_STANDARD);
    expect(r.grade).toBe("INCOMPLETE");
    expect(r.coverage.pct).toBe(0);
  });
});

describe("coverage and blind spots", () => {
  it("counts NOT_APPLICABLE as measured — we looked, and it did not apply", () => {
    const r = evaluateStandard([check("k1", "SKIPPED"), check("k2", "SKIPPED"), check("k3", "PASS")], TEST_STANDARD);
    expect(r.coverage).toMatchObject({ measured: 2, unmeasured: 0, total: 2, pct: 100 });
  });

  it("names the unmeasured clauses in a blind spot", () => {
    const r = evaluateStandard([check("k3", "PASS")], TEST_STANDARD);
    const spot = r.blindSpots.find((b) => b.kind === "CLAUSE_NOT_MEASURED");
    expect(spot).toBeDefined();
    expect(spot!.clauseIds).toEqual(["A"]);
    expect(spot!.statement).toContain("Critical clause");
  });

  it("flags thin evidence when a clause passed on only some of its checks", () => {
    const r = evaluateStandard([check("k1", "PASS"), check("k3", "PASS")], TEST_STANDARD);
    expect(r.clauses.find((c) => c.clauseId === "A")!.verdict).toBe("MET");
    expect(r.blindSpots.some((b) => b.kind === "THIN_EVIDENCE")).toBe(true);
  });

  it("always states the runtime limit, even on a fully clean examination", () => {
    // Unconditional on purpose: a reader must never have to infer the product's boundary
    // from the absence of a caveat.
    const r = evaluateStandard([check("k1", "PASS"), check("k2", "PASS"), check("k3", "PASS")], TEST_STANDARD);
    expect(r.blindSpots.some((b) => b.kind === "RUNTIME_NOT_PROBED")).toBe(true);
  });

  it("warns when coverage is too thin to read the mark as a full examination", () => {
    const r = evaluateStandard([check("k3", "PASS")], TEST_STANDARD);
    expect(r.coverage.pct).toBe(50);
    expect(r.blindSpots.some((b) => b.kind === "SOURCE_NOT_READ")).toBe(true);
  });
});

describe("purity", () => {
  it("returns an identical result for identical input", () => {
    const checks = [check("k1", "PASS"), check("k2", "WARN"), check("k3", "FAIL", "LOW")];
    expect(evaluateStandard(checks, TEST_STANDARD)).toEqual(evaluateStandard(checks, TEST_STANDARD));
  });

  it("does not depend on check order", () => {
    const checks = [check("k1", "PASS"), check("k2", "FAIL"), check("k3", "WARN")];
    const a = evaluateStandard(checks, TEST_STANDARD);
    const b = evaluateStandard([...checks].reverse(), TEST_STANDARD);
    expect(a.grade).toBe(b.grade);
    expect(a.clauses.map((c) => c.verdict)).toEqual(b.clauses.map((c) => c.verdict));
  });
});

describe("SAS-1 integrity", () => {
  const registered = new Set(CHECKS_REGISTRY.map((c) => c.key));

  it("every clause check key exists in the checks registry", () => {
    // A clause pointing at a key no check emits is UNPROVEN forever, which reads on the
    // certificate as "we could not check this" when the truth is "we asked the wrong
    // question". Same drift guard as categories.reconcile.test.ts, one layer up.
    const unknown = SAS_1.clauses.flatMap((c) =>
      c.checkKeys.filter((k) => !registered.has(k)).map((k) => `${c.id}:${k}`),
    );
    expect(unknown).toEqual([]);
  });

  it("has unique clause ids", () => {
    const ids = SAS_1.clauses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every clause an assertion, a rationale for the reader, and at least one check", () => {
    for (const c of SAS_1.clauses) {
      expect(c.assertion.length, `${c.id} assertion`).toBeGreaterThan(20);
      expect(c.whyItMatters.length, `${c.id} whyItMatters`).toBeGreaterThan(20);
      expect(c.checkKeys.length, `${c.id} checkKeys`).toBeGreaterThan(0);
    }
  });

  it("registers itself under its own id", () => {
    expect(STANDARDS[SAS_1.id]).toBe(SAS_1);
  });

  it("cannot certify a real-world scan that returned nothing", () => {
    // The §35 scenario end to end: an unreadable private repo yields no checks. The mark
    // must come out INCOMPLETE, not CERTIFIED and not NOT_CERTIFIED.
    const r = evaluateStandard([], SAS_1);
    expect(r.grade).toBe("INCOMPLETE");
    expect(r.counts.MET).toBe(0);
    expect(r.counts.FAILED).toBe(0);
    expect(r.counts.UNPROVEN).toBe(SAS_1.clauses.length);
  });
});
