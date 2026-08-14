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

// ── Priority ordering (July 2026) ────────────────────────────────────────────
// Third defect from the same real iOS scan: both lists were in SCAN order, so
// topFixes recommended "README.md" and ".gitignore" above a finding that the app
// logs plaintext passwords and auth tokens to the device console. And because the
// lists are capped at 15, an arbitrary 16 of 31 warnings were dropped — severity
// decided nothing, file order decided everything.
describe("buildAgentVerdict ranks findings by priority", () => {
  it("puts a security failure above cosmetic ones, whatever the scan order", () => {
    const v = verdict([
      // Scan order deliberately puts the trivia first, as the real scan did.
      check({ checkKey: "has_readme", status: "FAIL", label: "README.md" }),
      check({ checkKey: "has_gitignore", status: "FAIL", label: ".gitignore" }),
      check({
        checkKey: "ios_sensitive_payload_logging",
        status: "FAIL",
        label: "Request/response bodies not logged in Release",
        category: CATEGORIES.SECURITY,
        confidence: "HIGH",
      }),
    ]);

    expect(v.topFixes[0]).toBe("Request/response bodies not logged in Release");
    expect(v.confirmedIssues[0].checkKey).toBe("ios_sensitive_payload_logging");
  });

  it("keeps the most serious warnings when the list is truncated", () => {
    // 20 cosmetic warnings scanned BEFORE one security warning: with a cap of 15 and
    // no ranking, the security finding fell off the end entirely.
    const noise = Array.from({ length: 20 }, (_, i) =>
      check({ checkKey: `has_editorconfig_${i}`, status: "WARN", label: `Trivia ${i}` }),
    );
    const v = verdict([
      ...noise,
      check({
        checkKey: "ios_debug_guards",
        status: "WARN",
        label: "Debug-only code is compile-gated",
        category: CATEGORIES.SECURITY,
        confidence: "HIGH",
      }),
    ]);

    expect(v.warnings.map((w) => w.checkKey)).toContain("ios_debug_guards");
    expect(v.counts.warnings, "the count still reports the true total").toBe(21);
  });

  it("does not let a damped cosmetic finding reach the top of the fix list", () => {
    const v = verdict([
      check({ checkKey: "flutter_dev_endpoints", status: "WARN", label: "Dev endpoints in source" }),
      check({
        checkKey: "flutter_cleartext_traffic",
        status: "FAIL",
        label: "Cleartext HTTP disabled on Android",
        category: CATEGORIES.SECURITY,
        confidence: "HIGH",
      }),
    ]);
    expect(v.topFixes[0]).toBe("Cleartext HTTP disabled on Android");
  });
});

// ── The release decision travels with the verdict ────────────────────────────
//
// An agent or a CI script reads this object and decides whether to ship. The
// rule these tests defend is that it can never read a pass it did not earn:
// every verdict carries a decision, and a scan that did not finish is never one
// of the two decisions that mean "we looked and were satisfied".

describe("buildAgentVerdict carries a release decision", () => {
  it("returns a decision on an ordinary completed scan", () => {
    const v = verdict([check({ checkKey: "has_readme", status: "PASS" })]);
    expect(v.gate.decision).toBeDefined();
    expect(v.gate.policy.id, "names the policy it judged against").toBe("launch-ready");
    expect(v.gate.policy.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("never reports READY or CONDITIONAL for a FAILED scan", () => {
    const v = buildAgentVerdict({
      url: "https://example.com",
      status: "FAILED",
      healthScore: 0,
      techStack: [],
      checks: [],
      failureReason: "DNS lookup failed.",
    });

    expect(v.gate.decision).toBe("INCONCLUSIVE");
    expect(
      v.gate.unverified.map((r) => r.summary).join(" "),
      "the actual failure reaches the reader rather than a generic coverage line",
    ).toContain("DNS lookup failed.");
    expect(v.summary).toContain("DNS lookup failed.");
  });

  it("still reports BLOCKED when a failed scan already proved a blocker", () => {
    // A partial scan that confirmed an exposed .git directory has KNOWLEDGE.
    // Downgrading that to INCONCLUSIVE would bury the one thing it is sure of.
    const v = buildAgentVerdict({
      url: "https://example.com",
      status: "FAILED",
      healthScore: 10,
      techStack: [],
      checks: [
        check({
          checkKey: "no_exposed_git",
          status: "FAIL",
          category: CATEGORIES.SECURITY,
          confidence: "HIGH",
          severity: "CRITICAL",
        }),
      ],
      failureReason: "Timed out after the security probes.",
    });

    expect(v.gate.decision).toBe("BLOCKED");
    expect(v.gate.blocking.flatMap((r) => r.checkKeys)).toContain("no_exposed_git");
  });

  it("judges against the requested policy", () => {
    const v = buildAgentVerdict({
      url: "https://example.com",
      status: "COMPLETED",
      healthScore: 90,
      techStack: [],
      checks: [check({ checkKey: "has_readme", status: "PASS" })],
      gatePolicyId: "handover",
    });
    expect(v.gate.policy.id).toBe("handover");
  });
});
