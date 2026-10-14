import { describe, expect, it } from "vitest";
import { runSocialMarketingChecks } from "../social-marketing";
import type { ExtendedCheckContext } from "../_types";

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

async function check(html: string, key: string) {
  const checks = await runSocialMarketingChecks(context(html));
  const c = checks.find((x) => x.checkKey === key);
  return { status: c?.status, detail: c?.detail ?? "" };
}

describe("social_tag_manager", () => {
  it("recognises Adobe Launch loaded from config (target.com)", async () => {
    const html = `<script>window.__DYNAMIC_CONFIG__ = JSON.parse("{\\"ADOBE_TAG_MANAGER\\":{\\"scriptURL\\":\\"https://assets.adobedtm.com/92025c83a551/2653a632bdc7/launch-270dfdaa71b7.min.js\\"}}")</script>`;
    expect((await check(html, "social_tag_manager")).status).toBe("PASS");
  });

  it("recognises a GTM container seen only through its noscript iframe (webflow.com)", async () => {
    const html = `<!-- Google Tag Manager (noscript) -->\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-55XXQM3F" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
    expect((await check(html, "social_tag_manager")).status).toBe("PASS");
  });

  it("recognises Tealium", async () => {
    const html = `<script src="//tags.tiqcdn.com/utag/acme/main/prod/utag.js"></script>`;
    expect((await check(html, "social_tag_manager")).status).toBe("PASS");
  });

  it("still recognises the standard GTM snippet and Segment", async () => {
    const gtm = `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',"GTM-TH8KRSBJ");</script>`;
    expect((await check(gtm, "social_tag_manager")).status).toBe("PASS");
    const seg = `<script>analytics.load=function(key){var t=document.createElement("script");t.src="https://cdn.segment.com/analytics.js/v1/" + key + "/analytics.min.js";}</script>`;
    expect((await check(seg, "social_tag_manager")).status).toBe("PASS");
  });

  it("does not treat a vendor SDK or legacy GA analytics.js as a tag manager", async () => {
    const iterable = `<script>b.src = ('https:' == document.location.protocol ? 'https://' : 'http://') + 'js.iterable.com/analytics.js';</script>`;
    expect((await check(iterable, "social_tag_manager")).status).toBe("WARN");
    const ga = `<script async src="https://www.google-analytics.com/analytics.js"></script>`;
    expect((await check(ga, "social_tag_manager")).status).toBe("WARN");
  });

  it("warns when no tag manager is present (linear.app-like page)", async () => {
    const html = `<button aria-label="Delegate to an agent" class="KFZpfa_splitSegment"></button><script src="/_next/static/chunks/main.js"></script>`;
    expect((await check(html, "social_tag_manager")).status).toBe("WARN");
  });
});

describe("social_title_length", () => {
  it("measures the displayed title, not the entity-encoded source (abc.net.au)", async () => {
    const r = await check(`<title>ABC News &amp; Headlines – Australian Broadcasting Corporation</title>`, "social_title_length");
    expect(r.status).toBe("PASS");
    expect(r.detail).toBe("58 characters.");
  });

  it("collapses indentation inside the title tag", async () => {
    const r = await check(`<title>\n      Linear – The system for product development\n    </title>`, "social_title_length");
    expect(r.status).toBe("PASS");
    expect(r.detail).toBe("43 characters.");
  });

  it("still warns on a genuinely long title (github.com)", async () => {
    const r = await check(`<title>GitHub · Change is constant. GitHub keeps you ahead. · GitHub · GitHub</title>`, "social_title_length");
    expect(r.status).toBe("WARN");
    expect(r.detail).toContain("70 characters");
  });

  it("still warns on a long title that contains entities (flipkart.com)", async () => {
    const r = await check(`<title>Online Shopping India Mobile, Cameras, Lifestyle &amp; more Online @ Flipkart.com</title>`, "social_title_length");
    expect(r.status).toBe("WARN");
    expect(r.detail).toContain("77 characters");
  });

  it("does not throw on an out-of-range numeric entity", async () => {
    const r = await check(`<title>Acme &#99999999; Widgets for every workshop</title>`, "social_title_length");
    expect(r.status).toBeDefined();
  });
});

describe("social_twitter_card", () => {
  it("does not promise a thumbnail when the page has no share image (theguardian.com/uk)", async () => {
    const r = await check(`<meta name="twitter:dnt" content="on"><title>Latest news, sport and opinion from the Guardian</title>`, "social_twitter_card");
    expect(r.status).toBe("WARN");
    expect(r.detail).not.toContain("small thumbnail");
    expect(r.detail).toMatch(/no share image/i);
  });

  it("keeps the small-thumbnail explanation when an og:image exists", async () => {
    const r = await check(`<meta property="og:image" content="https://example.test/card.png">`, "social_twitter_card");
    expect(r.status).toBe("WARN");
    expect(r.detail).toContain("small thumbnail");
  });

  it("passes summary_large_image regardless of attribute order (webflow.com)", async () => {
    const r = await check(`<meta content="summary_large_image" name="twitter:card"/>`, "social_twitter_card");
    expect(r.status).toBe("PASS");
  });
});

describe("social_video_object_schema", () => {
  it("does not warn on a page with no video at all (allbirds/lemonde/cal.com)", async () => {
    const r = await check(`<h1>Comfortable, Sustainable Shoes</h1><img src="/shoe.jpg" alt="Wool Runner">`, "social_video_object_schema");
    expect(r.status).toBe("PASS");
    expect(r.detail).toMatch(/not needed here/i);
  });

  it("warns when a <video> is embedded without VideoObject (webflow.com)", async () => {
    const r = await check(`<video muted="" loop="" poster="https://cdn.prod.website-files.com/x/verifone.avif" playsinline="true" preload="none"><source src="https://cdn.example.test/story.mp4" type="video/mp4"></video>`, "social_video_object_schema");
    expect(r.status).toBe("WARN");
  });

  it("warns when a YouTube embed has no VideoObject", async () => {
    const r = await check(`<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>`, "social_video_object_schema");
    expect(r.status).toBe("WARN");
  });

  it("passes when VideoObject markup is present", async () => {
    const r = await check(`<iframe src="https://player.vimeo.com/video/1"></iframe><script type="application/ld+json">{"@context":"https://schema.org","@type":"VideoObject","name":"Demo"}</script>`, "social_video_object_schema");
    expect(r.status).toBe("PASS");
  });
});

describe("reviewer-requested extra cases", () => {
  it("tag manager: Segment behind a first-party proxy still counts", async () => {
    const html = `<script src="https://cdp.acme.test/analytics.js/v1/KEY/analytics.min.js"></script>`;
    expect((await check(html, "social_tag_manager")).status).toBe("PASS");
  });

  it("title: a typographic named entity counts as one character", async () => {
    const r = await check(`<title>Pricing &ndash; Acme Widgets for every modern workshop team now</title>`, "social_title_length");
    expect(r.status).toBe("PASS");
    expect(r.detail).toBe("57 characters.");
  });

  it("video: players that put no iframe/<video> in the HTML still count as a video", async () => {
    for (const html of [
      `<lite-youtube videoid="dQw4w9WgXcQ"></lite-youtube>`,
      `<div class="wistia_embed wistia_async_abc123"></div>`,
      `<meta property="og:video" content="https://x.test/v.mp4">`,
    ]) {
      expect((await check(html, "social_video_object_schema")).status).toBe("WARN");
    }
  });
});

describe("review round: further false negatives", () => {
  it("tag manager: a first-party / server-side GTM loader counts", async () => {
    const html = `<script>j.src='https://sgtm.acme.test/gtm.js?id='+i+dl;</script>`;
    expect((await check(html, "social_tag_manager")).status).toBe("PASS");
  });

  it("tag manager: the GTM dataLayer event name alone is not a container", async () => {
    const html = `<script>dataLayer.push({event:'gtm.js'})</script>`;
    expect((await check(html, "social_tag_manager")).status).toBe("WARN");
  });

  it("video: a lazy-loaded YouTube embed URL and a Cloudflare Stream player count as a video", async () => {
    for (const html of [
      `<div class="yt-lazy" data-embed="https://www.youtube.com/embed/dQw4w9WgXcQ"></div>`,
      `<iframe src="https://customer-abc.cloudflarestream.com/xyz/iframe"></iframe>`,
      `<script>{"src":"https:\/\/www.youtube.com\/embed\/abc"}</script>`,
    ]) {
      expect((await check(html, "social_video_object_schema")).status).toBe("WARN");
    }
  });

  it("video: a link to a YouTube channel is not an embedded video", async () => {
    const r = await check(`<a href="https://www.youtube.com/@acme">YouTube</a>`, "social_video_object_schema");
    expect(r.status).toBe("PASS");
  });
});

describe("social_image_alt_coverage", () => {
  it("counts alt=\"\" and a bare alt as decorative, not missing (stripe/expo/cal.com)", async () => {
    const html = `<img src="/a.png" alt="" aria-hidden="true"><img src="/b.png" alt><img src="/c.png" alt="" role="presentation"><img src="/d.png" alt="Logo">`;
    expect((await check(html, "social_image_alt_coverage")).status).toBe("PASS");
  });

  it("still warns when most images have no alt attribute at all (HN-like)", async () => {
    const html = `<img src="/y18.svg" width="18"><img src="/s.gif" height="1"><img src="/s.gif"><img src="/logo.png" alt="Logo">`;
    expect((await check(html, "social_image_alt_coverage")).status).toBe("WARN");
  });

  it("does not count title=\"alt text\" or data-alt as an alt attribute", async () => {
    const html = `<img src="/a.png" title="alt text"><img src="/b.png" data-alt="x"><img src="/c.png" class="alt">`;
    expect((await check(html, "social_image_alt_coverage")).status).toBe("WARN");
  });

  it("counts an alt with no space before it in minified HTML", async () => {
    const html = `<img src="/a.png"alt="A"><img src="/b.png"alt="B"><img src="/c.png"alt="C">`;
    expect((await check(html, "social_image_alt_coverage")).status).toBe("PASS");
  });
});
