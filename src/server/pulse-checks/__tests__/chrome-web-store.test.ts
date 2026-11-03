import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chromeWebStoreItemId,
  detectStoreTarget,
  isPlaceholderStoreName,
  provisionalStoreProjectName,
  storePlatformForUrl,
} from "@/lib/pulse-store-url";
import { buildStoreListingChecks, isChromeWebStoreItemGone, parseChromeWebStoreListing } from "@/server/pulse-checks/store-listing";
import { evaluateExtensionManifest, extensionScriptSources } from "@/server/pulse-checks/chrome-extension";
import { resolveGatePolicy } from "@/server/pulse-checks/release-decision";

/**
 * A Chrome Web Store link was graded as Google's WEBSITE — 814 checks of security headers,
 * SEO and SaaS readiness about chromewebstore.google.com — and as a Chrome extension it
 * returned 3. Fixtures are real listings captured 2026-10-01 (trimmed to the data block):
 * Bitwarden, uBlock Origin Lite, and Dark Reader's OLD id, which the store no longer lists
 * but still answers with HTTP 200.
 */

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const BITWARDEN = "https://chromewebstore.google.com/detail/bitwarden-password-manager/nngceckbapebfimnlniiiahkandclblb";
const UBOL = "https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh";
const byKey = <T extends { checkKey: string }>(checks: T[]) => new Map(checks.map((c) => [c.checkKey, c]));

describe("a Chrome Web Store link is a Chrome extension", () => {
  it("is recognised by host and item id, in both URL forms", () => {
    expect(detectStoreTarget(BITWARDEN)).toBe("chrome_web_store");
    expect(detectStoreTarget("https://chromewebstore.google.com/detail/nngceckbapebfimnlniiiahkandclblb")).toBe("chrome_web_store");
    expect(detectStoreTarget("https://chrome.google.com/webstore/detail/bitwarden/nngceckbapebfimnlniiiahkandclblb")).toBe("chrome_web_store");
    expect(storePlatformForUrl(BITWARDEN)).toBe("CHROME_EXTENSION");
    expect(chromeWebStoreItemId(BITWARDEN)).toBe("nngceckbapebfimnlniiiahkandclblb");
  });

  it("is not the store's home page or a look-alike host", () => {
    expect(detectStoreTarget("https://chromewebstore.google.com/")).toBeNull();
    expect(detectStoreTarget("https://chromewebstore.google.com/category/extensions")).toBeNull();
    expect(detectStoreTarget("https://example.com/detail/nngceckbapebfimnlniiiahkandclblb")).toBeNull();
  });

  it("names the scan from the slug, never from the store's 'empty-title' placeholder", () => {
    expect(provisionalStoreProjectName(BITWARDEN)).toBe("Bitwarden Password Manager");
    expect(provisionalStoreProjectName("https://chromewebstore.google.com/detail/empty-title/eimadpbcbfnmbkopoojfekhnkhdbieeg")).toBeNull();
    expect(isPlaceholderStoreName("chromewebstore.google.com", BITWARDEN)).toBe(true);
  });

  it("is judged by the Chrome-extension listing policy", () => {
    const policy = resolveGatePolicy({ targetUrl: BITWARDEN });
    expect(policy.id).toBe("chrome-extension-listing");
    expect(policy.blockingKeys).toContain("ext_manifest_v3");
  });
});

describe("the listing is read from the store's own data block", () => {
  const bitwarden = parseChromeWebStoreListing(fixture("cws-bitwarden.html"), "nngceckbapebfimnlniiiahkandclblb")!;
  const ubol = parseChromeWebStoreListing(fixture("cws-ubol.html"), "ddkjiahejlhfcafbddmgiahcphecmpfh")!;

  it("reads Bitwarden's facts", () => {
    expect(bitwarden.name).toBe("Bitwarden Password Manager");
    expect(bitwarden.extension?.users).toBe(7_000_000);
    expect(bitwarden.rating?.count).toBeGreaterThan(5000);
    expect(bitwarden.extension?.featured).toBe(true);
    expect(bitwarden.extension?.establishedPublisher).toBe(true);
    expect(bitwarden.extension?.trader).toBe(true);
    expect(bitwarden.extension?.manifest?.manifest_version).toBe(3);
    expect(bitwarden.extension?.dataHandled).toEqual(expect.arrayContaining(["Personally identifiable information", "Authentication information"]));
  });

  it("reads uBlock Origin Lite as declaring no data collected", () => {
    expect(ubol.extension?.users).toBe(21_000_000);
    expect(ubol.extension?.dataHandled).toEqual([]);
    expect(ubol.extension?.featured).toBe(true);
  });

  it("refuses a page whose data names a different item", () => {
    expect(parseChromeWebStoreListing(fixture("cws-bitwarden.html"), "ddkjiahejlhfcafbddmgiahcphecmpfh")).toBeNull();
  });

  it("recognises a removed item even though the store answered 200", () => {
    const gone = fixture("cws-darkreader.html");
    expect(isChromeWebStoreItemGone(gone)).toBe(true);
    expect(parseChromeWebStoreListing(gone, "eimadpbcbfnmbkopoojfekhnkhdbieeg")).toBeNull();
    expect(isChromeWebStoreItemGone(fixture("cws-bitwarden.html"))).toBe(false);
  });
});

describe("the checks report what the listing says", () => {
  it("Bitwarden: privacy practices, trader and badges pass; the manifest is MV3", () => {
    const listing = parseChromeWebStoreListing(fixture("cws-bitwarden.html"), "nngceckbapebfimnlniiiahkandclblb");
    const checks = byKey(buildStoreListingChecks("chrome_web_store", listing));
    expect(checks.get("cws_privacy_practices")?.status).toBe("PASS");
    expect(checks.get("cws_trader_status")?.status).toBe("PASS");
    expect(checks.get("cws_trust_badges")?.status).toBe("PASS");
    expect(checks.get("ext_manifest_v3")?.status).toBe("PASS");
    // No Apple/Play-only checks on a Chrome listing.
    for (const key of ["store_age_rating", "store_iap_disclosed", "appstore_subtitle", "playstore_data_safety"]) expect(checks.has(key), key).toBe(false);
  });

  it("uBlock Origin Lite: no privacy policy is required when no data is collected", () => {
    const listing = parseChromeWebStoreListing(fixture("cws-ubol.html"), "ddkjiahejlhfcafbddmgiahcphecmpfh");
    const policy = byKey(buildStoreListingChecks("chrome_web_store", listing)).get("store_privacy_policy");
    expect(listing?.privacyPolicyUrl ? "PASS" : "SKIPPED").toBe(policy?.status);
  });

  it("an unreadable listing is INCONCLUSIVE, never a pass", () => {
    for (const check of buildStoreListingChecks("chrome_web_store", null)) expect(check.status, check.checkKey).toBe("INCONCLUSIVE");
  });
});

describe("the extension CSP is parsed by directive", () => {
  it("'wasm-unsafe-eval' is not 'unsafe-eval' — Bitwarden's real policy passes", () => {
    const checks = byKey(evaluateExtensionManifest({
      manifest_version: 3,
      content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    }, "store"));
    expect(checks.get("ext_no_remote_code")?.status).toBe("PASS");
  });

  it("an https source in frame-src is not a remote SCRIPT — Grammarly's shape passes", () => {
    const checks = byKey(evaluateExtensionManifest({
      manifest_version: 3,
      content_security_policy: { extension_pages: "script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self' https://d3ttvzt45fz9bg.cloudfront.net" },
    }, "store"));
    expect(checks.get("ext_no_remote_code")?.status).toBe("PASS");
    expect(checks.has("ext_csp_unsafe_inline")).toBe(false);
  });

  it("a real remote script or unsafe-eval in script-src still fails", () => {
    expect(byKey(evaluateExtensionManifest({ manifest_version: 3, content_security_policy: { extension_pages: "script-src 'self' https://cdn.example.com" } }, "store")).get("ext_no_remote_code")?.status).toBe("FAIL");
    expect(byKey(evaluateExtensionManifest({ manifest_version: 2, content_security_policy: "script-src 'self' 'unsafe-eval'; object-src 'self'" }, "store")).get("ext_no_remote_code")?.status).toBe("FAIL");
  });

  it("falls back to default-src when there is no script-src", () => {
    expect(extensionScriptSources("default-src 'self' https://x.example")).toEqual(["'self'", "https://x.example"]);
  });
});
