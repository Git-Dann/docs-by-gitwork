import { describe, expect, it } from "vitest";

import {
  checkAppliesToMarkets,
  countAdvertisedLocales,
  detectMarketEvidence,
  detectMarketsFromPage,
  documentLanguage,
  stripNonMarketContext,
} from "../jurisdictions";

/**
 * Item 16 of the false-positive audit: jurisdiction inference matched a locale
 * switcher label and then switched real compliance checks OFF.
 *
 * The direction of harm is what these tests are shaped around. `applyJurisdictionFilter`
 * (pulse-scan.ts) filters nothing when the market set is EMPTY and rewrites every
 * out-of-market check to SKIPPED when it is not — so an empty result is fail-safe, a
 * superset is merely noisy, and a small WRONG set silently deletes whole bodies of law
 * from the report. Every assertion below is either "abstains" or "does not shrink".
 */

/** The real shape from developer.mozilla.org: a Next.js JSON payload carrying every
 *  locale's endonym, HTML-escaped, inside a <script type="application/json">. */
const MDN_LOCALE_PAYLOAD = `<!doctype html>
<html lang="en-US">
<head>
  <title>MDN Web Docs</title>
  <link rel="alternate" hreflang="pt-BR" href="https://developer.mozilla.org/pt-BR/">
  <link rel="alternate" hreflang="ru" href="https://developer.mozilla.org/ru/">
  <link rel="alternate" hreflang="ja" href="https://developer.mozilla.org/ja/">
  <link rel="alternate" hreflang="zh-CN" href="https://developer.mozilla.org/zh-CN/">
  <link rel="alternate" hreflang="fr" href="https://developer.mozilla.org/fr/">
  <link rel="alternate" hreflang="de" href="https://developer.mozilla.org/de/">
  <link rel="alternate" hreflang="es" href="https://developer.mozilla.org/es/">
  <link rel="alternate" hreflang="ko" href="https://developer.mozilla.org/ko/">
</head>
<body>
  <main><h1>Resources for developers, by developers</h1></main>
  <script id="__NEXT_DATA__" type="application/json">
  {"props":{"locales":[{"locale":"en-US","native":"English (US)"},{"locale":"pt-BR",&quot;native&quot;:&quot;Português (do Brasil)&quot;},{&quot;locale&quot;:&quot;ru&quot;,&quot;native&quot;:&quot;Русский&quot;},{"locale":"ja","native":"日本語"},{"locale":"zh-CN","native":"中文 (简体)"}]}}
  </script>
</body></html>`;

describe("detectMarketsFromPage — context (rule 1)", () => {
  it("does not infer Brazil from a locale endonym inside a script payload (MDN)", () => {
    const markets = detectMarketsFromPage({
      hostname: "developer.mozilla.org",
      html: MDN_LOCALE_PAYLOAD,
      htmlLower: MDN_LOCALE_PAYLOAD.toLowerCase(),
    });
    expect(markets).not.toContain("BR");
  });

  it("abstains entirely on MDN, so CCPA and EU VAT stay applicable", () => {
    const ev = detectMarketEvidence({ hostname: "developer.mozilla.org", html: MDN_LOCALE_PAYLOAD });
    expect(ev.markets).toEqual([]);
    // ⚠️ "no-anchor", not "multi-locale", and the difference is the whole point of
    // the second remediation pass. The first fix let `<html lang="en-US">` ANCHOR
    // the US, so MDN was rescued only by its eight hreflang alternates tripping
    // MULTI_LOCALE_BREADTH — an uncalibrated constant. The document language is now
    // corroboration, so MDN has no anchor at all and rule 2a catches it. See the
    // "one hreflang alternate away" test below for why that matters.
    expect(ev.abstainedReason).toBe("no-anchor");
    expect(ev.anchored).toEqual([]);
    // The exact regression: the report told MDN these were "not applicable to your
    // selected markets (BR)".
    expect(checkAppliesToMarkets("ccpa_compliance", ev.markets)).toBe(true);
    expect(checkAppliesToMarkets("eu_vat", ev.markets)).toBe(true);
    expect(checkAppliesToMarkets("gdpr_article13_notice", ev.markets)).toBe(true);
  });

  it("still abstains on MDN with all but one hreflang alternate removed", () => {
    // FN-1c: the first fix's protection rested entirely on MULTI_LOCALE_BREADTH=3,
    // so the reported site was one <link> tag away from being mis-scoped to ["US"]
    // again. Strip the breadth signal down below the threshold and the verdict must
    // not move.
    const thin = MDN_LOCALE_PAYLOAD
      .replace(/<link rel="alternate"[^>]*>\n?/g, "")
      .replace(/<script id="__NEXT_DATA__"[\s\S]*?<\/script>/, "");
    const ev = detectMarketEvidence({ hostname: "developer.mozilla.org", html: thin });
    expect(ev.advertisedLocales).toBeLessThan(3);
    expect(ev.markets).toEqual([]);
    expect(ev.abstainedReason).toBe("no-anchor");
  });

  it("strips script, style, template, comment and data-payload regions", () => {
    const html = `<html lang="en"><body>
      <script>var l = "brasil";</script>
      <style>/* brasil */</style>
      <template><span>brasil</span></template>
      <!-- brasil -->
      <div data-page="{&quot;country&quot;:&quot;brasil&quot;}">ok</div>
    </body></html>`;
    expect(stripNonMarketContext(html).toLowerCase()).not.toContain("brasil");
  });

  it("strips locale-switcher labels but keeps ordinary prose", () => {
    const html = `<html lang="en"><body>
      <a hreflang="pt-BR" href="/pt-BR/">Português (do Brasil)</a>
      <select><option value="ja">日本語</option><option lang="ko">한국어</option></select>
      <p>We are registered in the United Kingdom.</p>
    </body></html>`;
    const prose = stripNonMarketContext(html).toLowerCase();
    expect(prose).not.toContain("brasil");
    expect(prose).toContain("united kingdom");
  });

  it("reads the document language only from the <html> tag, not any lang= attribute", () => {
    // The old form was /lang=["']pt/i over the whole page, which a switcher satisfies.
    const html = `<html lang="en-GB"><body><option lang="pt">Português</option></body></html>`;
    expect(documentLanguage(html)).toBe("en-gb");
    expect(detectMarketEvidence({ hostname: "example.com", html }).markets).not.toContain("BR");
  });
});

describe("detectMarketsFromPage — corroboration (rule 2)", () => {
  it("abstains when a country name in prose is the only evidence", () => {
    const html = `<html lang="en"><body><p>Our support team covers Canada and Japan.</p></body></html>`;
    const ev = detectMarketEvidence({ hostname: "example.com", html });
    expect(ev.mentioned).toEqual(expect.arrayContaining(["CA", "JP"]));
    expect(ev.anchored).toEqual([]);
    expect(ev.markets).toEqual([]);
    expect(ev.abstainedReason).toBe("no-anchor");
  });

  it("never reduces a multi-locale site to a single market", () => {
    const html = `<html lang="de-DE"><head>
      <link rel="alternate" hreflang="de" href="/de/">
      <link rel="alternate" hreflang="fr" href="/fr/">
      <link rel="alternate" hreflang="ja" href="/ja/">
      </head><body><p>Preise ab 10 EUR</p></body></html>`;
    const ev = detectMarketEvidence({ hostname: "beispiel.de", html });
    expect(ev.anchored).toContain("EU");
    expect(ev.advertisedLocales).toBeGreaterThanOrEqual(3);
    expect(ev.markets).toEqual([]);
    expect(ev.abstainedReason).toBe("multi-locale");
  });

  it("counts locales by primary subtag, so en/en-GB/en-US is one language", () => {
    const html = `<html lang="en-GB"><head>
      <link rel="alternate" hreflang="x-default" href="/">
      <link rel="alternate" hreflang="en" href="/">
      <link rel="alternate" hreflang="en-GB" href="/gb/">
      <link rel="alternate" hreflang="en-US" href="/us/">
      </head><body><p>Prices in £</p></body></html>`;
    expect(countAdvertisedLocales(html)).toBe(1);
    // A single-language site with a hard anchor is still allowed to scope.
    expect(detectMarketEvidence({ hostname: "example.co.uk", html }).markets).toContain("UK");
  });

  it("still scopes a single-market site with a hard anchor (the feature must survive)", () => {
    const html = `<html lang="en-GB"><body><p>Gitwork Group Ltd — prices in £ GBP.</p></body></html>`;
    const ev = detectMarketEvidence({ hostname: "gitwork.co.uk", html });
    expect(ev.markets).toEqual(["UK"]);
    expect(ev.abstainedReason).toBeUndefined();
    expect(checkAppliesToMarkets("uk_pecr_cookie_law", ev.markets)).toBe(true);
  });

  it("returns the union of anchored and mentioned markets, never just the anchors", () => {
    // Widening is safe (more checks run); narrowing is what deletes findings.
    const html = `<html lang="en-GB"><body><p>Prices in £. We also serve Australia and Canada.</p></body></html>`;
    const ev = detectMarketEvidence({ hostname: "example.co.uk", html });
    expect(ev.markets).toEqual(expect.arrayContaining(["UK", "AU", "CA"]));
  });

  it("abstains when there is no signal at all", () => {
    const html = `<html><body><p>Hello.</p></body></html>`;
    const ev = detectMarketEvidence({ hostname: "example.com", html });
    expect(ev.markets).toEqual([]);
    expect(ev.abstainedReason).toBe("no-signal");
  });

  it("treats {US, US-CA} as one country for the multi-locale rule", () => {
    // A parent+child pair is a single market, so it must not escape rule 2b.
    const html = `<html lang="en-US"><head>
      <link rel="alternate" hreflang="en" href="/">
      <link rel="alternate" hreflang="es" href="/es/">
      <link rel="alternate" hreflang="ja" href="/ja/">
      </head><body><p>California residents: see our CCPA notice.</p></body></html>`;
    const ev = detectMarketEvidence({ hostname: "example.com", html });
    expect(ev.anchored).toEqual(expect.arrayContaining(["US", "US-CA"]));
    expect(ev.markets).toEqual([]);
    expect(ev.abstainedReason).toBe("multi-locale");
  });
});

/**
 * FN-1 of the adversarial review. The first remediation pass replaced the page-wide
 * `/lang=["']xx/` match with the `<html>` element's own `lang` — correct as far as it
 * went — and then promoted that value to an ANCHOR, which the old code never had. An
 * anchor alone narrows, so `<html lang="en-US">` on a `.com` with no other signal
 * scoped the scan to ["US"] and rewrote 46 of the 55 jurisdiction-tagged checks to
 * "not applicable", including all 11 GDPR checks and `cookie_consent_granular` — a
 * finding the audit lists under "verified CORRECT".
 *
 * `lang="en-US"` is the default in WordPress and most scaffolds, so this is WEAKER
 * evidence than the `brasil` string that caused item 16 in the first place.
 */
describe("the document language must never narrow the market set on its own", () => {
  const BARE = (lang: string) =>
    `<!doctype html><html lang="${lang}"><head><title>My App</title></head>`
    + `<body><h1>Welcome</h1><p>Sign up today.</p></body></html>`;

  it.each([
    ["en-US", "example.com"],
    ["es", "ejemplo.mx"],
    ["de-CH", "beispiel.ch"],
    ["fr", "exemple.sn"],
    ["en-GB", "example.com"],
    ["ja", "example.com"],
    ["pt", "exemplo.com"],
  ])("lang=%s on %s abstains rather than scoping", (lang, hostname) => {
    const ev = detectMarketEvidence({ hostname, html: BARE(lang) });
    // Direction 1 — it must not narrow.
    expect(ev.markets).toEqual([]);
    expect(ev.anchored).toEqual([]);
    expect(ev.abstainedReason).toBe("no-anchor");
    // …and therefore every body of law still runs. This is the invisible harm: a
    // dropped check reads as "not applicable", not as a wrong finding.
    expect(checkAppliesToMarkets("gdpr_article13_notice", ev.markets)).toBe(true);
    expect(checkAppliesToMarkets("cookie_consent_granular", ev.markets)).toBe(true);
    expect(checkAppliesToMarkets("ccpa_compliance", ev.markets)).toBe(true);
    expect(checkAppliesToMarkets("lgpd_brazil", ev.markets)).toBe(true);
  });

  it("records the language as corroboration, so the evidence is still visible", () => {
    // Direction 2 — demoted, not deleted. It is reported in `mentioned`, which is
    // what lets an anchored set WIDEN (safe) without ever letting it shrink.
    const ev = detectMarketEvidence({ hostname: "example.com", html: BARE("en-US") });
    expect(ev.mentioned).toContain("US");
    expect(ev.anchored).not.toContain("US");
  });

  it("a language subtag beside a real anchor widens, and does not replace it", () => {
    // .uk + £ anchors the UK; lang="ja" corroborates Japan. The union runs both, so
    // no law is dropped — widening is the safe direction.
    const html = `<html lang="ja"><body><p>Prices in £.</p></body></html>`;
    const ev = detectMarketEvidence({ hostname: "example.co.uk", html });
    expect(ev.anchored).toEqual(["UK"]);
    expect(ev.markets).toEqual(expect.arrayContaining(["UK", "JP"]));
  });

  it("a hard anchor still scopes with no language at all (the feature survives)", () => {
    const html = `<html><body><p>Gitwork Group Ltd — prices in £ GBP.</p></body></html>`;
    expect(detectMarketEvidence({ hostname: "gitwork.co.uk", html }).markets).toEqual(["UK"]);
  });
});

describe("detectMarketsFromPage — regressions the fix must not introduce", () => {
  it("does not anchor Canada on the word CAD (computer-aided design)", () => {
    const html = `<html lang="en"><body><p>Import your CAD drawings.</p></body></html>`;
    expect(detectMarketEvidence({ hostname: "example.com", html }).anchored).not.toContain("CA");
  });

  it("pt-PT anchors the EU without also anchoring Brazil", () => {
    const html = `<html lang="pt-PT"><body><p>Preços em €.</p></body></html>`;
    const ev = detectMarketEvidence({ hostname: "exemplo.pt", html });
    expect(ev.anchored).toContain("EU");
    expect(ev.anchored).not.toContain("BR");
  });

  it("a genuine Brazilian site is still detected", () => {
    const html = `<html lang="pt-BR"><body><p>Política de privacidade — LGPD.</p></body></html>`;
    expect(detectMarketEvidence({ hostname: "exemplo.com.br", html }).markets).toContain("BR");
  });
});
