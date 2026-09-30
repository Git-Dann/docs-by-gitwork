import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fetchAppStoreDescription, parseAppStoreTrack } from "@/server/pulse-scan";
import { detectUrlTargetKind } from "@/server/pulse-checks/scan-execution-plan";
import { evaluateReleaseGate, DEFAULT_GATE_POLICY } from "@/server/pulse-checks/release-decision";
import { collectorCoverage } from "@/server/pulse-checks/collector-health";
import type { PulseScanCheckInput } from "@/types/pulse";

/**
 * A scan of https://apps.apple.com/gb/app/beyond-nutrition-uk/id1632891361 returned
 * "98/100 · 0 confirmed issues · READY · coverage 100%" on 2026-09-30, having run 12
 * store-listing checks out of a 1,646-check registry and none of the launch-blocking
 * controls. Both halves of that are pinned here.
 */

const TRACK = "https://apps.apple.com/gb/app/beyond-nutrition-uk/id1632891361";

describe("the description check reads the developer's description, not the page's", () => {
  // Apple's og:description, captured verbatim from the live page. It is a social card
  // ABOUT THE PAGE — note it offers "more games like" for a fitness app.
  const APPLE_OG =
    "Download Beyond Nutrition UK by BEYOND NUTRITION UK LTD on the App Store. "
    + "See screenshots, ratings and reviews, user tips and more games like Beyond Nutrition…";

  it("the tag it used to read is not the app's description", () => {
    expect(APPLE_OG.length).toBe(159);
    // The developer's real description is 1,182 characters. The check's own bands are
    // >200 PASS, >50 WARN — so reading the tag produced WARN where the real field PASSes.
    expect(APPLE_OG.length).toBeGreaterThan(50);
    expect(APPLE_OG.length).toBeLessThan(200);
    expect(1182).toBeGreaterThan(200);
  });

  it("parses the track id and the storefront out of a listing URL", () => {
    // Pure and network-free, which is the point: the earlier version of this test
    // called the fetcher and passed whether or not the guard existed.
    expect(parseAppStoreTrack(TRACK)).toEqual({ id: "1632891361", country: "gb" });
    expect(parseAppStoreTrack("https://apps.apple.com/app/id284882215")).toEqual({ id: "284882215", country: "us" });
  });

  it("declines rather than guessing when the URL carries no track id", () => {
    // A guessed id queries somebody else's listing and reports it as this app's.
    for (const url of [
      "https://apps.apple.com/gb/app/no-id-here",
      "https://apps.apple.com/gb/developer/beyond-nutrition-uk-ltd",
      "https://beyondnutritionuk.com/",
      "",
    ]) expect(parseAppStoreTrack(url), url).toBeNull();
  });

  it("the shipped check never reads og:description for its verdict", () => {
    // Source-level on purpose: the store path needs a live listing to drive, so a
    // behavioural test here would pass while the bug was live. This grep cannot.
    const src = readFileSync("src/server/pulse-scan.ts", "utf8");
    const block = src.slice(src.indexOf("// Description quality"), src.indexOf("// Screenshots"));
    expect(block).toContain("fetchAppStoreDescription");
    expect(block).toContain('status: "SKIPPED"');
    // ⚠️ Assert it no longer READS the tag, not that the word is absent. Both the
    // comment and the SKIPPED branch's own copy name og:description on purpose — to
    // tell the reader why their description was not judged — so a bare text match
    // fails on the explanation rather than on the defect. The mechanism was
    // `html.match(/…og:description…/)`; that is what must be gone.
    const code = block.replace(/\/\/[^\n]*/g, "");
    expect(code).not.toContain("html.match");
    expect(code).not.toContain("ogDesc");
    expect(code).not.toMatch(/match\([^)]*og:description/);
  });
});

describe("a store-listing scan must not report the URL collector as complete", () => {
  it("recognises both store fronts as store targets", () => {
    expect(detectUrlTargetKind(TRACK)).toBe("app_store");
    expect(detectUrlTargetKind("https://play.google.com/store/apps/details?id=com.x.y")).toBe("play_store");
    expect(detectUrlTargetKind("https://beyondnutritionuk.com/")).toBe("web");
  });

  it("the shipped store branch records url-checks as NOT_APPLICABLE, not COMPLETED", () => {
    // Source-level for the same reason: runLiteScan needs the network. The earlier
    // version of this test asserted the GATE's behaviour on a hand-built collectors
    // object, so restoring the bug in run-lite-scan.ts changed nothing it looked at.
    const src = readFileSync("src/server/pulse-lite/run-lite-scan.ts", "utf8");
    const guard = /if \(urlTargetKind === "app_store" \|\| urlTargetKind === "play_store"\) \{\s*collectorExecutions\.push\(\{\s*name: "url-checks",\s*outcome: "NOT_APPLICABLE",/;
    expect(src).toMatch(guard);
    // …and the unconditional COMPLETED must only remain on the else branch.
    const after = src.slice(src.indexOf("const urlTargetKind"));
    const completedIdx = after.indexOf('collectorCompleted("url-checks")');
    expect(completedIdx).toBeGreaterThan(-1);
    expect(after.slice(0, completedIdx)).toContain("} else {");
  });

  it("an unavailable url-checks collector is surfaced with a reason", () => {
    const coverage = collectorCoverage([
      { name: "url-checks", outcome: "NOT_APPLICABLE", reason: "The scanned URL is an App Store listing…" },
      { name: "deploy-agent", outcome: "NOT_APPLICABLE" },
    ]);
    expect(coverage.completed).toBe(0);
    expect(coverage.unavailable.map((u) => u.name)).toContain("url-checks");
  });
});

describe("the gate refuses to clear a scan that ran none of its blocking controls", () => {
  const storeChecks: PulseScanCheckInput[] = [
    { category: "Store Listing", checkKey: "store_page_live", label: "Listing is live", status: "PASS" },
    { category: "Store Listing", checkKey: "store_app_title", label: "App name", status: "PASS" },
  ] as PulseScanCheckInput[];

  it("READY is impossible once url-checks is reported unavailable", () => {
    const gate = evaluateReleaseGate(
      storeChecks,
      {
        finalScore: 98,
        completeness: 100,
        collectors: collectorCoverage([
          { name: "url-checks", outcome: "NOT_APPLICABLE", reason: "App Store listing — only store checks ran." },
        ]),
      },
      DEFAULT_GATE_POLICY,
    );
    expect(gate.decision).toBe("INCONCLUSIVE");
    expect(gate.unverified.map((r) => r.code)).toContain("REQUIRED_COLLECTOR_UNAVAILABLE");
  });

  it("and that is the ONLY thing standing between this scan and READY", () => {
    // The regression: with url-checks falsely COMPLETED, the identical scan clears.
    const gate = evaluateReleaseGate(
      storeChecks,
      {
        finalScore: 98,
        completeness: 100,
        collectors: collectorCoverage([{ name: "url-checks", outcome: "COMPLETED" }]),
      },
      DEFAULT_GATE_POLICY,
    );
    expect(gate.decision).toBe("READY");
    expect(gate.unverified).toEqual([]);
  });
});

describe("the framework is never inferred from a listing page", () => {
  const src = readFileSync("src/server/pulse-scan.ts", "utf8");
  const block = src.slice(src.indexOf("const techStack: string[] = [];"), src.indexOf("return {", src.indexOf("const techStack: string[] = [];")));

  it("asserts no framework the page did not name", () => {
    // A listing page never states its implementation framework. The old code read
    // "no 'flutter' and no 'react native' in Apple's marketing HTML" as proof of
    // Swift/SwiftUI — a positive claim about someone else's codebase, built from the
    // absence of two strings on a page they do not control.
    const code = block.replace(/\/\/[^\n]*/g, "");
    expect(code).not.toContain("Swift / SwiftUI");
    expect(code).not.toContain("Kotlin");
  });

  it("still keeps a framework the page DOES name", () => {
    // Some listings do name their stack in the description; that is evidence.
    expect(block).toContain('lower.includes("flutter")');
    expect(block).toContain('lower.includes("react native")');
  });

  it("still reports the platform, which the storefront really does establish", () => {
    expect(block).toContain('isAppStore ? "iOS" : "Android"');
  });
});
