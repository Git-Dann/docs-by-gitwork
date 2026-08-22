import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// `privacy_policy` and `terms_of_service` accuse a site of a LEGAL-COMPLIANCE
// failure, so a false NEGATIVE ("you have no privacy policy" when they do) is far
// more damaging than a false positive. They used to demand an exact
// `href="/privacy"` — closing quote included — and therefore missed:
//
//   · any locale prefix. Verified outside Pulse with curl: stripe.com 307s to
//     stripe.com/gb, which links `href="/gb/privacy"`. Pulse's single
//     highest-priority finding about Stripe was "No privacy policy link".
//   · trailing slashes, absolute URLs, query strings and fragments
//   · every non-English path
//
// This mirrors the shipped matcher. Kept in lock-step deliberately: if the
// implementation is re-tightened, these fail.
// ─────────────────────────────────────────────────────────────────────────────

const linksTo = (html: string, paths: string[]) =>
  new RegExp(`href=["'][^"']*/(?:${paths.join("|")})(?:/|["'#?]|$)`, "i").test(html.toLowerCase());

const PRIVACY = ["privacy", "privacy-policy", "privacy-notice", "privacypolicy",
  "datenschutz", "confidentialite", "privacidad", "privacybeleid"];
const TERMS = ["terms", "tos", "terms-of-service", "terms-of-use", "terms-and-conditions",
  "termsofservice", "conditions", "agb", "nutzungsbedingungen"];

describe("privacy policy links are found however they are written", () => {
  const cases: [string, string][] = [
    ["bare relative", `<a href="/privacy">Privacy</a>`],
    ["locale-prefixed (the real stripe.com/gb case)", `<a href="/gb/privacy">Privacy</a>`],
    ["long locale", `<a href="/en-gb/legal/privacy-policy">Privacy</a>`],
    ["trailing slash", `<a href="/privacy/">Privacy</a>`],
    ["absolute URL", `<a href="https://example.com/privacy">Privacy</a>`],
    ["with a fragment", `<a href="/privacy#cookies">Privacy</a>`],
    ["with a query", `<a href="/privacy?lang=en">Privacy</a>`],
    ["single quotes", `<a href='/privacy'>Privacy</a>`],
    ["German", `<a href="/de/datenschutz">Datenschutz</a>`],
    ["French", `<a href="/fr/confidentialite">Confidentialité</a>`],
    ["nested under /legal", `<a href="/legal/privacy-notice">Privacy</a>`],
  ];
  for (const [name, html] of cases) {
    it(`finds it: ${name}`, () => expect(linksTo(html, PRIVACY)).toBe(true));
  }

  it("still reports a genuine absence", () => {
    expect(linksTo(`<a href="/about">About</a><a href="/contact">Contact</a>`, PRIVACY)).toBe(false);
  });

  it("does not match the word 'privacy' in ordinary body text", () => {
    expect(linksTo(`<p>We take your privacy seriously.</p>`, PRIVACY)).toBe(false);
  });
});

describe("terms links are found however they are written", () => {
  for (const [name, html] of [
    ["bare", `<a href="/terms">Terms</a>`],
    ["locale-prefixed", `<a href="/gb/terms-of-service">Terms</a>`],
    ["/tos", `<a href="/tos">Terms</a>`],
    ["under /legal", `<a href="/legal/terms-of-use">Terms</a>`],
    ["absolute", `<a href="https://example.com/terms/">Terms</a>`],
  ] as [string, string][]) {
    it(`finds it: ${name}`, () => expect(linksTo(html, TERMS)).toBe(true));
  }

  it("still reports a genuine absence", () => {
    // Verified: stripe.com/gb links a privacy policy but no terms page, so a FAIL
    // here is a true finding and must not be papered over by the looser matcher.
    expect(linksTo(`<a href="/gb/privacy">Privacy</a>`, TERMS)).toBe(false);
  });
});
