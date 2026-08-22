import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasCookieConsentMechanism, linksPathContaining } from "@/server/pulse-scan";

/**
 * Three compliance checks were reported as findings on www.gov.uk by a LIVE scan on
 * 2026-08-22, and all three were wrong:
 *
 *   accessibility_statement  "No accessibility statement — required by EU Web
 *                            Accessibility Directive"
 *   cookie_policy_page       "No dedicated cookie policy"
 *   cookie_consent           "No cookie consent mechanism"
 *
 * gov.uk links `/help/accessibility-statement` and `/help/cookies` from the very page
 * Pulse parsed, and ships the reference UK cookie banner. The first two checks HEADed a
 * FIXED ROOT PATH (`/accessibility`, `/cookies`) and never read the page's links; the
 * third matched a CLOSED VENDOR LIST, so a self-hosted banner was invisible.
 *
 * Telling the UK government its site has no accessibility statement — on the strength of
 * a path we guessed wrong — is the same defect as the original legal-link matcher, and
 * it was found the same way: by scanning a real site, per CLAUDE.md §34.3.
 *
 * The fixture is a verbatim slice of the live page.
 */

const FIXTURE = "src/server/pulse-checks/__tests__/fixtures/govuk-homepage.html";

describe("gov.uk's real footer, against the shipped matcher", () => {
  const html = readFileSync(FIXTURE, "utf8");

  it("finds the accessibility statement it links", () => {
    expect(linksPathContaining(html, ["accessibility"])).toBe(true);
  });

  it("finds the cookie policy it links", () => {
    expect(linksPathContaining(html, ["cookie-policy", "cookiepolicy", "cookies", "cookie"])).toBe(true);
  });
});

describe("linksPathContaining", () => {
  const found = (markup: string, tokens: string[]) => linksPathContaining(markup, tokens);

  it("matches a token anywhere in the path, not only at the root", () => {
    // The whole bug: /help/<thing> was invisible to a root-only probe.
    expect(found('<a href="/help/accessibility-statement">A</a>', ["accessibility"])).toBe(true);
    expect(found('<a href="/help/cookies">C</a>', ["cookies"])).toBe(true);
    expect(found('<a href="/en-gb/legal/cookie-policy/">C</a>', ["cookie-policy"])).toBe(true);
    expect(found('<a href="https://example.com/support/accessibility">A</a>', ["accessibility"])).toBe(true);
  });

  it("ignores the query and the fragment", () => {
    expect(found('<a href="/help/cookies?lang=cy#top">C</a>', ["cookies"])).toBe(true);
  });

  it("does not count a link the browser would never render", () => {
    // Same rule the legal matcher uses — a commented-out link is not a link.
    for (const markup of [
      '<!-- <a href="/help/accessibility-statement">A</a> -->',
      '<template><a href="/help/accessibility-statement">A</a></template>',
      '<textarea><a href="/help/accessibility-statement">A</a></textarea>',
    ]) expect(found(markup, ["accessibility"]), markup).toBe(false);
  });

  it("does not match the token in ordinary body prose", () => {
    expect(found("<p>We care about accessibility and cookies.</p>", ["accessibility"])).toBe(false);
  });

  it("requires the token in the PATH, not in a host or a query value", () => {
    expect(found('<a href="/search?q=accessibility">S</a>', ["accessibility"])).toBe(false);
  });

  it("returns false when there are no links at all", () => {
    expect(found("<html><body><h1>Hi</h1></body></html>", ["accessibility"])).toBe(false);
  });
});

describe("cookie consent is detected by MECHANISM, not by vendor", () => {
  it("finds gov.uk's self-hosted banner", () => {
    // The exact markup a closed vendor list could not see.
    const banner = readFileSync("src/server/pulse-checks/__tests__/fixtures/govuk-cookie-banner.html", "utf8");
    expect(hasCookieConsentMechanism(banner)).toBe(true);
  });

  it("still finds the third-party CMPs", () => {
    for (const vendor of ["cookiebot", "OneTrust", "Osano", "iubenda", "usercentrics", "didomi"]) {
      expect(hasCookieConsentMechanism(`<script src="https://cdn.example/${vendor}.js"></script>`), vendor).toBe(true);
    }
  });

  it("finds a hand-rolled banner by its container name", () => {
    for (const markup of [
      '<div class="cookie-banner">…</div>',
      '<div id="cookieConsent">…</div>',
      '<div class="cookie_notice is-visible">…</div>',
      '<div id="global-cookie-message">…</div>',
      '<div class="consent-modal">…</div>',
    ]) expect(hasCookieConsentMechanism(markup), markup).toBe(true);
  });

  it("finds one by the copy a visitor actually reads", () => {
    expect(hasCookieConsentMechanism('<div><p>We use cookies to make this site work.</p><button>Accept all cookies</button></div>')).toBe(true);
    expect(hasCookieConsentMechanism('<div>Cookies. <a href="/cookies">Cookie settings</a></div>')).toBe(true);
  });

  it("does NOT fire on a page that merely mentions cookies", () => {
    // The copy test is gated on the page mentioning cookies, so it must not be
    // satisfied by the word alone — otherwise every recipe blog has consent.
    expect(hasCookieConsentMechanism("<p>Our chocolate chip cookies are famous.</p>")).toBe(false);
    expect(hasCookieConsentMechanism("<p>This site stores a session cookie.</p>")).toBe(false);
    expect(hasCookieConsentMechanism("<html><body><h1>Hello</h1></body></html>")).toBe(false);
  });
});
