/**
 * Adversarial review of the pulse-scan audit fixes (2026-10-14). Each case is two-sided:
 * the input the review found wrong must change, and a representative correct input must not.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAREERS_LINK_TOKENS,
  CONTACT_LINK_TOKENS,
  DPA_LINK_TOKENS,
  FAQ_LINK_TOKENS,
  hasAppleAppStoreLink,
  hasAuthEntryLink,
  isInlinePrivacyPolicy,
  isOpenApiDocument,
  linksOwnPathContaining,
  linksPathContaining,
} from "../../pulse-scan";

const SOURCE = readFileSync(path.join(__dirname, "../../pulse-scan.ts"), "utf8");

describe("page-link checks credit only this organisation's pages", () => {
  it("another company's DPA or help centre is not this site's", () => {
    // A subprocessor list linking Stripe's DPA, a reCAPTCHA notice linking Google's help.
    expect(linksOwnPathContaining('<a href="https://stripe.com/legal/dpa">Stripe DPA</a>', DPA_LINK_TOKENS, "acme.com")).toBe(false);
    expect(linksOwnPathContaining('<a href="https://support.google.com/recaptcha">Help</a>', FAQ_LINK_TOKENS, "acme.com")).toBe(false);
    expect(linksOwnPathContaining('<a href="https://careers.google.com/">Jobs</a>', CAREERS_LINK_TOKENS, "acme.com")).toBe(false);
    expect(linksOwnPathContaining('<a href="https://github.com/contact">Contact GitHub</a>', CONTACT_LINK_TOKENS, "acme.com")).toBe(false);
  });
  it("still credits the site's own pages, relative or on its own subdomains", () => {
    expect(linksOwnPathContaining('<a href="/legal/dpa">DPA</a>', DPA_LINK_TOKENS, "supabase.com")).toBe(true);
    expect(linksOwnPathContaining('<a href="https://www.anthropic.com/legal/data-processing-addendum">DPA</a>', DPA_LINK_TOKENS, "www.anthropic.com")).toBe(true);
    expect(linksOwnPathContaining('<a href="https://support.gymshark.com/en-US">Help</a>', FAQ_LINK_TOKENS, "uk.gymshark.com")).toBe(true);
    expect(linksOwnPathContaining('<a href="/company/careers">Careers</a>', CAREERS_LINK_TOKENS, "webflow.com")).toBe(true);
    expect(linksOwnPathContaining('<a href="/help/contact-us">Contact</a>', CONTACT_LINK_TOKENS, "www.theguardian.com")).toBe(true);
  });
  it("the four call sites use the same-organisation variant", () => {
    for (const tokens of ["CONTACT_LINK_TOKENS", "FAQ_LINK_TOKENS", "DPA_LINK_TOKENS", "CAREERS_LINK_TOKENS"]) {
      expect(SOURCE).not.toMatch(new RegExp(`linksPathContaining\\([^)]*${tokens}\\)`));
      expect(SOURCE).toMatch(new RegExp(`linksOwnPathContaining\\([^)]*${tokens}, hostname\\)`));
    }
  });
});

describe("FAQ tokens: a stylesheet named help.css is not a help centre", () => {
  it("rejects a bare asset extension, keeps page extensions and host labels", () => {
    expect(linksPathContaining('<link rel="stylesheet" href="/css/help.css">', FAQ_LINK_TOKENS)).toBe(false);
    expect(linksPathContaining('<script src="x"></script><link href="/static/support.js">', FAQ_LINK_TOKENS)).toBe(false);
    expect(linksPathContaining('<a href="/faq.html">FAQ</a>', FAQ_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="https://help.example.com/">Help</a>', FAQ_LINK_TOKENS)).toBe(true);
  });
});

describe("auth_ui_signals: another product's login is not this product's", () => {
  it("rejects an off-organisation login link when the host is known", () => {
    expect(hasAuthEntryLink('<a href="https://github.com/login">Sign in with GitHub</a>', "acme.dev")).toBe(false);
  });
  it("keeps same-organisation and relative login links", () => {
    expect(hasAuthEntryLink('<a href="https://dashboard.stripe.com/login">Sign in</a>', "stripe.com")).toBe(true);
    expect(hasAuthEntryLink('<a href="/account/login">Log in</a>', "uk.gymshark.com")).toBe(true);
    expect(SOURCE).toContain("hasAuthEntryLink(pageResult.html, hostname)");
  });
});

describe("apple_app_store: apple.co is not always the App Store", () => {
  it("an Apple Podcasts / Music short link does not count", () => {
    expect(hasAppleAppStoreLink('<a href="https://apple.co/3xYz">Listen on Apple Podcasts</a>')).toBe(false);
  });
  it("an apple.co link that says App Store, or carries the badge, still counts", () => {
    expect(hasAppleAppStoreLink('<a href="https://apple.co/3xYz">Download on the App Store</a>')).toBe(true);
    expect(hasAppleAppStoreLink('<a href="https://apple.co/3xYz"><img src="/badge.png" alt="Get it for iPhone"></a>')).toBe(true);
  });
});

describe("openapi_endpoint: judge top-level keys, not text", () => {
  it("a real spec with a schema property named `dependencies` is still a spec", () => {
    const spec = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Registry" },
      paths: {},
      components: { schemas: { Package: { properties: { dependencies: { type: "object" } } } } },
    });
    expect(isOpenApiDocument(spec)).toBe(true);
  });
  it("a package.json depending on swagger is not a spec", () => {
    expect(isOpenApiDocument('{"name":"x","dependencies":{"swagger":"0.7.5"},"info":{"a":1}}')).toBe(false);
  });
});

describe("privacy_policy inline: the controller's voice is required", () => {
  const filler = "<p>Personal data is valuable. Personal information matters to every business.</p>".repeat(8);
  it("an article ABOUT privacy policies does not clear the launch gate", () => {
    const article = `<h1>Why your startup needs a Privacy Policy</h1>${filler}<h2>Your rights</h2><h2>Third parties</h2>`;
    expect(isInlinePrivacyPolicy(article)).toBe(false);
  });
  it("a policy written as the controller still passes", () => {
    const policy = `<h1>Privacy Policy</h1>${filler}<p>We collect your personal data when you order. We use your information to deliver. We share personal information with couriers.</p><h2>Your rights</h2><h2>Third parties</h2>`;
    expect(isInlinePrivacyPolicy(policy)).toBe(true);
  });
});

describe("runtime wiring", () => {
  it("the /pricing and robots.txt probes read a bounded body", () => {
    expect(SOURCE).toContain("fetchSnippet(`${baseUrl}/pricing`, 8000, 1_500_000)");
    expect(SOURCE).toContain('fetchSnippet(new URL("/robots.txt", httpsUrl).href, 8000, 100_000)');
    expect(SOURCE).not.toMatch(/probePath\(`\$\{baseUrl\}\/pricing`/);
  });
  it("an unread /pricing is INCONCLUSIVE, a HubSpot loader alone is INCONCLUSIVE, unsourced uplift claims are gone", () => {
    expect(SOURCE).toContain('status: hasAnnualBilling ? "PASS" : pricingUnread ? "INCONCLUSIVE" : "WARN"');
    expect(SOURCE).toContain('status: hasLiveChat ? "PASS" : hubspotLoaderOnly ? "INCONCLUSIVE" : "WARN"');
    expect(SOURCE).not.toContain("Annual billing reduces churn by ~50%");
    expect(SOURCE).not.toContain("Live chat can increase conversions by 20-40%");
  });
  it("the policy date comes from the policy, not any homepage 'last updated' text", () => {
    expect(SOURCE).toMatch(/const homepageHasPolicyDate = legalPageConfirms\("privacy", contentHtml\) &&/);
  });
});
