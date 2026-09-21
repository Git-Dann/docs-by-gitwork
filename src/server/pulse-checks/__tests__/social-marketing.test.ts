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
