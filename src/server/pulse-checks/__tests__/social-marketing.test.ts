import { describe, expect, it } from "vitest";
import { runSocialMarketingChecks } from "../social-marketing";
import { CATEGORIES, WEIGHTED_CATEGORIES } from "../categories";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import type { ExtendedCheckContext } from "../_types";

/**
 * This family is the one place in Pulse that edges toward advice, so the tests are
 * mostly about the boundary rather than the detection.
 *
 * Two rules hold it in place and both are asserted below: it can never FAIL, and its
 * category carries no score weight. A scanner cannot see who a business sells to, so
 * "no TikTok link" is an observation, not a defect — scoring a launch readiness number
 * against it would make that number mean something it does not.
 */

function context(html: string, platform = "WEB_APP"): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform,
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

const statusOf = (checks: { checkKey: string; status: string }[], key: string) =>
  checks.find((c) => c.checkKey === key)?.status;
const detailOf = (checks: { checkKey: string; detail?: string }[], key: string) =>
  checks.find((c) => c.checkKey === key)?.detail ?? "";

/** A page that gets everything right — the control for every negative case below. */
const GOOD = `
  <meta property="og:image" content="https://example.test/card.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:title" content="Pulse — production-readiness in one scan">
  <meta property="og:description" content="Pulse checks a live site against sixteen hundred production-readiness controls and tells you what it could not establish.">
  <meta name="twitter:card" content="summary_large_image">
  <a href="https://instagram.com/gitwork">Instagram</a>
  <a href="https://www.tiktok.com/@gitwork">TikTok</a>
  <script type="application/ld+json">{"@type":"Organization","sameAs":["https://instagram.com/gitwork"]}</script>
  <button aria-label="Share this report">Share</button>
  <img src="a.png" alt="A chart">
`;

describe("the boundary this family must not cross", () => {
  it("never reports a FAIL, whatever the page does", async () => {
    // A page with nothing at all is the worst case, and it still cannot fail. Marketing
    // choices are not defects, and a FAIL here would reach the release decision.
    for (const html of ["", "<html><body>Hello</body></html>", GOOD]) {
      const checks = await runSocialMarketingChecks(context(html));
      const failed = checks.filter((c) => c.status === "FAIL");
      expect(
        failed.map((c) => c.checkKey),
        "social observations must never fail — see the header of social-marketing.ts",
      ).toEqual([]);
    }
  });

  it("carries no score weight", async () => {
    // score-breakdown.ts and priority.ts both read WEIGHTED_CATEGORIES, so this set is
    // literally what keeps a missing Instagram link out of the readiness number.
    expect(WEIGHTED_CATEGORIES.has(CATEGORIES.SOCIAL_MARKETING)).toBe(false);
  });

  it("registers every key it emits, and emits every key it registers", async () => {
    const emitted = (await runSocialMarketingChecks(context(GOOD))).map((c) => c.checkKey).sort();
    const registered = CHECKS_REGISTRY
      .filter((c) => c.category === CATEGORIES.SOCIAL_MARKETING)
      .map((c) => c.key)
      .sort();
    expect(emitted).toEqual(registered);
    expect(emitted.length).toBeGreaterThan(0);
  });

  it("skips entirely for something with no page to share", async () => {
    const checks = await runSocialMarketingChecks(context(GOOD, "CLI_TOOL"));
    expect(checks.every((c) => c.status === "SKIPPED")).toBe(true);
  });
});

describe("the link preview", () => {
  it("passes a well-formed card", async () => {
    const checks = await runSocialMarketingChecks(context(GOOD));
    for (const key of ["social_og_image_present", "social_og_image_size", "social_og_title", "social_og_description", "social_twitter_card"]) {
      expect(statusOf(checks, key), key).toBe("PASS");
    }
  });

  it("warns on a bare page and says what to do", async () => {
    const checks = await runSocialMarketingChecks(context("<html><body>Hi</body></html>"));
    expect(statusOf(checks, "social_og_image_present")).toBe("WARN");
    expect(detailOf(checks, "social_og_image_present")).toContain("1200×630");
  });

  it("does not claim a small image when the size was never declared", async () => {
    // Declared dimensions are the only size evidence available without fetching the
    // file. Absent, the honest answer is "could not establish" — and this family has no
    // INCONCLUSIVE, so it must pass rather than invent an undersized image.
    const checks = await runSocialMarketingChecks(
      context(`<meta property="og:image" content="https://example.test/card.png">`),
    );
    expect(statusOf(checks, "social_og_image_size")).toBe("PASS");
    expect(detailOf(checks, "social_og_image_size")).toMatch(/not declared|could not be established/i);
  });

  it("warns on an image declared below 1200×630", async () => {
    const checks = await runSocialMarketingChecks(context(`
      <meta property="og:image" content="https://example.test/card.png">
      <meta property="og:image:width" content="600">
      <meta property="og:image:height" content="315">
    `));
    expect(statusOf(checks, "social_og_image_size")).toBe("WARN");
    expect(detailOf(checks, "social_og_image_size")).toContain("600×315");
  });

  it("warns on a headline that will be cut mid-sentence", async () => {
    const long = "A".repeat(80);
    const checks = await runSocialMarketingChecks(context(`<meta property="og:title" content="${long}">`));
    expect(statusOf(checks, "social_og_title")).toBe("WARN");
    expect(detailOf(checks, "social_og_title")).toContain("80 characters");
  });

  it("warns on a description too short to earn a click, and one that will truncate", async () => {
    const short = await runSocialMarketingChecks(context(`<meta property="og:description" content="Hello.">`));
    expect(statusOf(short, "social_og_description")).toBe("WARN");
    const long = await runSocialMarketingChecks(
      context(`<meta property="og:description" content="${"B".repeat(250)}">`),
    );
    expect(statusOf(long, "social_og_description")).toBe("WARN");
  });

  it("falls back to the twitter:* equivalents", async () => {
    // A page that only ships Twitter cards has still supplied a headline; reporting it
    // as absent would send someone to fix something that is already there.
    const checks = await runSocialMarketingChecks(context(`
      <meta name="twitter:title" content="Pulse — one scan, no guesswork">
      <meta name="twitter:description" content="Sixteen hundred controls against a live site, and an honest list of what could not be established.">
    `));
    expect(statusOf(checks, "social_og_title")).toBe("PASS");
    expect(statusOf(checks, "social_og_description")).toBe("PASS");
  });

  it("warns on the small-thumbnail card type", async () => {
    const checks = await runSocialMarketingChecks(context(`<meta name="twitter:card" content="summary">`));
    expect(statusOf(checks, "social_twitter_card")).toBe("WARN");
    expect(detailOf(checks, "social_twitter_card")).toContain("summary_large_image");
  });
});

describe("where the audience is", () => {
  it("names the networks it found rather than just passing", async () => {
    const checks = await runSocialMarketingChecks(context(`
      <a href="https://uk.linkedin.com/company/gitwork">LinkedIn</a>
      <a href="https://x.com/gitwork">X</a>
    `));
    expect(statusOf(checks, "social_profiles_linked")).toBe("PASS");
    expect(detailOf(checks, "social_profiles_linked")).toContain("LinkedIn");
    expect(detailOf(checks, "social_profiles_linked")).toContain("X / Twitter");
  });

  it("treats LinkedIn and X as present but NOT as short-form video", async () => {
    // The distinction is the whole point of the second check: a B2B site with a
    // LinkedIn page has social presence and no short-form reach, and those are
    // different conversations.
    const checks = await runSocialMarketingChecks(context(`
      <a href="https://uk.linkedin.com/company/gitwork">LinkedIn</a>
    `));
    expect(statusOf(checks, "social_profiles_linked")).toBe("PASS");
    expect(statusOf(checks, "social_short_form_video")).toBe("WARN");
    expect(detailOf(checks, "social_short_form_video")).toMatch(/TikTok/);
  });

  it("counts TikTok, Instagram and YouTube as short-form", async () => {
    for (const href of [
      "https://www.tiktok.com/@gitwork",
      "https://instagram.com/gitwork",
      "https://www.youtube.com/@gitwork",
    ]) {
      const checks = await runSocialMarketingChecks(context(`<a href="${href}">x</a>`));
      expect(statusOf(checks, "social_short_form_video"), href).toBe("PASS");
    }
  });

  it("only asks for sameAs once there are profiles to declare", async () => {
    // Telling a site with no social accounts to declare them in schema is noise.
    const none = await runSocialMarketingChecks(context("<html><body>Hi</body></html>"));
    expect(statusOf(none, "social_schema_sameas")).toBe("PASS");

    const linkedOnly = await runSocialMarketingChecks(
      context(`<a href="https://instagram.com/gitwork">Instagram</a>`),
    );
    expect(statusOf(linkedOnly, "social_schema_sameas")).toBe("WARN");
  });
});

describe("share affordance and alt text", () => {
  it("recognises the several shapes a share control takes", async () => {
    for (const html of [
      `<a href="https://twitter.com/intent/tweet?url=x">Tweet</a>`,
      `<a href="https://www.linkedin.com/shareArticle?url=x">Share</a>`,
      `<script>navigator.share({url})</script>`,
      `<button aria-label="Share this page"></button>`,
    ]) {
      expect(statusOf(await runSocialMarketingChecks(context(html)), "social_share_affordance"), html).toBe("PASS");
    }
  });

  it("measures alt text as a ratio, not a presence", async () => {
    // One alt attribute on a page of twenty images is not coverage — the same mistake
    // ios_dynamic_type shipped with (CLAUDE.md §34.3).
    const mostly = `<img src="a" alt="a"><img src="b" alt="b"><img src="c" alt="c"><img src="d" alt="d"><img src="e">`;
    expect(statusOf(await runSocialMarketingChecks(context(mostly)), "social_image_alt_coverage")).toBe("PASS");

    const barely = `<img src="a" alt="a">${"<img src=\"x\">".repeat(9)}`;
    const checks = await runSocialMarketingChecks(context(barely));
    expect(statusOf(checks, "social_image_alt_coverage")).toBe("WARN");
    expect(detailOf(checks, "social_image_alt_coverage")).toContain("1 of 10");
  });

  it("does not grade a page with no images", async () => {
    const checks = await runSocialMarketingChecks(context("<html><body>Text only</body></html>"));
    expect(statusOf(checks, "social_image_alt_coverage")).toBe("PASS");
  });
});

describe("the share card, completely", () => {
  it("catches a square image that PASSES the size check", async () => {
    // 1200×1200 clears the ≥1200×630 floor and is still wrong: every network
    // centre-crops to ~1.91:1, so the headline at the top of the image is cut off.
    // This is the case the size check cannot see, which is why the ratio is its own.
    const checks = await runSocialMarketingChecks(context(`
      <meta property="og:image" content="https://example.test/card.png">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="1200">
    `));
    expect(statusOf(checks, "social_og_image_size")).toBe("PASS");
    expect(statusOf(checks, "social_og_image_ratio")).toBe("WARN");
    expect(detailOf(checks, "social_og_image_ratio")).toContain("1.00:1");
  });

  it("accepts the shapes networks actually render", async () => {
    for (const [w, h] of [[1200, 630], [1920, 1005], [1200, 675]]) {
      const checks = await runSocialMarketingChecks(context(`
        <meta property="og:image" content="https://example.test/c.png">
        <meta property="og:image:width" content="${w}">
        <meta property="og:image:height" content="${h}">
      `));
      expect(statusOf(checks, "social_og_image_ratio"), `${w}x${h}`).toBe("PASS");
    }
  });

  it("flags a relative share image — the commonest silently-broken card", async () => {
    const rel = await runSocialMarketingChecks(
      context(`<meta property="og:image" content="/images/card.png">`),
    );
    expect(statusOf(rel, "social_og_image_absolute")).toBe("WARN");

    // Protocol-relative is fine; scrapers resolve it.
    const proto = await runSocialMarketingChecks(
      context(`<meta property="og:image" content="//cdn.example.test/card.png">`),
    );
    expect(statusOf(proto, "social_og_image_absolute")).toBe("PASS");
  });

  it("warns on image formats scrapers drop rather than degrade", async () => {
    for (const ext of ["webp", "avif", "svg"]) {
      const c = await runSocialMarketingChecks(
        context(`<meta property="og:image" content="https://e.test/c.${ext}">`),
      );
      expect(statusOf(c, "social_og_image_format"), ext).toBe("WARN");
    }
    for (const ext of ["png", "jpg", "jpeg"]) {
      const c = await runSocialMarketingChecks(
        context(`<meta property="og:image" content="https://e.test/c.${ext}">`),
      );
      expect(statusOf(c, "social_og_image_format"), ext).toBe("PASS");
    }
  });

  it("ignores a query string when reading the format", async () => {
    const c = await runSocialMarketingChecks(
      context(`<meta property="og:image" content="https://e.test/c.png?v=2&w=1200">`),
    );
    expect(statusOf(c, "social_og_image_format")).toBe("PASS");
  });

  it("only compares og:url and canonical when BOTH are present", async () => {
    const one = await runSocialMarketingChecks(
      context(`<meta property="og:url" content="https://e.test/a">`),
    );
    expect(statusOf(one, "social_og_canonical_agree")).toBe("PASS");

    const agree = await runSocialMarketingChecks(context(`
      <meta property="og:url" content="https://e.test/a/">
      <link rel="canonical" href="https://e.test/a">
    `));
    expect(statusOf(agree, "social_og_canonical_agree"), "a trailing slash is not a disagreement").toBe("PASS");

    const differ = await runSocialMarketingChecks(context(`
      <meta property="og:url" content="https://e.test/a">
      <link rel="canonical" href="https://e.test/b">
    `));
    expect(statusOf(differ, "social_og_canonical_agree")).toBe("WARN");
  });
});

describe("measurement", () => {
  it("does not ask for consent mode when there is no pixel to consent to", async () => {
    // Otherwise every site with no advertising carries a permanent EEA-compliance
    // warning about machinery it does not run.
    const none = await runSocialMarketingChecks(context("<html><body>Hi</body></html>"));
    expect(statusOf(none, "social_ad_pixel")).toBe("WARN");
    expect(statusOf(none, "social_consent_mode")).toBe("PASS");
  });

  it("asks for it once a pixel is installed", async () => {
    const pixel = await runSocialMarketingChecks(
      context(`<script>fbq('init','1');</script>`),
    );
    expect(statusOf(pixel, "social_ad_pixel")).toBe("PASS");
    expect(statusOf(pixel, "social_consent_mode")).toBe("WARN");

    const both = await runSocialMarketingChecks(context(`
      <script>gtag('consent','default',{ad_storage:'denied'});fbq('init','1');</script>
    `));
    expect(statusOf(both, "social_consent_mode")).toBe("PASS");
  });

  it("names which pixels it found", async () => {
    const c = await runSocialMarketingChecks(context(`
      <script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>
      <script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>
    `));
    expect(detailOf(c, "social_ad_pixel")).toContain("TikTok");
    expect(detailOf(c, "social_ad_pixel")).toContain("LinkedIn");
  });

  it("distinguishes an event from a page view", async () => {
    const pv = await runSocialMarketingChecks(
      context(`<script src="https://www.googletagmanager.com/gtag/js"></script>`),
    );
    expect(statusOf(pv, "social_event_tracking")).toBe("WARN");
    const ev = await runSocialMarketingChecks(
      context(`<script>gtag('event','sign_up');</script>`),
    );
    expect(statusOf(ev, "social_event_tracking")).toBe("PASS");
  });

  it("flags a canonical carrying a query string", async () => {
    const dirty = await runSocialMarketingChecks(
      context(`<link rel="canonical" href="https://e.test/p?utm_source=x">`),
    );
    expect(statusOf(dirty, "social_campaign_landing")).toBe("WARN");
    const clean = await runSocialMarketingChecks(
      context(`<link rel="canonical" href="https://e.test/p">`),
    );
    expect(statusOf(clean, "social_campaign_landing")).toBe("PASS");
  });
});

describe("the copy", () => {
  it("calls out a headline that says nothing", async () => {
    for (const h of ["Home", "Welcome", "Coming soon", "welcome to our website"]) {
      const c = await runSocialMarketingChecks(context(`<h1>${h}</h1>`));
      expect(statusOf(c, "social_headline_specific"), h).toBe("WARN");
    }
    const good = await runSocialMarketingChecks(
      context("<h1>Production-readiness for AI-built software</h1>"),
    );
    expect(statusOf(good, "social_headline_specific")).toBe("PASS");
  });

  it("reads the headline through its inline markup", async () => {
    // A headline is almost never bare text — it carries a <span> for the accent word.
    const c = await runSocialMarketingChecks(
      context("<h1>Ship <span class='x'>production-ready</span> software</h1>"),
    );
    expect(statusOf(c, "social_headline_specific")).toBe("PASS");
    expect(detailOf(c, "social_headline_specific")).toContain("Ship production-ready software");
  });

  it("flags search and social copy that are the same sentence", async () => {
    const same = "Pulse checks your site against sixteen hundred production controls today.";
    const dup = await runSocialMarketingChecks(context(`
      <meta name="description" content="${same}">
      <meta property="og:description" content="${same}">
    `));
    expect(statusOf(dup, "social_description_distinct")).toBe("WARN");

    const differ = await runSocialMarketingChecks(context(`
      <meta name="description" content="${same}">
      <meta property="og:description" content="A different line written for a feed reader.">
    `));
    expect(statusOf(differ, "social_description_distinct")).toBe("PASS");
  });

  it("does not claim a duplicate when only one description exists", async () => {
    const c = await runSocialMarketingChecks(
      context(`<meta name="description" content="Only one of the two is set here.">`),
    );
    expect(statusOf(c, "social_description_distinct")).toBe("PASS");
  });

  it("sees a subheading through the wrappers a real page puts between them", async () => {
    const wrapped = await runSocialMarketingChecks(
      context("<h1>A headline</h1><div><p>The supporting line.</p>"),
    );
    expect(statusOf(wrapped, "social_hero_subhead")).toBe("PASS");
    const bare = await runSocialMarketingChecks(
      context("<h1>A headline</h1><img src='x.png' alt='y'>"),
    );
    expect(statusOf(bare, "social_hero_subhead")).toBe("WARN");
  });
});

describe("structured data and distribution", () => {
  it("reads @type from an array as well as a string", async () => {
    // schema.org allows both, and a page using the array form is not missing the type.
    const arr = await runSocialMarketingChecks(
      context(`<script type="application/ld+json">{"@type":["FAQPage","WebPage"]}</script>`),
    );
    expect(statusOf(arr, "social_faq_schema")).toBe("PASS");
  });

  it("wants a logo INSIDE Organization, not any logo anywhere", async () => {
    const withLogo = await runSocialMarketingChecks(context(
      `<script type="application/ld+json">{"@type":"Organization","name":"X","logo":"https://e.test/l.png"}</script>`,
    ));
    expect(statusOf(withLogo, "social_org_logo_schema")).toBe("PASS");
    const without = await runSocialMarketingChecks(context(
      `<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>`,
    ));
    expect(statusOf(without, "social_org_logo_schema")).toBe("WARN");
  });

  it("finds app store, community and review links", async () => {
    const c = await runSocialMarketingChecks(context(`
      <a href="https://apps.apple.com/gb/app/x/id1">iOS</a>
      <a href="https://discord.gg/abc">Discord</a>
      <a href="https://www.g2.com/products/x/reviews">G2</a>
    `));
    expect(statusOf(c, "social_app_store_link")).toBe("PASS");
    expect(statusOf(c, "social_community_link")).toBe("PASS");
    expect(statusOf(c, "social_review_platform")).toBe("PASS");
  });
});
