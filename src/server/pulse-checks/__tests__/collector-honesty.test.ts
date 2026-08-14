import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => ({ fetchScannableUrl: vi.fn() }));
vi.mock("@/server/pulse-lite/url-guard", () => guard);

import { collectorOutcome, collectorCompletenessCheck } from "../collector-health";
import { runBrowserAgent } from "@/server/pulse-agents/browser-agent";
import { runDeployAgent } from "@/server/pulse-agents/deploy-agent";

// ─────────────────────────────────────────────────────────────────────────────
// A collector that failed must not be recorded as one that succeeded.
//
// The scan's agents catch their own network failures and resolve with an empty
// result, so `Promise.allSettled` reported them `fulfilled` and the caller wrote
// COMPLETED. The completeness check — the one control whose entire job is to say
// "these families are unknown, not passing" — therefore asserted that a
// quota-exhausted PageSpeed run and an unreachable host had both succeeded.
//
// The distinction that has to hold: "ran and found nothing" is a result;
// "did not run" is not, and the two must never share a representation.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals();
  guard.fetchScannableUrl.mockReset();
});

describe("collectorOutcome — a settled promise is not proof of success", () => {
  it("records a clean result as COMPLETED", () => {
    expect(collectorOutcome("browser-agent", { status: "fulfilled", value: {} }))
      .toEqual({ name: "browser-agent", outcome: "COMPLETED" });
  });

  it("records a self-reported failure as ERROR even though the promise fulfilled", () => {
    const outcome = collectorOutcome("browser-agent", {
      status: "fulfilled",
      value: { collectorError: "PageSpeed Insights returned HTTP 429" },
    });
    expect(outcome.outcome).toBe("ERROR");
    expect(outcome.detail).toContain("429");
  });

  it("still records a thrown failure as ERROR", () => {
    const outcome = collectorOutcome("browser-agent", { status: "rejected", reason: new Error("boom") });
    expect(outcome.outcome).toBe("ERROR");
    expect(outcome.detail).toContain("boom");
  });

  it("turns a self-reported failure into an ERROR completeness check, not a PASS", () => {
    const honest = collectorCompletenessCheck([
      collectorOutcome("url-checks", { status: "fulfilled", value: {} }),
      collectorOutcome("browser-agent", { status: "fulfilled", value: { collectorError: "quota exhausted" } }),
    ]);
    expect(honest.status).toBe("ERROR");
    expect(honest.detail).toContain("browser-agent");
    // Diagnostic only: coverage loss is never charged to the product's score.
    expect(honest.scoreEligible).toBe(false);
    expect(honest.completenessEligible).toBe(true);
  });
});

describe("browser agent reports whether PageSpeed actually ran", () => {
  it("flags a non-200 from PageSpeed as a collector failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota exceeded", { status: 429 })));
    const result = await runBrowserAgent("https://example.test");
    expect(result.checks).toEqual([]);
    expect(result.collectorError).toContain("429");
  });

  it("flags a network error as a collector failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ETIMEDOUT"); }));
    const result = await runBrowserAgent("https://example.test");
    expect(result.collectorError).toContain("ETIMEDOUT");
  });

  it("flags a 200 carrying no Lighthouse result as a collector failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
    const result = await runBrowserAgent("https://example.test");
    expect(result.collectorError).toContain("no Lighthouse result");
  });

  it("does not flag a run that genuinely succeeded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      lighthouseResult: {
        categories: {
          performance: { score: 0.9 },
          accessibility: { score: 0.8 },
          "best-practices": { score: 0.95 },
          seo: { score: 0.85 },
        },
        audits: {},
      },
    })));
    const result = await runBrowserAgent("https://example.test");
    expect(result.collectorError).toBeUndefined();
    expect(result.insights).not.toBeNull();
  });
});

describe("deploy agent separates 'not on Vercel' from 'could not tell'", () => {
  it("flags an unreachable host as a collector failure", async () => {
    guard.fetchScannableUrl.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await runDeployAgent("https://example.test");
    expect(result.collectorError).toContain("ECONNREFUSED");
  });

  it("does not flag a reachable host that simply is not on Vercel", async () => {
    guard.fetchScannableUrl.mockResolvedValue(new Response("", { status: 200, headers: { server: "nginx" } }));
    const result = await runDeployAgent("https://example.test");
    expect(result.collectorError).toBeUndefined();
    expect(result.insights.platform).not.toBe("vercel");
  });
});

describe("a lost extended-checks run leaves a record behind", () => {
  // runExtendedChecks emits its own completeness row from inside itself, so a throw
  // takes ~300 checks AND the only evidence they were expected. The catch block in
  // runUrlChecks has to emit that row on its behalf.
  //
  // Asserted against the catch block's body specifically, not the whole file — a
  // bare "does the filename appear" search is satisfied by the import line.
  const source = readFileSync("src/server/pulse-scan.ts", "utf8");
  const catchBlock = source.slice(
    source.indexOf("const extended = await runExtendedChecks("),
    source.indexOf("} else {", source.indexOf("const extended = await runExtendedChecks(")),
  );

  it("finds the extended-checks call wrapped in a catch that is not empty", () => {
    expect(catchBlock).toContain("catch (error)");
  });

  it("emits the completeness row the failed collector could not emit for itself", () => {
    expect(catchBlock).toContain("collectorCompletenessCheck(");
    expect(catchBlock).toContain("scan_extended_collector_completeness");
    expect(catchBlock).toContain('outcome: "ERROR"');
  });
});
