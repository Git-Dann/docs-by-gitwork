import { describe, expect, it } from "vitest";
import { runSocialMarketingChecks } from "../social-marketing";
import { reclassifySpaChecks } from "@/server/pulse-lite/spa-detect";
import { CATEGORIES } from "../categories";
import type { ExtendedCheckContext, PulseScanCheckInput } from "../_types";

function context(html: string, contentHtml?: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
    ...(contentHtml !== undefined ? { contentHtml } : {}),
  };
}

async function check(html: string, key: string, contentHtml?: string) {
  const checks = await runSocialMarketingChecks(context(html, contentHtml));
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`missing ${key}`);
  return c;
}

describe("social_image_alt_coverage — empty alt is decorative, not missing", () => {
  it("passes a page whose unlabelled images are all marked decorative (stripe/cal.com shape)", async () => {
    const html = `
      <img src="https://b.stripecdn.com/mkt-ssr-statics/assets/_next/static/media/wave-fallback-desktop-1x.fba6fa88.webp" alt="" aria-hidden="true"/>
      <img loading="lazy" width="1720" height="1352" alt="" src="https://images.stripeassets.com/payment-bento-background.jpg"/>
      <img alt class="framer-LwAiI framer-1gcjq93" src="data:image/svg+xml,<svg display=&quot;block&quot; role=&quot;presentation&quot; viewBox=&quot;0 0 24 24&quot;>"/>
      <img src="/logo.svg" alt="Stripe logo">`;
    const c = await check(html, "social_image_alt_coverage");
    expect(c.status).toBe("PASS");
    expect(c.detail).toContain("4 of 4");
  });

  it("still warns when images have no alt attribute at all (baidu shape), even with alt in another attribute's value", async () => {
    const html = `
      <img src="https://pss.bdstatic.com/static/superman/img/logo/bd_logo1.png" width="270" height="129">
      <img src="https://pss.bdstatic.com/static/superman/img/qrcode/qrcode.png" title="see alt text">
      <img src="/a.png" data-alt="x">
      <img src="/b.png">
      <img src="/c.png" alt="百度一下">`;
    const c = await check(html, "social_image_alt_coverage");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("1 of 5");
  });

  it("is not vacuously PASS on a client-rendered shell", () => {
    const shellPass: PulseScanCheckInput = {
      category: CATEGORIES.SOCIAL_MARKETING,
      checkKey: "social_image_alt_coverage",
      label: "Images carry alt text",
      status: "PASS",
      detail: "No <img> tags on the page.",
    };
    const earnedPass: PulseScanCheckInput = {
      category: CATEGORIES.SOCIAL_MARKETING,
      checkKey: "social_og_title",
      label: "Share headline (og:title)",
      status: "PASS",
      detail: "36 characters.",
    };
    const [alt, title] = reclassifySpaChecks([shellPass, earnedPass]);
    expect(alt.status).toBe("INCONCLUSIVE");
    expect(title.status).toBe("PASS");
  });
});

describe("social_community_link — forums and GitHub Discussions count", () => {
  it.each([
    '<a href="https://wordpress.org/support/forums/">Support Forums</a>',
    '<a href="https://forum.squarespace.com/" target="_blank" title="Forum">Forum</a>',
    '<a href="/forum">Ask a question</a>',
    '<a href="https://github.com/orgs/community/discussions">Ask the GitHub community</a>',
    '<a href="https://github.community" class="color-fg-subtle">Community Forum</a>',
  ])("passes %s", async (html) => {
    expect((await check(html, "social_community_link")).status).toBe("PASS");
  });

  it("still warns when there is no community surface (baidu/squarespace non-community links, JS chunk names)", async () => {
    const html = `
      <a href="https://chat.baidu.com/search?pd=csaitab">文心</a>
      <a href="/solutions/nonprofits/community-groups">Community groups</a>
      <script src="/_next/static/chunks/forum-alerts-tsx-2c88307092560e7301.js"></script>
      <a href="https://www.baidu.com/more/">更多</a>`;
    const c = await check(html, "social_community_link");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("a forum");
  });
});

describe("social_headline_length — duplicated animated copies count once", () => {
  it("measures linear.app's headline once, not three times", async () => {
    const html = `<h1 class="QI8oKG_title"><span aria-hidden="true"><span class="show-mobile QI8oKG_titleLine">The product</span><span class="show-mobile"> </span><span class="show-mobile QI8oKG_titleLine">development</span><span class="show-mobile"> </span><span class="show-mobile QI8oKG_titleLine">system for teams</span><span class="show-mobile"> </span><span class="show-mobile QI8oKG_titleLine">and agents</span><span class="hide-mobile QI8oKG_titleLine">The product development</span><br class="hide-mobile"/><span class="hide-mobile QI8oKG_titleLine">system for teams and agents</span></span><span class="Fzcv4W_visuallyHidden">The product development system for teams and agents</span></h1><p>Purpose-built for planning and building products.</p>`;
    const len = await check(html, "social_headline_length");
    expect(len.status).toBe("PASS");
    expect(len.detail).toBe("51 characters.");
    expect((await check(html, "social_headline_specific")).detail).toBe('"The product development system for teams and agents"');
  });

  it("still warns on a genuinely long headline (stripe.com)", async () => {
    const html = `<h1 class="hds-heading hero-section__title"><em class="hero-section__title-main">Financial infrastructure to grow your revenue.</em> <span class="hero-section__title-copy">Accept payments, offer financial services and implement custom revenue models – from your first transaction to your billionth.</span></h1>`;
    const c = await check(html, "social_headline_length");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("173 characters");
  });
});

describe("social checks read the adopted rendered DOM", () => {
  const shell = `<!doctype html><html lang="en"><head><title>Gitwork. From prompt to production.</title></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>`;
  const rendered = `<div id="root"><h1>From prompt<br>to production.</h1><p>We take AI-built prototypes to production.</p></div>`;

  it("finds the h1 in the rendered DOM when one was adopted (gitwork.co.uk)", async () => {
    const c = await check(shell, "social_headline_specific", rendered);
    expect(c.status).toBe("PASS");
  });

  it("still reports a missing h1 when only the static HTML exists", async () => {
    const c = await check(shell, "social_headline_specific");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("No <h1>");
  });
});
