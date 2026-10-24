import { describe, expect, it } from "vitest";
import { findingMeaning, summariseScan, type PlainCheck } from "@/lib/plain-report";

const c = (checkKey: string, label: string, category: string, status = "FAIL"): PlainCheck => ({ checkKey, label, category, status, trustBucket: "CONFIRMED", confidence: "HIGH" });

// The real top findings of the Fellas Android scan (Oct 2026).
const FELLAS: PlainCheck[] = [
  c("flutter_env_baseurl", "API environment is not selected by editing source", "Security"),
  c("flutter_cleartext_traffic", "Cleartext HTTP disabled on Android", "Security"),
  c("flutter_test_coverage", "Test suite proportionate to the codebase", "Code Quality"),
  c("code_health_import_cycles", "No import cycles between files", "Code Quality"),
  c("has_license", "License file", "Code Quality", "WARN"),
  c("x_unchecked", "Something Pulse could not see", "Security", "INCONCLUSIVE"),
];

describe("summariseScan on a real client scan", () => {
  const s = summariseScan(FELLAS);

  it("leads with the staging server and the unencrypted traffic, in plain words", () => {
    expect(s.findings[0].text).toMatch(/pointed at a test setup/);
    expect(s.findings.some((f) => /not encrypted/.test(f.text))).toBe(true);
    expect(s.findings.some((f) => /automated tests/.test(f.text))).toBe(true);
  });

  it("leaves code health to its own summary rather than saying it twice", () => {
    expect(s.findings.some((f) => f.label.includes("import cycles"))).toBe(false);
  });

  it("says what it could not check instead of implying it is fine", () => {
    expect(s.unchecked).toBe(1);
  });

  it("speaks plainly: no check jargon in the sentences", () => {
    for (const f of s.findings) expect(f.text).not.toMatch(/cleartext|base ?url|ATS|RLS|CSP|HSTS|cyclomatic/i);
  });
});

describe("headline and meanings", () => {
  it("never calls a clean scan anything but ready, and never invents urgency", () => {
    expect(summariseScan([c("ssl_valid", "Valid TLS certificate", "Security", "PASS")]).headline).toMatch(/^Ready/);
    expect(summariseScan([c("seo_meta_description", "Meta description", "SEO", "WARN")]).tone).not.toBe("bad");
  });

  it("does not read a credential-logging check as 'no logging'", () => {
    expect(findingMeaning({ checkKey: "ios_release_logging", label: "x" })).toMatch(/written to logs/);
  });

  it("says the same problem once, however many checks found it", () => {
    const s = summariseScan([c("ssl_valid", "TLS", "Security"), c("hsts_enabled", "HSTS", "Security"), c("https_redirect", "HTTPS", "Security")]);
    expect(s.findings).toHaveLength(1);
  });

  it("explains out-of-date platform software in plain words", () => {
    expect(findingMeaning({ checkKey: "software_updates", label: "Platform up to date" })).toMatch(/out-of-date software/);
  });

  it("falls back to the check's own label when it has no plain meaning yet", () => {
    expect(findingMeaning({ checkKey: "weird_new_check", label: "Widgets are frobbed." })).toBe("Not yet in place: Widgets are frobbed.");
  });
});
