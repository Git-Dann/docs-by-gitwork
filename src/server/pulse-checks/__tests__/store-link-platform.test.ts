import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeScanSubject,
  detectStoreTarget,
  isPlaceholderStoreName,
  provisionalStoreProjectName,
  resolveScanPlatform,
  storePlatformForUrl,
} from "@/lib/pulse-store-url";
import {
  buildStoreListingChecks,
  parseAppStoreListing,
  parsePlayStoreListing,
  storeAppName,
} from "@/server/pulse-checks/store-listing";
import { parseAppStoreTrack } from "@/server/pulse-scan";
import { evaluateReleaseGate, resolveGatePolicy } from "@/server/pulse-checks/release-decision";
import { collectorCoverage, type CollectorExecution } from "@/server/pulse-checks/collector-health";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import { annotateTrust } from "@/server/pulse-checks/confidence";
import { buildPlatformCoverageCheck } from "@/server/pulse-checks/platform-coverage";
import { buildAgentVerdict } from "@/server/pulse-agent";
import type { PulseScanCheckInput } from "@/types/pulse";

/**
 * "When I give you an iOS link, we report it as an iOS link; Android, Android."
 *
 * Before this, an App Store link was scanned as the form's default "Web app", stored
 * as WEB_APP under the name `apps.apple.com`, judged by the WEBSITE launch policy —
 * which can only answer "INCONCLUSIVE, scan the product's own URL" for a listing —
 * and scored on keyword checks that pass for every app in the store.
 *
 * The fixtures are real listings for the same app (Beyond Nutrition UK), trimmed but
 * structurally intact, captured 2026-09-30. Expected values were read off the live
 * pages by hand, not from this code.
 */

const IOS_URL = "https://apps.apple.com/gb/app/beyond-nutrition-uk/id1632891361";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.trainerize.beyondnutritionuk&hl=en_GB";
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const APPLE_HTML = fixture("app-store-beyond-nutrition.html");
const PLAY_HTML = fixture("play-store-beyond-nutrition.html");

const byKey = (checks: PulseScanCheckInput[]) => new Map(checks.map((c) => [c.checkKey, c]));

// ── 1. What a link IS ────────────────────────────────────────────────────────

describe("an App Store link is an iOS app, a Google Play link an Android app", () => {
  it("classifies both stores by host", () => {
    expect(detectStoreTarget(IOS_URL)).toBe("app_store");
    expect(detectStoreTarget("https://itunes.apple.com/gb/app/id1632891361")).toBe("app_store");
    expect(detectStoreTarget(ANDROID_URL)).toBe("play_store");
    expect(detectStoreTarget("apps.apple.com/gb/app/x/id1632891361")).toBe("app_store");
    expect(storePlatformForUrl(IOS_URL)).toBe("IOS_APP");
    expect(storePlatformForUrl(ANDROID_URL)).toBe("ANDROID_APP");
  });

  it("is not fooled by a store host appearing anywhere else in a URL", () => {
    // The old test was `url.includes("apps.apple.com")`, which sent this WEBSITE down
    // the store path and skipped every website check on it.
    expect(detectStoreTarget("https://example.com/?next=apps.apple.com")).toBeNull();
    expect(detectStoreTarget("https://apps.apple.com.evil.example/app/id1")).toBeNull();
    expect(detectStoreTarget("https://example.com/play.google.com/store/apps/details?id=x")).toBeNull();
    // Google Play's own non-app pages are not app listings.
    expect(detectStoreTarget("https://play.google.com/store/books/details?id=x")).toBeNull();
    expect(storePlatformForUrl("https://beyondnutritionuk.com/")).toBeNull();
  });

  it("the link overrides a picker left on its default; a website keeps the user's choice", () => {
    expect(resolveScanPlatform(IOS_URL, "WEB_APP")).toBe("IOS_APP");
    expect(resolveScanPlatform(ANDROID_URL, "WEB_APP")).toBe("ANDROID_APP");
    expect(resolveScanPlatform(IOS_URL, undefined)).toBe("IOS_APP");
    expect(resolveScanPlatform("https://example.com", "SAAS")).toBe("SAAS");
    expect(resolveScanPlatform("https://example.com", undefined)).toBeUndefined();
  });

  it("describes the subject as the app, everywhere a report names it", () => {
    expect(describeScanSubject(IOS_URL, "WEB_APP")).toBe("iOS app · App Store listing");
    expect(describeScanSubject(ANDROID_URL, null)).toBe("Android app · Google Play listing");
    expect(describeScanSubject("https://example.com", "SAAS")).toBe("SaaS");
  });
});

describe("a store scan is named after the app, not after apps.apple.com", () => {
  it("reads a provisional name from the link", () => {
    expect(provisionalStoreProjectName(IOS_URL)).toBe("Beyond Nutrition Uk");
    expect(provisionalStoreProjectName(ANDROID_URL)).toBe("Beyondnutritionuk");
    expect(provisionalStoreProjectName("https://example.com")).toBeNull();
  });

  it("treats only names Pulse invented as replaceable", () => {
    expect(isPlaceholderStoreName("apps.apple.com", IOS_URL)).toBe(true);
    expect(isPlaceholderStoreName("Beyond Nutrition Uk", IOS_URL)).toBe(true);
    expect(isPlaceholderStoreName("play.google.com", ANDROID_URL)).toBe(true);
    expect(isPlaceholderStoreName("", IOS_URL)).toBe(true);
    // A name a person typed is theirs.
    expect(isPlaceholderStoreName("BN sales call", IOS_URL)).toBe(false);
    // …and so is the app's REAL name, even though it differs from the placeholder only by case.
    expect(isPlaceholderStoreName("Beyond Nutrition UK", IOS_URL)).toBe(false);
    // And a website's name is never a store placeholder.
    expect(isPlaceholderStoreName("example.com", "https://example.com")).toBe(false);
  });

  it("takes the store's own name from each listing", () => {
    expect(storeAppName(APPLE_HTML, null)).toBe("Beyond Nutrition UK");
    expect(storeAppName(PLAY_HTML, null)).toBe("Beyond Nutrition UK");
  });

  it("still parses Apple's track id and storefront from the link", () => {
    expect(parseAppStoreTrack(IOS_URL)).toEqual({ id: "1632891361", country: "gb" });
    expect(parseAppStoreTrack("https://apps.apple.com/gb/app/no-id-here")).toBeNull();
  });
});

// ── 2. Reading the listing ───────────────────────────────────────────────────

describe("the App Store listing is read from Apple's own data", () => {
  const listing = parseAppStoreListing(APPLE_HTML)!;

  it("reads every field the checks judge", () => {
    expect(listing).not.toBeNull();
    expect(listing.name).toBe("Beyond Nutrition UK");
    expect(listing.developer).toBe("BEYOND NUTRITION UK LTD");
    expect(listing.rating).toEqual({ average: 5, count: 11 });
    expect(listing.screenshots).toEqual({ total: 18, byDevice: { phone: 6, pad: 6, watch: 6 } });
    expect(listing.ageRating).toBe("9+");
    expect(listing.privacyPolicyUrl).toBe("https://www.trainerize.com/privacy.aspx");
    expect(listing.privacyDeclaration.declared).toBe(true);
    expect(listing.privacyDeclaration.lines).toEqual([
      "Data Linked to You: Health & Fitness, User Content, Usage Data, Diagnostics",
    ]);
    expect(listing.description?.length).toBe(1182);
    expect(listing.hasPreviewVideo).toBe(false);
    expect(listing.hasInAppPurchases).toBe(false);
    expect(listing.copyright).toBe("© 2026 ABC Trainerize");
    expect(listing.bundleId).toBe("com.trainerize.beyondnutritionuk");
  });

  it("reads no subtitle where Apple shows the category instead", () => {
    // The page carries OTHER apps' subtitles in its "you might also like" shelf (the
    // fixture keeps three), and the app's own slot holds "Health & Fitness" — its
    // category, shown because it has no subtitle. The old check passed on " - " in
    // the page title, which Apple always ends with " - App Store".
    expect(APPLE_HTML).toContain("similarItems");
    expect(listing.genre).toBe("Health & Fitness");
    expect(listing.subtitle).toBeNull();
  });

  it("reads a real subtitle when the listing has one", () => {
    const withSubtitle = APPLE_HTML.replace(
      '"lockup": {"title": "Beyond Nutrition UK", "subtitle": "Health & Fitness"',
      '"lockup": {"title": "Beyond Nutrition UK", "subtitle": "Coach-led training"',
    );
    expect(withSubtitle).not.toBe(APPLE_HTML);
    expect(parseAppStoreListing(withSubtitle)!.subtitle).toBe("Coach-led training");
  });

  it("declines when the page carries no listing data, rather than guessing", () => {
    // Every word the old checks searched for, with none of the structure.
    const wordsOnly = "<html><body>Ratings & Reviews · Age Rating · screenshot · preview video · "
      + "Privacy Policy · Data Linked to You · subtitle · in-app purchases</body></html>";
    expect(parseAppStoreListing(wordsOnly)).toBeNull();
  });
});

describe("the Google Play listing is read from Google's own data", () => {
  const listing = parsePlayStoreListing(PLAY_HTML, ANDROID_URL)!;

  it("reads every field the checks judge", () => {
    expect(listing).not.toBeNull();
    expect(listing.name).toBe("Beyond Nutrition UK");
    // Published under the platform vendor's account, not the brand on the icon.
    expect(listing.developer).toBe("Trainerize CBA-STUDIO");
    expect(listing.rating).toBeNull();
    expect(listing.ageRating).toBe("PEGI 3");
    expect(listing.shortDescription).toBe("Fitness App");
    expect(listing.description?.length).toBe(1175);
    expect(listing.screenshots.total).toBe(18);
    expect(listing.privacyPolicyUrl).toBe("https://www.trainerize.com/privacy");
    expect(listing.privacyDeclaration.declared).toBe(true);
    expect(listing.dataDeletable).toBe(false);
    expect(listing.bundleId).toBe("com.trainerize.beyondnutritionuk");
  });

  it("declines when the page carries no listing data", () => {
    expect(parsePlayStoreListing("<html><body>Data safety · Privacy Policy · Screenshot image</body></html>", ANDROID_URL)).toBeNull();
  });
});

// ── 3. The checks ────────────────────────────────────────────────────────────

describe("the store checks report what the listing actually says", () => {
  it("iOS — the findings a reader can verify in the App Store", () => {
    const checks = byKey(buildStoreListingChecks("app_store", parseAppStoreListing(APPLE_HTML)));
    expect(checks.get("store_ratings")?.status).toBe("PASS");
    expect(checks.get("store_ratings")?.detail).toBe("Rated 5.0 from 11 ratings.");
    expect(checks.get("store_screenshots")?.detail).toBe("18 screenshots (iPhone 6 · iPad 6 · Apple Watch 6).");
    expect(checks.get("appstore_subtitle")?.status).toBe("WARN");
    expect(checks.get("store_preview_video")?.status).toBe("WARN");
    expect(checks.get("store_privacy_policy")?.status).toBe("PASS");
    // The policy lives on the platform vendor's domain, not the publisher's.
    expect(checks.get("store_privacy_policy_owner")?.status).toBe("WARN");
    expect(checks.get("store_privacy_policy_owner")?.confidence).toBe("MEDIUM");
    expect(checks.get("appstore_privacy_label")?.status).toBe("PASS");
    expect(checks.has("playstore_data_safety")).toBe(false);
  });

  it("Android — the findings a reader can verify in Google Play", () => {
    const checks = byKey(buildStoreListingChecks("play_store", parsePlayStoreListing(PLAY_HTML, ANDROID_URL)));
    expect(checks.get("store_app_title")?.detail).toBe('Listed as "Beyond Nutrition UK", published by Trainerize CBA-STUDIO.');
    expect(checks.get("store_ratings")?.status).toBe("WARN");
    // 1,175-character description, but an 11-character short description.
    expect(checks.get("store_description")?.status).toBe("WARN");
    expect(checks.get("store_description")?.detail).toContain('"Fitness App" (11 of the 80 characters');
    expect(checks.get("playstore_data_safety")?.status).toBe("WARN");
    expect(checks.get("playstore_data_safety")?.detail).toContain("can't be deleted");
    // Here the policy IS the publisher's — the publisher is the vendor.
    expect(checks.get("store_privacy_policy_owner")?.status).toBe("PASS");
    expect(checks.has("appstore_subtitle")).toBe(false);
  });

  it("every check that read a store field says it is HIGH confidence, and why", () => {
    for (const store of ["app_store", "play_store"] as const) {
      const listing = store === "app_store" ? parseAppStoreListing(APPLE_HTML) : parsePlayStoreListing(PLAY_HTML, ANDROID_URL);
      for (const check of buildStoreListingChecks(store, listing)) {
        if (check.checkKey === "store_privacy_policy_owner" || check.status === "SKIPPED" || check.status === "INCONCLUSIVE") continue;
        expect(check.confidence, `${store} ${check.checkKey}`).toBe("HIGH");
      }
    }
  });

  it("an unreadable listing is INCONCLUSIVE — never SKIPPED, never PASS", () => {
    // SKIPPED means "does not apply", which the gate and the score both ignore — so an
    // unreadable listing reported that way passed the gate on store_page_live alone.
    for (const store of ["app_store", "play_store"] as const) {
      const checks = buildStoreListingChecks(store, null);
      expect(checks.length).toBeGreaterThan(8);
      for (const check of checks) expect(check.status, `${store} ${check.checkKey}`).toBe("INCONCLUSIVE");
    }
  });

  it("states no unsourced statistic", () => {
    const text = buildStoreListingChecks("app_store", parseAppStoreListing(APPLE_HTML)).map((c) => c.detail).join(" ");
    expect(text).not.toMatch(/\d+\s*[–-]\s*\d+\s*%/);
  });
});

// ── 4. The decision ──────────────────────────────────────────────────────────

function gateFor(url: string, checks: PulseScanCheckInput[], executions: CollectorExecution[]) {
  const annotated = checks.map(annotateTrust);
  return evaluateReleaseGate(
    annotated,
    { ...computeScoreBreakdown(annotated), collectors: collectorCoverage(executions) },
    resolveGatePolicy({ targetUrl: url }),
  );
}

const live = (store: string): PulseScanCheckInput => ({
  category: "Store Listing", checkKey: "store_page_live", label: `${store} listing is live`, status: "PASS",
} as PulseScanCheckInput);

describe("a store scan is judged as the app it lists", () => {
  it("picks the iOS / Android listing policy from the link", () => {
    expect(resolveGatePolicy({ targetUrl: IOS_URL }).id).toBe("ios-app-listing");
    expect(resolveGatePolicy({ targetUrl: ANDROID_URL }).id).toBe("android-app-listing");
    expect(resolveGatePolicy({ targetUrl: "https://example.com" }).id).toBe("launch-ready");
    // An explicit choice still wins.
    expect(resolveGatePolicy({ policyId: "handover", targetUrl: IOS_URL }).id).toBe("handover");
    expect(resolveGatePolicy({ targetUrl: IOS_URL }).label).toBe("iOS app · App Store listing");
  });

  it("a readable iOS listing gets a decision — not 'scan the product's own URL'", () => {
    const checks = [live("App Store"), ...buildStoreListingChecks("app_store", parseAppStoreListing(APPLE_HTML))];
    const gate = gateFor(IOS_URL, checks, [
      { name: "store-listing", outcome: "COMPLETED" },
      { name: "url-checks", outcome: "NOT_APPLICABLE", reason: "Not part of this scan: this is an iOS app." },
    ]);
    expect(gate.policy.id).toBe("ios-app-listing");
    expect(gate.decision).not.toBe("INCONCLUSIVE");
    expect(JSON.stringify(gate)).not.toMatch(/own URL|url-checks/);
  });

  it("an unreadable listing cannot pass", () => {
    const checks = [live("App Store"), ...buildStoreListingChecks("app_store", null)];
    const gate = gateFor(IOS_URL, checks, [
      { name: "store-listing", outcome: "ERROR", detail: "The App Store page did not include its listing data." },
    ]);
    expect(gate.decision).toBe("INCONCLUSIVE");
    const reason = gate.unverified.find((r) => r.code === "REQUIRED_COLLECTOR_UNAVAILABLE");
    // Says why, not "did not run".
    expect(reason?.summary).toContain("did not complete");
    expect(reason?.summary).toContain("did not include its listing data");
  });

  it("a rate-limited store is INCONCLUSIVE, not a removed app", () => {
    const throttled: PulseScanCheckInput = {
      category: "Store Listing", checkKey: "store_page_live", label: "App Store listing is live", status: "INCONCLUSIVE",
      detail: "Not assessed — the App Store rate-limited this scan (HTTP 429).",
    } as PulseScanCheckInput;
    const gate = gateFor(IOS_URL, [throttled], [{ name: "store-listing", outcome: "ERROR", detail: throttled.detail }]);
    expect(gate.decision).toBe("INCONCLUSIVE");
    expect(gate.blocking).toEqual([]);
  });

  it("a required collector that was never recorded is not mistaken for one that ran", () => {
    // The listing checks are all fine — but store-listing appears in no list at all.
    const checks = [live("App Store"), ...buildStoreListingChecks("app_store", parseAppStoreListing(APPLE_HTML))];
    const gate = gateFor(IOS_URL, checks, [{ name: "url-checks", outcome: "NOT_APPLICABLE", reason: "n/a" }]);
    expect(gate.decision).toBe("INCONCLUSIVE");
  });

  it("a listing with no privacy policy is blocked", () => {
    const listing = { ...parseAppStoreListing(APPLE_HTML)!, privacyPolicyUrl: null };
    const checks = [live("App Store"), ...buildStoreListingChecks("app_store", listing)];
    const gate = gateFor(IOS_URL, checks, [{ name: "store-listing", outcome: "COMPLETED" }]);
    expect(gate.decision).toBe("BLOCKED");
    expect(gate.blocking.flatMap((r) => r.checkKeys)).toContain("store_privacy_policy");
  });
});

describe("the coverage note is written about the app", () => {
  it("names the iOS source checks a listing cannot reach, without blaming the input", () => {
    const check = buildPlatformCoverageCheck({ selectedPlatform: "IOS_APP", inputType: "URL", detectedShape: null, storeTarget: "app_store" })!;
    expect(check.status).toBe("SKIPPED");
    expect(check.detail).toContain("This is an iOS app, assessed from its App Store listing");
    expect(check.detail).not.toMatch(/You scanned this as/);
    const android = buildPlatformCoverageCheck({ selectedPlatform: "ANDROID_APP", inputType: "URL", detectedShape: null, storeTarget: "play_store" })!;
    expect(android.detail).toContain("This is an Android app, assessed from its Google Play listing");
  });
});

describe("the agent verdict says what was scanned", () => {
  it("an iOS link reports an iOS subject, under the iOS policy", () => {
    const verdict = buildAgentVerdict({
      url: IOS_URL, status: "COMPLETED", healthScore: 90, techStack: ["iOS"], checks: [live("App Store")],
      collectors: collectorCoverage([{ name: "store-listing", outcome: "COMPLETED" }]),
      platform: "WEB_APP", // a stale picker value must not win
      name: "Beyond Nutrition UK",
    });
    expect(verdict.subject).toEqual({ platform: "IOS_APP", label: "iOS app · App Store listing", name: "Beyond Nutrition UK" });
    expect(verdict.gate.policy.id).toBe("ios-app-listing");
    expect(verdict.summary.startsWith("Beyond Nutrition UK (iOS app · App Store listing)")).toBe(true);
  });

  it("an Android link reports an Android subject, and drops an invented name", () => {
    const verdict = buildAgentVerdict({
      url: ANDROID_URL, status: "COMPLETED", healthScore: 80, techStack: ["Android"], checks: [live("Google Play")],
      name: "play.google.com",
    });
    expect(verdict.subject.platform).toBe("ANDROID_APP");
    expect(verdict.subject.name).toBeNull();
    expect(verdict.gate.policy.id).toBe("android-app-listing");
  });

  it("a website keeps a website's verdict", () => {
    const verdict = buildAgentVerdict({ url: "https://example.com", status: "COMPLETED", healthScore: 80, techStack: [], checks: [] });
    expect(verdict.subject.label).toBeNull();
    expect(verdict.gate.policy.id).toBe("launch-ready");
  });
});

// ── 5. The wiring, which needs a database or the network to drive ────────────
//
// Source-level on purpose: each of these paths needs a live store or a database, so a
// behavioural test would pass while the wiring was missing. Each assertion names the
// one line that, removed, puts the bug back.

describe("every path uses the same rule", () => {
  const src = (path: string) => readFileSync(path, "utf8").replace(/\/\/[^\n]*/g, "");

  it("the scan record stores the platform the link decides", () => {
    const pulse = src("src/server/pulse.ts");
    const create = pulse.slice(pulse.indexOf("export async function createPulseScanRecord"), pulse.indexOf("export async function", pulse.indexOf("export async function createPulseScanRecord") + 10));
    expect(create).toMatch(/resolveScanPlatform\(input\.inputUrl, input\.platform\)/);
    expect(create).toMatch(/platform: platform \?\? null/);
    expect(create).not.toMatch(/platform: input\.platform \?\? null/);
  });

  it("the analysis runs, names and judges the scan as the app", () => {
    const pulse = src("src/server/pulse.ts");
    const run = pulse.slice(pulse.indexOf("export async function runAnalysis"));
    expect(run).toMatch(/resolveScanPlatform\(input\.inputUrl, input\.platform\)/);
    expect(run).toMatch(/resolveGatePolicy\(\{ targetUrl: input\.inputUrl \}\)/);
    expect(run).not.toContain("DEFAULT_GATE_POLICY");
    expect(run).toMatch(/isPlaceholderStoreName\(projectName, input\.inputUrl\)/);
  });

  it("the scan runner records the store-listing collector and no website framing", () => {
    const lite = src("src/server/pulse-lite/run-lite-scan.ts");
    expect(lite).toContain('collectorCompleted("store-listing")');
    expect(lite).toContain('name: "store-listing"');
    expect(lite).not.toMatch(/scan the product's own URL/i);
    expect(lite).toMatch(/selectedPlatform: executionPlatform/);
  });

  it("the form sends the link's platform, not the picker's default", () => {
    const form = src("src/components/pulse/pulse-new-scan-form.tsx");
    expect(form).toMatch(/platform: effectivePlatform,/);
    expect(form).toMatch(/storeTarget \? storePlatformForTarget\(storeTarget\) : platform/);
  });

  it("the report's fallback gate uses the same policy as the scan", () => {
    const results = src("src/components/pulse/pulse-scan-results.tsx");
    expect(results).toMatch(/resolveGatePolicy\(\{ targetUrl: scan\.inputUrl \}\)/);
  });

  it("the store branch reads structured data, and a framework only from the app's own description", () => {
    const scan = src("src/server/pulse-scan.ts");
    const fn = scan.slice(scan.indexOf("async function runMobileStoreChecks"), scan.indexOf("export function getInapplicableCategoryDetails") > 0 ? scan.indexOf("export function getInapplicableCategoryDetails") : undefined);
    expect(fn).toContain("buildStoreListingChecks(storeType, listing");
    expect(fn).not.toMatch(/lower\.includes\("rating"\)|lower\.includes\("age"\)|lower\.includes\("screenshot"\)/);
    expect(fn).toMatch(/ownDescription\.includes\("flutter"\)/);
    // Only 404 / 410 may say the app is gone.
    expect(fn).toContain("status === 404 || status === 410");
  });
});
