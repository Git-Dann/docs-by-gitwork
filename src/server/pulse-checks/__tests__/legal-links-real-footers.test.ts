import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isLegalHubHref, linksLegalDocument } from "@/server/pulse-scan";

/**
 * Fixtures taken from REAL observed footers, not from the implementation's own token
 * list.
 *
 * That distinction is the whole point of this file. The pre-existing
 * `legal-link-detection.test.ts` builds its cases by iterating the same array the
 * matcher matches on, so it is self-confirming: it can only ever prove the matcher
 * agrees with itself, and it passed for the entire period during which Pulse told
 * www.gov.uk it had no Terms of Service.
 *
 * That was not a cosmetic miss. `privacy_policy` and `terms_of_service` are
 * LAUNCH-BLOCKING keys (priority.ts LAUNCH_BLOCKING_ONLY, release-decision.ts
 * blockingKeys) and they hard-cap the Pulse score at 65 — so a missed footer link is a
 * P1 "you cannot ship" verdict on a site whose legal pages are one click from the page
 * we just parsed.
 *
 * Verified against live HTTP on 2026-08-22 while writing this:
 *   www.gov.uk footer            -> href="/help/terms-conditions"  and  href="/help/privacy-notice"
 *   GET /help/terms-conditions   -> HTTP 200, <h1>Terms and conditions</h1>
 *   news.ycombinator.com footer  -> href="security.html" (bare relative, no leading slash)
 *   ycombinator.com footer       -> href="https://www.ycombinator.com/legal/" (a HUB)
 *   GET /legal/                  -> HTTP 200, headings: Legal / Privacy Policy / Terms of Use
 *
 * When a new real-world footer shape turns up, add the OBSERVED href here. Do not add
 * it only to the token list, or this file stops being independent evidence.
 */

describe("real observed footers", () => {
  const cases: { href: string; note: string; privacy: boolean; terms: boolean }[] = [
    // ── The two shapes that were actually missed in production ──────────────
    {
      href: '<a href="/help/terms-conditions">Terms and conditions</a>',
      note: "gov.uk — hyphenated, no 'and'. The P1 false positive.",
      privacy: false,
      terms: true,
    },
    {
      href: '<a href="/help/privacy-notice">Privacy</a>',
      note: "gov.uk — 'notice' not 'policy'",
      privacy: true,
      terms: false,
    },
    // ── Shapes that already worked and must keep working ────────────────────
    { href: '<a href="/privacy">P</a>', note: "bare", privacy: true, terms: false },
    { href: '<a href="/privacy/">P</a>', note: "trailing slash", privacy: true, terms: false },
    { href: '<a href="/terms">T</a>', note: "bare terms", privacy: false, terms: true },
    { href: '<a href="/legal/terms-and-conditions">T</a>', note: "under /legal", privacy: false, terms: true },
    { href: '<a href="/en-gb/privacy-notice">P</a>', note: "locale prefix", privacy: true, terms: false },
    { href: '<a href="privacy.html">P</a>', note: "HN — bare relative + .html", privacy: true, terms: false },
    { href: '<a href="/terms_of_use">T</a>', note: "underscore separator", privacy: false, terms: true },
    { href: '<a href="/termsofservice/">T</a>', note: "squashed", privacy: false, terms: true },
    { href: '<a href="https://x.example/legal/privacy/">P</a>', note: "absolute URL", privacy: true, terms: false },
    { href: '<a href="/privacy?lang=en">P</a>', note: "query string", privacy: true, terms: false },
    { href: '<a href="/datenschutz">P</a>', note: "German", privacy: true, terms: false },
    { href: '<a href="/nutzungsbedingungen">T</a>', note: "German terms", privacy: false, terms: true },
    // A single document covering both obligations satisfies both checks.
    { href: '<a href="/privacy-and-terms">Both</a>', note: "combined document", privacy: true, terms: true },

    // ── Must stay FALSE. Loosening the regex to catch the cases above is the
    //    obvious fix and it is how you buy a false NEGATIVE on a launch gate:
    //    these are ordinary marketing and docs URLs, and a PASS here would
    //    silently unblock a release for a site with no policy at all.
    { href: '<a href="/terms-glossary">Glossary of terms</a>', note: "a glossary", privacy: false, terms: false },
    { href: '<a href="/privacy-shield-explained">Blog post</a>', note: "a blog post", privacy: false, terms: false },
    { href: '<a href="/our-privacy-first-approach">Marketing</a>', note: "marketing page", privacy: false, terms: false },
    { href: '<a href="/conditions-monitoring">Ops</a>', note: "unrelated 'conditions'", privacy: false, terms: false },
    { href: '<a href="/termination-policy">HR</a>', note: "'term' prefix only", privacy: false, terms: false },
  ];

  for (const c of cases) {
    it(`${c.note} — privacy=${c.privacy} terms=${c.terms}`, () => {
      expect(linksLegalDocument(c.href, "privacy")).toBe(c.privacy);
      expect(linksLegalDocument(c.href, "terms")).toBe(c.terms);
    });
  }
});

describe("a legal hub earns a fetch, never a verdict", () => {
  // ycombinator.com links one bare /legal/ page holding both documents. The old
  // fallback required the WORD to be in the href, so a hub was invisible. A hub must
  // not PASS on the strength of its href either — that would pass a site whose Legal
  // page contains no privacy policy at all.
  const hubs = ["/legal", "/legal/", "https://www.ycombinator.com/legal/", "/policies", "/legal-notices"];
  const notHubs = ["/legal/privacy", "/legalese-blog", "/privacy", "/terms"];

  for (const h of hubs) {
    it(`${h} is a hub`, () => expect(isLegalHubHref(h)).toBe(true));
  }
  for (const h of notHubs) {
    it(`${h} is not a hub`, () => expect(isLegalHubHref(h)).toBe(false));
  }
});

describe("against the live www.gov.uk homepage", () => {
  // The captured homepage that produced the original false positive. Kept as a file so
  // the test is offline and deterministic; refresh it by re-fetching if gov.uk redesigns.
  const FIXTURE = "src/server/pulse-checks/__tests__/fixtures/govuk-homepage.html";

  it("finds BOTH legal documents that are in its footer", () => {
    let html: string;
    try {
      html = readFileSync(FIXTURE, "utf8");
    } catch {
      // A missing fixture must fail loudly rather than silently vacuously pass — a
      // skipped assertion here is exactly how the original bug survived.
      throw new Error(`Missing fixture ${FIXTURE} — this test cannot verify anything without it.`);
    }
    expect(linksLegalDocument(html, "privacy")).toBe(true);
    expect(linksLegalDocument(html, "terms")).toBe(true);
  });
});

describe("brand-prefixed segments — found by sweeping ten live homepages", () => {
  // The first fix handled the SUFFIX side of the hyphenation problem
  // (`/help/terms-conditions`) and left the PREFIX side broken. Verified live
  // 2026-08-22: GitHub's footer links
  // docs.github.com/site-policy/github-terms/github-terms-of-service (HTTP 200)
  // and Pulse reported terms_of_service: FAIL — a P1 launch blocker.
  const shouldMatch: [string, "privacy" | "terms", string][] = [
    ["https://docs.github.com/site-policy/github-terms/github-terms-of-service", "terms", "GitHub, live"],
    ["/site-policy/github-privacy-statement", "privacy", "GitHub privacy, live"],
    ["/legal/company-privacy-policy", "privacy", "brand-prefixed policy"],
    ["/acme-terms-and-conditions", "terms", "brand-prefixed T&C"],
    ["/en/shopify-privacy-policy.html", "privacy", "prefix + locale + .html"],
    ["/legal/our-data-protection-notice", "privacy", "data-protection wording"],
  ];
  for (const [href, kind, note] of shouldMatch) {
    it(`${note}: ${href}`, () => {
      expect(linksLegalDocument(`<a href="${href}">x</a>`, kind)).toBe(true);
    });
  }

  // ⚠️ The reason only MULTI-WORD forms may take a prefix. Each of these would match
  // if a prefix were allowed before the bare word, and each would PASS a launch-blocking
  // legal gate for a site with no policy — the worse direction by far.
  const mustNotMatch: [string, string][] = [
    ["/glossary-of-terms", "a glossary"],
    ["/search-terms", "search terms"],
    ["/payment-terms", "payment terms"],
    ["/delivery-terms", "delivery terms"],
    ["/company-privacy-first-approach", "prefixed marketing page"],
    ["/gb/customers/lightspeed-terminal", "Stripe customer page ('term' inside 'terminal')"],
    ["/hr/termination-policy", "HR policy"],
    ["/blog/privacy-shield-explained", "blog post"],
  ];
  for (const [href, note] of mustNotMatch) {
    it(`stays false — ${note}: ${href}`, () => {
      expect(linksLegalDocument(`<a href="${href}">x</a>`, "privacy")).toBe(false);
      expect(linksLegalDocument(`<a href="${href}">x</a>`, "terms")).toBe(false);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE WORST FALSE NEGATIVE THIS FILE GUARDS: AN ASSET IS NOT A POLICY.
//
// Supporting `href="privacy.html"` (Hacker News's footer) was done by widening the
// token terminator to a bare dot, `(?:[/.]|["'#?]|$)`. That also made every asset
// whose filename merely STARTS with a legal token satisfy the check — and because a
// markup match short-circuits before any fetch, the content-verify that catches every
// other over-match could not save it. Reproduced against the shipped matcher:
//
//   href="/assets/terms.css"      → terms_of_service   = true
//   href="/build/privacy.min.css" → privacy_policy     = true
//   href="/css/conditions.css"    → terms_of_service   = true
//   href="/js/tos.min.js"         → terms_of_service   = true
//   href="/img/privacy.svg"       → privacy_policy     = true
//
// `privacy_policy` and `terms_of_service` are release-gate blockingKeys and hard-cap
// the score at 65, so a build emitting a `terms.<hash>.css` chunk, or a footer with a
// `privacy.svg` icon, silently cleared both gates for a site with no policies at all.
// The dot is now only a terminator in front of a DOCUMENT extension.
// ─────────────────────────────────────────────────────────────────────────────

describe("a dot only ends the token in front of a document extension", () => {
  // Every extension in the fixed list, both kinds, at a realistic asset path.
  const NOT_DOCUMENTS = [
    "css", "js", "mjs", "json", "map", "png", "jpg", "jpeg",
    "gif", "svg", "webp", "woff", "woff2", "ico", "xml",
  ];
  for (const ext of NOT_DOCUMENTS) {
    it(`.${ext} is not a policy`, () => {
      expect(linksLegalDocument(`<link rel="stylesheet" href="/assets/privacy.${ext}">`, "privacy")).toBe(false);
      expect(linksLegalDocument(`<a href="/assets/terms.${ext}">x</a>`, "terms")).toBe(false);
      expect(linksLegalDocument(`<a href="/assets/conditions.${ext}">x</a>`, "terms")).toBe(false);
      expect(linksLegalDocument(`<a href="/assets/tos.${ext}">x</a>`, "terms")).toBe(false);
    });
  }

  // The five verbatim reproducing inputs from the review.
  const REPRODUCERS: [string, "privacy" | "terms"][] = [
    ['<link rel="stylesheet" href="/styles/terms.css">', "terms"],
    ['<link rel="stylesheet" href="/assets/terms.css">', "terms"],
    ['<link rel="stylesheet" href="/build/privacy.min.css">', "privacy"],
    ['<link rel="stylesheet" href="/css/conditions.css">', "terms"],
    ['<a href="/js/tos.min.js">x</a>', "terms"],
    ['<a href="/img/privacy.svg">x</a>', "privacy"],
    ['<a href="/assets/privacy.png">x</a>', "privacy"],
  ];
  for (const [html, kind] of REPRODUCERS) {
    it(`stays false: ${html}`, () => expect(linksLegalDocument(html, kind)).toBe(false));
  }

  // A multi-part extension must not be readable as a document either: the dot has to
  // be followed by the extension itself, not by an intermediate segment.
  it("does not accept a hashed or minified chunk that ends .html-adjacent", () => {
    expect(linksLegalDocument(`<a href="/privacy.min.css">x</a>`, "privacy")).toBe(false);
    expect(linksLegalDocument(`<a href="/terms.a1b2c3.js">x</a>`, "terms")).toBe(false);
  });

  // ⚠️ And the other direction, which is what the dot was widened FOR. A real policy
  // is routinely served as a file, and `.pdf` in particular is a genuine, common shape.
  const DOCUMENTS = ["html", "htm", "xhtml", "shtml", "php", "asp", "aspx", "jsp", "pdf", "txt", "md"];
  for (const ext of DOCUMENTS) {
    it(`.${ext} is still accepted`, () => {
      expect(linksLegalDocument(`<a href="/privacy.${ext}">x</a>`, "privacy")).toBe(true);
      expect(linksLegalDocument(`<a href="/terms.${ext}">x</a>`, "terms")).toBe(true);
    });
  }

  it("keeps the Hacker News shape it was widened for", () => {
    expect(linksLegalDocument(`<a href="privacy.html">Privacy</a>`, "privacy")).toBe(true);
  });

  it("accepts a document extension carrying a query or a fragment", () => {
    expect(linksLegalDocument(`<a href="/privacy.html?lang=en">x</a>`, "privacy")).toBe(true);
    expect(linksLegalDocument(`<a href="/terms.pdf#section-3">x</a>`, "terms")).toBe(true);
  });
});

describe("the bare UK/EU data-protection wording", () => {
  // Residual false positive from the first pass: `data[-_]protection[-_]…` was added
  // ONLY to the prefixable token list, which requires a preceding prefix segment. So
  // `/legal/our-data-protection-notice` matched while the far commoner unprefixed
  // footer form did not, and such a site still took a P1 launch blocker.
  for (const href of ["/data-protection-policy", "/data-protection-notice", "/data-protection-statement", "/en-gb/data_protection_policy", "/legal/data-protection-policy/"]) {
    it(`${href} is a privacy policy`, () => {
      expect(linksLegalDocument(`<a href="${href}">x</a>`, "privacy")).toBe(true);
    });
  }

  it("still requires the document noun — bare `data-protection` is a topic, not a policy", () => {
    expect(linksLegalDocument(`<a href="/data-protection">x</a>`, "privacy")).toBe(false);
    expect(linksLegalDocument(`<a href="/data-protection-officer">x</a>`, "privacy")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE TERMINATOR'S DOT HAD TO SURVIVE A TEMPLATE LITERAL, AND IT DID NOT.
//
// `LEGAL_DOC_EXTENSIONS` above it documents a guarantee — the dot ends the token only
// in front of a DOCUMENT extension — and the terminator was assembled as
// `` `…|\.(?:${LEGAL_DOC_EXTENSIONS})…` ``. Inside a template literal `\.` is not an
// escape, so it collapsed to a bare `.` before the RegExp constructor ever saw it:
// the shipped pattern was <ANY ONE CHARACTER> + a document extension.
//
// Benign in the wild only by accident — real assets end in a non-document extension,
// which is why the whole `.css`/`.svg` suite above still passed. But the code was not
// providing the guarantee its own docblock stated, and one `…-html` or `…_md` path
// would have cleared both launch-blocking legal keys with no fetch anywhere in the
// path, so no content-verify could have caught it.
// ─────────────────────────────────────────────────────────────────────────────

describe("the document-extension terminator requires a LITERAL dot", () => {
  // The four verbatim reproducing inputs. Each matched before the escape was fixed.
  const REPRODUCERS: [string, "privacy" | "terms"][] = [
    ["/terms-html", "terms"],
    ["/privacy_md", "privacy"],
    ["/tos9pdf", "terms"],
    ["/privacyQtxt", "privacy"],
  ];
  for (const [href, kind] of REPRODUCERS) {
    it(`stays false — one character is not a dot: ${href}`, () => {
      expect(linksLegalDocument(`<a href="${href}">x</a>`, kind)).toBe(false);
    });
  }

  // A separator that is neither a dot nor a terminator must not open the token either.
  for (const href of ["/privacy+html", "/terms~pdf", "/privacy%2Ehtml", "/tos:txt"]) {
    it(`stays false: ${href}`, () => {
      expect(linksLegalDocument(`<a href="${href}">x</a>`, "privacy")).toBe(false);
      expect(linksLegalDocument(`<a href="${href}">x</a>`, "terms")).toBe(false);
    });
  }

  // ⚠️ The other direction. Tightening the dot must not lose the real document
  // extensions the terminator exists for — the `.pdf` terms of service and the Hacker
  // News `privacy.html` footer are both live shapes.
  it("still accepts a real dotted document, and the separator forms around it", () => {
    expect(linksLegalDocument(`<a href="/privacy.html">x</a>`, "privacy")).toBe(true);
    expect(linksLegalDocument(`<a href="/terms.pdf">x</a>`, "terms")).toBe(true);
    expect(linksLegalDocument(`<a href="privacy.html">x</a>`, "privacy")).toBe(true);
    expect(linksLegalDocument(`<a href="/help/terms-conditions.aspx?x=1">x</a>`, "terms")).toBe(true);
    // The hyphen/underscore INTERNAL separators are a different mechanism (the token
    // patterns themselves) and are untouched by the escape.
    expect(linksLegalDocument(`<a href="/terms-and-conditions">x</a>`, "terms")).toBe(true);
    expect(linksLegalDocument(`<a href="/privacy_policy">x</a>`, "privacy")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A POLICY ON ITS OWN SUBDOMAIN — the token is in the HOST, not the path.
//
// Residual false positive after the path matcher was fixed: `linksLegalDocument` only
// ever looked in the PATH, so `https://privacy.example.com` and
// `https://terms.example.com` both returned false and took a P1 launch blocker, while
// `https://legal.example.com/privacy`, `https://www.example.com/privacy` and
// `//example.com/privacy` all matched.
//
// The widening is host-scoped and needs the scanned host to be safe, so
// `linksLegalDocument` takes it as an optional third argument and
// `resolveLegalDocumentChecks` supplies it. WITHOUT it the branch declines — a missing
// argument must never be the thing that clears a release gate.
// ─────────────────────────────────────────────────────────────────────────────

describe("a policy hosted on its own subdomain is found", () => {
  const link = (href: string, kind: "privacy" | "terms", host?: string) =>
    linksLegalDocument(`<footer><a href="${href}">x</a></footer>`, kind, host);

  // The two verbatim reproducing inputs.
  it("finds https://privacy.example.com from example.com", () => {
    expect(link("https://privacy.example.com", "privacy", "example.com")).toBe(true);
  });

  it("finds https://terms.example.com from example.com", () => {
    expect(link("https://terms.example.com", "terms", "example.com")).toBe(true);
  });

  it("works from a www host, across a trailing slash and a path", () => {
    expect(link("https://privacy.example.com/", "privacy", "www.example.com")).toBe(true);
    expect(link("https://privacy.example.com/en-gb/", "privacy", "www.example.com")).toBe(true);
    expect(link("//privacy.example.com", "privacy", "www.example.com")).toBe(true);
  });

  it("reads the whole label, so the multi-word host forms match too", () => {
    expect(link("https://privacy-policy.example.com", "privacy", "example.com")).toBe(true);
    expect(link("https://privacypolicy.example.com", "privacy", "example.com")).toBe(true);
    expect(link("https://terms-of-service.example.com", "terms", "example.com")).toBe(true);
  });

  it("works under a multi-label public suffix", () => {
    expect(link("https://privacy.acme.co.uk", "privacy", "www.acme.co.uk")).toBe(true);
  });

  // ── The guards. Each of these is the way this widening buys a false PASS on a
  //    launch-blocking legal gate, so each has its own case. ──────────────────
  it("does not match a stranger's host", () => {
    expect(link("https://privacy.stranger.org", "privacy", "example.com")).toBe(false);
    expect(link("https://terms.vendor.example", "terms", "acme.com")).toBe(false);
  });

  it("does not match a label that merely STARTS with the token", () => {
    expect(link("https://privacy-blog.example.com", "privacy", "example.com")).toBe(false);
    expect(link("https://privacyhub.example.com", "privacy", "example.com")).toBe(false);
    expect(link("https://terms-glossary.example.com", "terms", "example.com")).toBe(false);
  });

  it("does not match an ordinary subdomain", () => {
    for (const host of ["blog", "cdn", "app", "api", "docs", "www", "help"]) {
      expect(link(`https://${host}.example.com`, "privacy", "example.com")).toBe(false);
      expect(link(`https://${host}.example.com`, "terms", "example.com")).toBe(false);
    }
  });

  // The page's own address is not evidence that a policy DOCUMENT is published, so
  // scanning privacy.example.com must not let every self-link satisfy the check.
  it("does not credit the scanned host to itself", () => {
    expect(link("https://privacy.example.com/about", "privacy", "privacy.example.com")).toBe(false);
    expect(link("https://privacy.example.com", "privacy", "privacy.example.com")).toBe(false);
  });

  // `registrable-domain.ts` returns null rather than guessing on an unknown suffix,
  // and `sameOrganisation` then declines — so the check cannot credit a host it could
  // not prove is the same organisation.
  it("declines when the registrable domain cannot be established", () => {
    expect(link("https://privacy.example.invalidtld", "privacy", "example.invalidtld")).toBe(false);
  });

  it("declines when no scanned host was supplied", () => {
    expect(link("https://privacy.example.com", "privacy")).toBe(false);
    expect(link("https://privacy.example.com", "privacy", "")).toBe(false);
  });

  it("only reads http(s) hosts", () => {
    expect(link("ftp://privacy.example.com", "privacy", "example.com")).toBe(false);
    expect(link("mailto:privacy@example.com", "privacy", "example.com")).toBe(false);
  });

  // A relative href has no host of its own, so it must be judged by the PATH matcher
  // only — resolving it against the scanned origin must not manufacture a host match.
  it("does not let a relative href borrow the scanned host", () => {
    expect(link("/about", "privacy", "privacy.example.com")).toBe(false);
    expect(link("/contact", "terms", "terms.example.com")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A COMMENTED-OUT FOOTER IS A REAL OBSERVED SHAPE, AND IT USED TO PASS.
//
// The matcher ran over the raw document, so an `href` a browser never renders
// satisfied a LAUNCH-BLOCKING legal gate. Commenting the footer out is what a site
// looks like halfway through a redesign — i.e. exactly the moment it genuinely has no
// reachable policy is the moment Pulse reported that it had one.
//
// Kept in THIS file, not only in the matcher's own suite, because the point of this
// file is fixtures that come from what pages actually look like rather than from the
// implementation's token list — and "the markup is there but inert" is a page shape,
// not a token variant.
// ─────────────────────────────────────────────────────────────────────────────

describe("markup a browser never renders is not a link", () => {
  const inert: { html: string; note: string }[] = [
    {
      html: '<footer><!-- <a href="/privacy-policy">Privacy</a> --></footer>',
      note: "footer link commented out mid-redesign",
    },
    {
      html: '<!-- <a href="https://privacy.example.com">old link</a> -->',
      note: "the verbatim reproducer — policy subdomain inside a comment",
    },
    {
      html: '<script>var footer = "<a href=\'/privacy-policy\'>Privacy</a>";</script>',
      note: "an href inside a string literal in a script block",
    },
    {
      html: '<template id="footer"><a href="/privacy-policy">Privacy</a></template>',
      note: "a client-side template that was never instantiated",
    },
  ];

  for (const c of inert) {
    it(`stays false — ${c.note}`, () => {
      expect(linksLegalDocument(c.html, "privacy", "example.com")).toBe(false);
    });
  }

  // ⚠️ THE OTHER DIRECTION, and the reason the strip has to be quote-aware. A real
  // footer link on a page that also carries comments and scripts — i.e. every real
  // page — must still match, and an attribute value that merely LOOKS like a comment
  // opener must not swallow the live link that follows it.
  it("still finds a live footer link on a page full of inert markup", () => {
    const html = `<!doctype html>
      <!-- deploy: 2026-08-22 -->
      <script>window.__DATA__ = {"legal":"/privacy"};</script>
      <footer>
        <a data-tpl="<!--" href="/privacy-notice">Privacy</a>
        <!-- old terms link -->
        <a href="/help/terms-conditions">Terms and conditions</a>
      </footer>
      <noscript>Enable JavaScript</noscript>`;
    expect(linksLegalDocument(html, "privacy")).toBe(true);
    expect(linksLegalDocument(html, "terms")).toBe(true);
  });
});
