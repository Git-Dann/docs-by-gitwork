import { describe, expect, it } from "vitest";
import { evaluateReleaseGate } from "../release-decision";
import { rankFindings } from "../priority";
import { DERIVED_STANDARD_KEYS, isDerivedRestatement } from "../standards-derived";
import { CATEGORIES } from "../categories";
import { buildAgentVerdict } from "@/server/pulse-agent";
import type { PulseScanCheckInput } from "@/types/pulse";

// linear.app, 26 Oct 2026: one unlabelled button produced three gate failures, because two
// derived standards rows restated `buttons_have_names`. vercel/commerce listed its vulnerable
// libraries twice in its top fixes the same way. A restatement stays in the check list but is
// never a finding of its own.

const derivedKey = [...DERIVED_STANDARD_KEYS][0];
const fail = (checkKey: string, category: string = CATEGORIES.ACCESSIBILITY): PulseScanCheckInput =>
  ({ category, checkKey, label: checkKey, status: "FAIL", confidence: "HIGH", trustBucket: "CONFIRMED", detail: `${checkKey} failed` }) as PulseScanCheckInput;

const checks = [fail("buttons_have_names"), fail(derivedKey, CATEGORIES.STANDARDS_VERIFICATION)];

describe("a derived standards row is never counted as a finding of its own", () => {
  it("knows which rows are restatements", () => {
    expect(isDerivedRestatement(derivedKey)).toBe(true);
    expect(isDerivedRestatement("buttons_have_names")).toBe(false);
  });

  it("the gate counts the real failure once", () => {
    const gate = evaluateReleaseGate(checks, { finalScore: 90, completeness: 90 });
    const unresolved = gate.conditional.find((r) => r.code === "UNRESOLVED_FAILURES");
    expect(unresolved?.checkKeys).toEqual(["buttons_have_names"]);
  });

  it("the ranked fix list carries only the real check", () => {
    expect(rankFindings(checks).map((r) => r.check.checkKey)).toEqual(["buttons_have_names"]);
  });

  it("the agent verdict lists the issue once", () => {
    const v = buildAgentVerdict({ url: "https://linear.app", status: "COMPLETED", healthScore: 90, techStack: [], checks });
    expect(v.confirmedIssues.map((i) => i.checkKey)).toEqual(["buttons_have_names"]);
    expect(v.counts.failures).toBe(1);
  });
});
