import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canSeal, canonicalise, computeDigest, computeSeal, verifyAttestation } from "../digest";
import { buildPayload } from "../issue";
import type { AttestationPayload, ClauseOutcome } from "../types";

const clause = (clauseId: string, verdict: ClauseOutcome["verdict"]): ClauseOutcome => ({
  clauseId,
  title: `Clause ${clauseId}`,
  assertion: "assertion",
  critical: false,
  verdict,
  rationale: "rationale",
  confidence: null,
  evidenceKeys: [],
  missingKeys: [],
});

const PAYLOAD_INPUT = {
  hallmarkId: "hm_1",
  issuedAt: new Date("2026-07-29T12:00:00.000Z"),
  expiresAt: new Date("2026-10-27T12:00:00.000Z"),
  issuerName: "Gitwork",
  subjectName: "Acme Booking",
  subjectRepo: "acme/booking",
  subjectCommit: null,
  subjectUrl: "https://acme.test",
  standardId: "SAS-1",
  standardVersion: "1.0.0",
  grade: "CONDITIONAL" as const,
  clauses: [clause("C1", "MET"), clause("C2", "FAILED")],
  blindSpots: [
    { kind: "RUNTIME_NOT_PROBED" as const, statement: "s", clauseIds: [] },
    { kind: "CLAUSE_NOT_MEASURED" as const, statement: "s", clauseIds: ["C3"] },
    { kind: "RUNTIME_NOT_PROBED" as const, statement: "different prose", clauseIds: [] },
  ],
  scanId: "scan_1",
  scanVersion: "2026.07",
  checkCount: 412,
};

const ORIGINAL_SECRET = process.env.ASSAY_SIGNING_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.ASSAY_SIGNING_SECRET;
  else process.env.ASSAY_SIGNING_SECRET = ORIGINAL_SECRET;
});

describe("canonicalise", () => {
  it("sorts object keys so equal values digest identically regardless of build order", () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));
  });

  it("sorts nested keys too", () => {
    expect(canonicalise({ x: { b: 1, a: 2 } })).toBe(canonicalise({ x: { a: 2, b: 1 } }));
  });

  it("preserves array order, because array order is meaningful here", () => {
    expect(canonicalise([1, 2])).not.toBe(canonicalise([2, 1]));
  });

  it("drops undefined members, matching JSON.stringify so a round-trip still verifies", () => {
    expect(canonicalise({ a: 1, b: undefined })).toBe(canonicalise({ a: 1 }));
  });

  it("handles null and primitives", () => {
    expect(canonicalise(null)).toBe("null");
    expect(canonicalise("x")).toBe('"x"');
    expect(canonicalise(4)).toBe("4");
  });
});

describe("buildPayload", () => {
  it("sorts clauses by id and reduces them to verdicts only", () => {
    const p = buildPayload({ ...PAYLOAD_INPUT, clauses: [clause("C2", "FAILED"), clause("C1", "MET")] });
    expect(p.clauses).toEqual([
      { clauseId: "C1", verdict: "MET" },
      { clauseId: "C2", verdict: "FAILED" },
    ]);
  });

  it("excludes clause prose, so rewording a rationale cannot invalidate an issued seal", () => {
    const a = buildPayload(PAYLOAD_INPUT);
    const reworded = PAYLOAD_INPUT.clauses.map((c) => ({ ...c, rationale: "completely different text" }));
    const b = buildPayload({ ...PAYLOAD_INPUT, clauses: reworded });
    expect(computeDigest(a)).toBe(computeDigest(b));
  });

  it("de-duplicates and sorts blind-spot kinds", () => {
    expect(buildPayload(PAYLOAD_INPUT).blindSpotKinds).toEqual(["CLAUSE_NOT_MEASURED", "RUNTIME_NOT_PROBED"]);
  });

  it("seals the fact that something was NOT established", () => {
    // Dropping a blind spot must change the digest — otherwise the caveats are cosmetic and
    // could be quietly removed from a certificate after issue.
    const withoutSpot = buildPayload({ ...PAYLOAD_INPUT, blindSpots: [] });
    expect(computeDigest(withoutSpot)).not.toBe(computeDigest(buildPayload(PAYLOAD_INPUT)));
  });
});

describe("computeDigest", () => {
  it("is stable across calls", () => {
    expect(computeDigest(buildPayload(PAYLOAD_INPUT))).toBe(computeDigest(buildPayload(PAYLOAD_INPUT)));
  });

  it("changes when the grade changes", () => {
    const a = computeDigest(buildPayload(PAYLOAD_INPUT));
    const b = computeDigest(buildPayload({ ...PAYLOAD_INPUT, grade: "CERTIFIED" }));
    expect(a).not.toBe(b);
  });

  it("changes when a clause verdict changes", () => {
    const a = computeDigest(buildPayload(PAYLOAD_INPUT));
    const b = computeDigest(buildPayload({ ...PAYLOAD_INPUT, clauses: [clause("C1", "MET"), clause("C2", "MET")] }));
    expect(a).not.toBe(b);
  });

  it("changes when the subject changes", () => {
    const a = computeDigest(buildPayload(PAYLOAD_INPUT));
    const b = computeDigest(buildPayload({ ...PAYLOAD_INPUT, subjectRepo: "someone-else/repo" }));
    expect(a).not.toBe(b);
  });

  it("is a 64-char hex sha256", () => {
    expect(computeDigest(buildPayload(PAYLOAD_INPUT))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sealing", () => {
  it("emits no seal when no secret is configured, rather than a fake one", () => {
    delete process.env.ASSAY_SIGNING_SECRET;
    expect(canSeal()).toBe(false);
    expect(computeSeal(buildPayload(PAYLOAD_INPUT))).toBeNull();
  });

  it("treats an empty or whitespace secret as absent", () => {
    for (const v of ["", "   "]) {
      process.env.ASSAY_SIGNING_SECRET = v;
      expect(canSeal()).toBe(false);
    }
  });

  it("produces a stable seal under a configured secret", () => {
    process.env.ASSAY_SIGNING_SECRET = "s3cret";
    const p = buildPayload(PAYLOAD_INPUT);
    expect(computeSeal(p)).toBe(computeSeal(p));
    expect(computeSeal(p)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a different seal under a different secret", () => {
    const p = buildPayload(PAYLOAD_INPUT);
    process.env.ASSAY_SIGNING_SECRET = "one";
    const a = computeSeal(p);
    process.env.ASSAY_SIGNING_SECRET = "two";
    expect(computeSeal(p)).not.toBe(a);
  });
});

describe("verifyAttestation", () => {
  let payload: AttestationPayload;
  beforeEach(() => {
    payload = buildPayload(PAYLOAD_INPUT);
  });

  it("reports SEALED for an untouched sealed attestation", () => {
    process.env.ASSAY_SIGNING_SECRET = "s3cret";
    const r = verifyAttestation(payload, computeDigest(payload), computeSeal(payload));
    expect(r).toEqual({ verdict: "SEALED", digestMatches: true });
  });

  it("reports UNSEALED when the attestation was issued without a secret", () => {
    delete process.env.ASSAY_SIGNING_SECRET;
    expect(verifyAttestation(payload, computeDigest(payload), null).verdict).toBe("UNSEALED");
  });

  it("reports TAMPERED when the contents no longer match the digest", () => {
    process.env.ASSAY_SIGNING_SECRET = "s3cret";
    const sealed = computeSeal(payload);
    const digest = computeDigest(payload);
    const altered = { ...payload, grade: "CERTIFIED" as const };
    expect(verifyAttestation(altered, digest, sealed).verdict).toBe("TAMPERED");
  });

  it("reports TAMPERED for a forged seal on genuine contents", () => {
    process.env.ASSAY_SIGNING_SECRET = "s3cret";
    const r = verifyAttestation(payload, computeDigest(payload), "a".repeat(64));
    expect(r).toEqual({ verdict: "TAMPERED", digestMatches: true });
  });

  it("reports UNVERIFIABLE — not TAMPERED — when the key is missing or rotated", () => {
    // Crying forgery over a config change would make the verdict useless. Same
    // "we couldn't look ≠ it isn't there" distinction as the rest of the platform.
    process.env.ASSAY_SIGNING_SECRET = "s3cret";
    const sealed = computeSeal(payload);
    const digest = computeDigest(payload);
    delete process.env.ASSAY_SIGNING_SECRET;
    expect(verifyAttestation(payload, digest, sealed).verdict).toBe("UNVERIFIABLE");
  });

  it("does not throw on a hand-edited non-hex seal", () => {
    process.env.ASSAY_SIGNING_SECRET = "s3cret";
    expect(verifyAttestation(payload, computeDigest(payload), "not-hex-at-all").verdict).toBe("TAMPERED");
  });

  it("does not throw on a truncated digest", () => {
    expect(verifyAttestation(payload, "abc", null).verdict).toBe("TAMPERED");
  });
});
