import { describe, it, expect } from "vitest";
import { buildAgentVerdict } from "../pulse-agent";
import { annotateTrust } from "../pulse-checks/confidence";
import { CATEGORIES } from "../pulse-checks/categories";
import type { PulseScanCheckInput } from "@/types/pulse";

// The compact verdict is what the MCP server and any HTTP agent read. Two defects
// were found in it while reviewing a real native-iOS scan:
//   1. WARN findings were dropped entirely, so a scan whose problems were all
//      warnings reported "0 confirmed issues" and an empty fix list.
//   2. `counts.confirmed` is a TRUST BUCKET population (it includes passes), sitting
//      next to a summary saying "N confirmed issues" — two near-identically named
//      numbers meaning different things.

const check = (over: Partial<PulseScanCheckInput> & Pick<PulseScanCheckInput, "checkKey" | "status">) =>
  annotateTrust({
    category: CATEGORIES.CODE_QUALITY,
    label: over.checkKey,
    detail: "",
    ...over,
  } as PulseScanCheckInput);

const verdict = (checks: PulseScanCheckInput[]) =>
  buildAgentVerdict({
    url: "https://github.com/acme/app",
    status: "COMPLETED",
    healthScore: 50,
    techStack: ["iOS", "Swift"],
    checks,
  });

describe("buildAgentVerdict", () => {
  it("surfaces WARN findings instead of dropping them", () => {
    const v = verdict([
      check({ checkKey: "has_readme", status: "FAIL" }),
      check({ checkKey: "ios_low_data_mode", status: "WARN", detail: "No constrained-network handling." }),
      check({ checkKey: "ios_url_cache", status: "WARN", detail: "No URLCache configured." }),
    ]);

    expect(v.warnings.map((w) => w.checkKey)).toEqual(
      expect.arrayContaining(["ios_low_data_mode", "ios_url_cache"]),
    );
    expect(v.counts.warnings).toBe(2);
  });

  it("reports failure and warning counts separately from the trust buckets", () => {
    const v = verdict([
      check({ checkKey: "has_readme", status: "FAIL" }),
      check({ checkKey: "ssl_valid", status: "PASS" }),
      check({ checkKey: "ios_url_cache", status: "WARN" }),
    ]);

    // `failures` is the number the summary quotes; `confirmed` is a bucket population
    // that also contains passes, and the two must not be conflated.
    expect(v.counts.failures).toBe(v.confirmedIssues.length);
    expect(v.summary).toContain("1 confirmed issue");
    expect(v.summary).toContain("1 warning");
  });

  it("recommends warnings when there are no outright failures", () => {
    // Previously this returned topFixes: [] and read as a clean bill of health.
    const v = verdict([
      check({ checkKey: "ios_low_data_mode", status: "WARN" }),
      check({ checkKey: "ios_image_cache", status: "WARN" }),
    ]);
    expect(v.confirmedIssues).toEqual([]);
    expect(v.topFixes.length).toBeGreaterThan(0);
  });

  it("puts failures ahead of warnings in the fix list", () => {
    const v = verdict([
      check({ checkKey: "ios_low_data_mode", status: "WARN", label: "Low Data Mode" }),
      check({ checkKey: "ios_token_storage", status: "FAIL", label: "Auth tokens in Keychain" }),
    ]);
    expect(v.topFixes[0]).toBe("Auth tokens in Keychain");
  });

  it("excludes unprovable findings from the warning list", () => {
    // An INCONCLUSIVE result is not a finding an agent should act on.
    const v = verdict([
      check({
        checkKey: "ios_dynamic_type",
        status: "WARN",
        confidence: "LOW",
        detail: "No Dynamic Type found. (Partial sample, so inconclusive.)",
      }),
    ]);
    expect(v.warnings).toEqual([]);
  });
});

describe("annotateTrust", () => {
  it("honours a confidence a module declared for itself", () => {
    // ios-app.ts measures its own source coverage, which a checkKey-keyed table
    // cannot express — a declared confidence must survive the central annotation.
    const annotated = annotateTrust({
      category: CATEGORIES.ACCESSIBILITY,
      checkKey: "ios_dynamic_type",
      label: "Dynamic Type supported",
      status: "FAIL",
      confidence: "LOW",
      confidenceReason: "Read 2 of 100 Swift files.",
    });
    expect(annotated.confidence).toBe("LOW");
    expect(annotated.confidenceReason).toBe("Read 2 of 100 Swift files.");
    expect(annotated.trustBucket).toBe("INCONCLUSIVE");
  });

  it("still derives confidence when a module declares none", () => {
    const annotated = annotateTrust({
      category: CATEGORIES.SECURITY,
      checkKey: "ios_token_storage",
      label: "Auth tokens stored in the Keychain",
      status: "FAIL",
    });
    // Parsed from fetched source, so this is a directly-observed finding.
    expect(annotated.confidence).toBe("HIGH");
    expect(annotated.trustBucket).toBe("CONFIRMED");
  });
});
