import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  decideRelevance,
  emptyRelevanceSummary,
  recordDecision,
  relevanceRuleFor,
  SCAN_NOTE_KEYS,
  type RelevanceRule,
  type ScanContext,
} from "@/server/pulse-checks/check-relevance";
import { CHECK_RELEVANCE, WITHHELD } from "@/server/pulse-checks/check-relevance-data";
import { classifyGenericRepo } from "@/server/pulse-checks/repo-kind";
import { featuresFromPage, featuresFromRepo } from "@/server/pulse-checks/product-features";

/**
 * "The checks need to be contextual and only show IF related to the specific platform;
 * we don't show irrelevant data or results if not needed."
 *
 * Measured before the gate: example.com reported 857 findings as a web app (20 payments,
 * 30 SaaS, 21 API-quality checks for features it lacks, 368 "verify manually" catalogue
 * items); an iOS repo returned the same 458 checks whether the dropdown said iOS, web or
 * CLI; a website scanned as an iOS product returned one check.
 */

const ALL = ["WEB_APP", "SAAS", "MARKETING_SITE", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "DESKTOP_APP", "CHROME_EXTENSION", "API_BACKEND", "CLI_TOOL", "OTHER"] as const;
const WEB = ["WEB_APP", "SAAS", "MARKETING_SITE", "OTHER"] as const;

const ctx = (over: Partial<ScanContext>): ScanContext => ({
  platform: "WEB_APP", target: { kind: "website" }, features: new Set(), ...over,
});
const check = (checkKey: string, status: "PASS" | "WARN" | "FAIL" | "SKIPPED" | "NOT_APPLICABLE" | "INCONCLUSIVE" = "WARN") => ({ checkKey, status });

const PRICING: RelevanceRule = { surface: "WEB_PAGE", platforms: ["WEB_APP", "SAAS", "OTHER"], presence: false, feature: "payments" };
const PRIVACY: RelevanceRule = { surface: "WEB_PAGE", platforms: [...WEB], presence: true, feature: null };
const IOS_KEYCHAIN: RelevanceRule = { surface: "REPO_IOS", platforms: ["IOS_APP", "CROSS_PLATFORM_MOBILE"], presence: false, feature: null };
const README: RelevanceRule = { surface: "REPO_ANY", platforms: [...ALL], presence: false, feature: null };
const CSP: RelevanceRule = { surface: "WEB_HTTP", platforms: [...WEB, "API_BACKEND"], presence: true, feature: null };

describe("the gate shows a check only when it is about this product", () => {
  it("hides a feature check when the product does not have the feature", () => {
    expect(decideRelevance(check("pricing_page"), PRICING, ctx({}))).toEqual({ show: false, reason: "feature_absent", feature: "payments" });
    expect(decideRelevance(check("pricing_page"), PRICING, ctx({ features: new Set(["payments"]) }))).toEqual({ show: true });
  });

  it("hides a website check on a repo, and a repo check on a website", () => {
    expect(decideRelevance(check("privacy_policy"), PRIVACY, ctx({ target: { kind: "repo", shape: "web" } })).reason).toBe("not_this_artefact");
    expect(decideRelevance(check("has_readme"), README, ctx({})).reason).toBe("not_this_artefact");
  });

  it("hides another platform's source checks on a repo of a different shape", () => {
    expect(decideRelevance(check("ios_keychain_tokens"), IOS_KEYCHAIN, ctx({ platform: "ANDROID_APP", target: { kind: "repo", shape: "android" } })).reason).toBe("not_this_artefact");
    expect(decideRelevance(check("ios_keychain_tokens"), IOS_KEYCHAIN, ctx({ platform: "IOS_APP", target: { kind: "repo", shape: "ios" } })).show).toBe(true);
  });

  it("an iOS app's WEBSITE is judged by presence: privacy policy yes, a billing page no", () => {
    const site = ctx({ platform: "IOS_APP", target: { kind: "website" }, features: new Set(["payments"]) });
    expect(decideRelevance(check("privacy_policy"), PRIVACY, site).show).toBe(true);
    expect(decideRelevance(check("csp_header"), CSP, site).show).toBe(true);
    expect(decideRelevance(check("pricing_page"), PRICING, site).reason).toBe("not_this_platform");
  });

  it("an API keeps transport checks and drops page checks", () => {
    const api = ctx({ platform: "API_BACKEND", target: { kind: "api" } });
    expect(decideRelevance(check("csp_header"), CSP, api).show).toBe(true);
    expect(decideRelevance(check("privacy_policy"), PRIVACY, api).reason).toBe("not_this_artefact");
  });

  it("a catalogue control is shown only when Pulse has a verdict from evidence", () => {
    const rule = relevanceRuleFor("standards_security_core_01");
    expect(rule?.surface).toBe("STANDARDS_CATALOG");
    expect(decideRelevance(check("standards_security_core_01", "WARN"), rule, ctx({})).reason).toBe("needs_evidence");
    expect(decideRelevance(check("standards_security_core_01", "PASS"), rule, ctx({})).show).toBe(true);
  });

  it("a check that reports itself not applicable is hidden, even with no rule", () => {
    expect(decideRelevance(check("anything", "SKIPPED"), null, ctx({})).reason).toBe("not_applicable");
    expect(decideRelevance(check("anything", "NOT_APPLICABLE"), PRIVACY, ctx({})).reason).toBe("not_applicable");
  });

  it("an honest 'could not establish' stays visible when the check is relevant", () => {
    expect(decideRelevance(check("privacy_policy", "INCONCLUSIVE"), PRIVACY, ctx({})).show).toBe(true);
  });

  it("a placeholder the audit tagged META is still hidden when it reports SKIPPED", () => {
    // Ten always-SKIPPED placeholders were tagged META and rode a blanket META exemption
    // onto every website report — caught by the measured matrix, not by a reading.
    const meta: RelevanceRule = { surface: "META", platforms: [], presence: false, feature: null };
    expect(decideRelevance(check("multi_region_signals", "SKIPPED"), meta, ctx({})).show).toBe(false);
  });

  it("the scan's own notes are always shown, SKIPPED or not", () => {
    for (const key of SCAN_NOTE_KEYS) expect(decideRelevance(check(key, "SKIPPED"), null, ctx({})).show, key).toBe(true);
  });

  it("a key with no rule is SHOWN — a missing entry must never silently delete a finding", () => {
    expect(decideRelevance(check("brand_new_check", "FAIL"), null, ctx({})).show).toBe(true);
  });

  it("counts what it hid, by reason and by feature", () => {
    const summary = emptyRelevanceSummary();
    recordDecision(summary, { show: true });
    recordDecision(summary, { show: false, reason: "feature_absent", feature: "payments" });
    recordDecision(summary, { show: false, reason: "feature_absent", feature: "payments" });
    recordDecision(summary, { show: false, reason: "needs_evidence" });
    expect(summary).toEqual({ shown: 1, hidden: 3, byReason: { feature_absent: 2, needs_evidence: 1 }, byFeature: { payments: 2 } });
  });
});

describe("every catalogued check has a relevance rule", () => {
  // The CATALOGUE, not the registry's literal rows: 156 checks are generated by
  // service-depth.ts / operational-depth.ts and never appear as a literal row. The first
  // version of this test read only literal rows, and every one of those 156 went
  // unclassified — so they defaulted to shown, on every repo, until a measured scan
  // caught them.
  const catalogue = JSON.parse(readFileSync("src/server/pulse-checks/catalogue-baseline.json", "utf8")) as { keys: string[] };
  const keys = catalogue.keys;

  it("the catalogue parses", () => {
    expect(keys.length).toBeGreaterThan(1600);
  });

  it("no catalogued key is missing from CHECK_RELEVANCE", () => {
    const missing = keys.filter((key) => !CHECK_RELEVANCE[key] && !key.startsWith("standards_"));
    expect(missing, `add a rule for each of these to check-relevance-data.ts`).toEqual([]);
  });

  it("a check shown on no platform is on the WITHHELD list, with its reason", () => {
    // A rule with no platforms hides a check everywhere, so it must be a recorded decision
    // (WITHHELD names why — e.g. a repo practice guessed from a website's HTML), never an
    // accident in the data file.
    const empty = Object.entries(CHECK_RELEVANCE).filter(([, rule]) => rule.surface !== "META" && rule.platforms.length === 0).map(([key]) => key);
    expect(empty.filter((key) => !WITHHELD[key])).toEqual([]);
  });

  it("every withheld check names a reason, and a withheld check is hidden even when it passes", () => {
    for (const [key, reason] of Object.entries(WITHHELD)) expect(reason.length, key).toBeGreaterThan(20);
    const key = Object.keys(WITHHELD)[0];
    expect(decideRelevance(check(key, "PASS"), CHECK_RELEVANCE[key] ?? null, ctx({})).reason).toBe("withheld");
  });
});

describe("a repository is classified by what it is, not by the dropdown", () => {
  const files = (pkg: object) => new Map([["package.json", JSON.stringify(pkg)]]);
  it("a Next.js repo is a web app", () => {
    expect(classifyGenericRepo(["package.json", "app/page.tsx"], files({ dependencies: { next: "15", react: "19" } }))).toBe("web");
  });
  it("an Express repo is a backend", () => {
    expect(classifyGenericRepo(["package.json", "src/index.js"], files({ dependencies: { express: "4" } }))).toBe("backend");
  });
  it("Django is recognised from its entry file", () => {
    expect(classifyGenericRepo(["manage.py", "app/settings.py"], new Map())).toBe("backend");
  });
  it("a bare Go or Rust repo is NOT assumed to be a server", () => {
    expect(classifyGenericRepo(["go.mod", "main.go"], new Map())).toBe("none");
    expect(classifyGenericRepo(["Cargo.toml", "src/main.rs"], new Map())).toBe("none");
  });
});

describe("features are detected from use, not mention", () => {
  it("a page that MENTIONS Stripe does not take payments", () => {
    expect(featuresFromPage("<p>We compared Stripe and Paddle in this blog post.</p>").has("payments")).toBe(false);
  });
  it("a page that LOADS Stripe.js does", () => {
    expect(featuresFromPage('<script src="https://js.stripe.com/v3/"></script>').has("payments")).toBe(true);
  });
  it("an apple-touch-icon is not an app, and a bare page has no accounts", () => {
    const features = featuresFromPage('<link rel="apple-touch-icon" href="/icon.png"><h1>Example Domain</h1>');
    expect(features.has("accounts")).toBe(false);
    expect(features.has("payments")).toBe(false);
  });
  it("a sign-in link means accounts; accounts plus a dashboard means SaaS", () => {
    const features = featuresFromPage('<a href="/login">Log in</a><a href="/dashboard">Dashboard</a>');
    expect(features.has("accounts")).toBe(true);
    expect(features.has("saas_multitenant")).toBe(true);
  });
  it("repo features come from installed packages", () => {
    const features = featuresFromRepo(["package.json"], new Map([["package.json", JSON.stringify({ dependencies: { stripe: "1", "next-auth": "4", openai: "4" } })]]));
    expect([...features].sort()).toEqual(["accounts", "ai_features", "payments", "saas_multitenant"]);
  });
});
