import { describe, it, expect } from "vitest";
import { MockCodeRunnerProvider } from "../providers/code-runner/mock";
import { passRate } from "../providers/code-runner/types";
import { MockIdentityProvider } from "../providers/identity/mock";

describe("MockCodeRunnerProvider", () => {
  it("is deterministic and derives a pass rate from content", async () => {
    const runner = new MockCodeRunnerProvider({ testsTotal: 5 });
    const withCode = await runner.run({
      language: "javascript",
      files: [{ path: "solution.js", content: "export const add = (a,b) => a+b;" }],
    });
    expect(withCode.testsTotal).toBe(5);
    expect(withCode.testsPassed).toBe(4); // round(5 * 0.8)
    expect(passRate(withCode)).toBe(80);
    // Same input → same result (deterministic).
    const again = await runner.run({
      language: "javascript",
      files: [{ path: "solution.js", content: "export const add = (a,b) => a+b;" }],
    });
    expect(again.executionId).toBe(withCode.executionId);
  });

  it("empty submissions pass nothing", async () => {
    const runner = new MockCodeRunnerProvider({ testsTotal: 4 });
    const empty = await runner.run({ language: "javascript", files: [{ path: "s.js", content: "" }] });
    expect(empty.testsPassed).toBe(0);
    expect(passRate(empty)).toBe(0);
  });

  it("honours a forced pass count and reports language support", async () => {
    const runner = new MockCodeRunnerProvider({ testsTotal: 10, testsPassed: 7 });
    const r = await runner.run({ language: "typescript", files: [{ path: "s.ts", content: "x" }] });
    expect(r.testsPassed).toBe(7);
    expect(runner.supportsLanguage("TypeScript")).toBe(true);
    expect(runner.supportsLanguage("python")).toBe(false);
  });
});

describe("MockIdentityProvider", () => {
  it("returns a minimal verified result with NO document data", async () => {
    const idv = new MockIdentityProvider({ checkedAt: "2026-07-06T00:00:00.000Z" });
    const r = await idv.verify({ candidateId: "cand_1", country: "GB" });
    expect(r.status).toBe("verified");
    expect(r.confidence).toBe("HIGH");
    expect(r.verificationId).toBe("mock-idv-cand_1");
    expect(r.checkedAt).toBe("2026-07-06T00:00:00.000Z");
    expect(r.documentType).toBeNull(); // never stores document data
    expect(r.manualReview).toBe(false);
  });

  it("surfaces manual review + error states", async () => {
    const review = await new MockIdentityProvider({ status: "manual_review" }).verify({ candidateId: "c" });
    expect(review.manualReview).toBe(true);
    const errored = await new MockIdentityProvider({ status: "error" }).verify({ candidateId: "c" });
    expect(errored.error).toBe("mock error");
  });
});
