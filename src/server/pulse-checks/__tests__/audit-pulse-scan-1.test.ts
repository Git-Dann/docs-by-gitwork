import { describe, expect, it } from "vitest";
import {
  hasAiPlatformWatermark,
  hasAnalyticsSignal,
  hasAuthEntryLink,
  hasAppleAppStoreLink,
  hasAnnualBillingSignal,
} from "@/server/pulse-scan";

// Fixtures are trimmed from live homepages fetched with UA Gitwork-Pulse/1.0 on 2026-10-14.

describe("ai_platform_origin — attribution, not a mention", () => {
  it("does not flag stripe.com for naming lovable.dev in a customer list", () => {
    const html = `<script type="application/json">{"mkt-ssr.console.querybox.placeholder.lovable":"lovable.dev lovable is a software creation platform"}</script><img src="/img/customers/lovable.png?w=432&amp;q=90" alt="Lovable">`;
    expect(hasAiPlatformWatermark(html, "stripe.com")).toBe(false);
  });

  it("does not flag bolt.new for being bolt.new", () => {
    const html = `<meta property="og:site_name" content="bolt.new"/><meta property="og:image" content="https://bolt.new/static/social_preview_index.jpg"/><link rel="canonical" href="https://bolt.new"/>`;
    expect(hasAiPlatformWatermark(html, "bolt.new")).toBe(false);
  });

  it("does not flag vercel.com for linking its own v0.app product", () => {
    expect(hasAiPlatformWatermark(`<a href="https://v0.app">v0</a>`, "vercel.com")).toBe(false);
  });

  it("still flags a real Bolt badge script (gitwork.co.uk)", () => {
    const html = `<link rel="stylesheet" crossorigin href="/assets/index-Cy_QsWJv.css">\n  <script async src="https://bolt.new/badge.js?s=f5179d48-760d-4d69-bfb6-d85a3aa180b0"></script></head>`;
    expect(hasAiPlatformWatermark(html, "gitwork.co.uk")).toBe(true);
  });

  it("still flags the default Lovable template head", () => {
    const html = `<meta name="author" content="Lovable" /><meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png" /><script src="https://cdn.gpteng.co/gptengineer.js" type="module"></script>`;
    expect(hasAiPlatformWatermark(html, "my-app.example.com")).toBe(true);
  });

  it("still flags visible 'Built with Lovable' copy", () => {
    expect(hasAiPlatformWatermark(`<footer><a>Built with Lovable</a></footer>`, "shop.example.com")).toBe(true);
  });
});

describe("analytics_present — beyond six vendors", () => {
  it("detects MDN's Glean telemetry", () => {
    const html = `<a href="/en-US/" class="logo" data-glean-id="header: logo">MDN</a><button data-glean-toggle-open="menu">Menu</button>`;
    expect(hasAnalyticsSignal(html)).toBe(true);
  });

  it("still detects GA4 via gtag", () => {
    const html = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-L9MCW45TVC"></script><script>gtag('config', 'G-L9MCW45TVC');</script>`;
    expect(hasAnalyticsSignal(html)).toBe(true);
  });

  it("stays negative on Hacker News, which ships no analytics", () => {
    const html = `<html lang="en" op="news"><head><meta name="referrer" content="origin"><link rel="stylesheet" type="text/css" href="news.css?abc"><title>Hacker News</title></head><body><center><table><tr><td><a href="news">Hacker News</a></td></tr></table></center><script type="text/javascript" src="hn.js?abc"></script></body></html>`;
    expect(hasAnalyticsSignal(html)).toBe(false);
  });
});

describe("auth_ui_signals — absolute and nested login links", () => {
  it("detects stripe.com's absolute dashboard login link", () => {
    expect(hasAuthEntryLink(`<a class="SiteHeader__link" href="https://dashboard.stripe.com/login">Sign in</a>`)).toBe(true);
  });

  it("detects Shopify's /account/login (uk.gymshark.com)", () => {
    expect(hasAuthEntryLink(`<a href="/account/login" class="header__icon">Log in</a>`)).toBe(true);
  });

  it("detects HN's relative login?goto=news", () => {
    expect(hasAuthEntryLink(`<span class="pagetop"><a href="login?goto=news">login</a></span>`)).toBe(true);
  });

  it("still detects a plain root /login", () => {
    expect(hasAuthEntryLink(`<a href="/login">Log in</a>`)).toBe(true);
  });

  it("does not count a newsletter sign-up, a help article, or a preloaded JS chunk", () => {
    const html = `<a href="https://uk.gymshark.com/pages/sign-up-to-our-newsletter">Newsletter</a>` +
      `<a href="https://help.shopify.com/en/support/login">Help</a>` +
      `<link rel="modulepreload" href="/assets/login-RVApAk85.js">`;
    expect(hasAuthEntryLink(html)).toBe(false);
  });

  it("does not count a commented-out login link", () => {
    expect(hasAuthEntryLink(`<!-- <a href="/login">Log in</a> -->`)).toBe(false);
  });
});

describe("apple_app_store — badges behind deep-link shorteners", () => {
  it("detects headspace.com's App Store badge linked via Branch", () => {
    const html = `<a class="css-1f878md" href="https://headspace.app.link/W6p05DVCe7" target="_blank" rel="noopener noreferrer"><img aria-hidden="true" alt="" loading="lazy" srcSet="https://headspace-contentful.imgix.net/4WIy7Wkahz37fUnl6Y7Td0/fb3fd4d7afcc187202f1100206f98977/app-store.png?ixlib=js-3.8.0&amp;w=640 1x"></a>`;
    expect(hasAppleAppStoreLink(html)).toBe(true);
  });

  it("still detects a direct apps.apple.com link", () => {
    expect(hasAppleAppStoreLink(`<a href="https://apps.apple.com/us/app/github/id1477376905">iOS</a>`)).toBe(true);
  });

  it("stays negative for a developer-platform homepage with no store link (expo.dev)", () => {
    const html = `<a href="/eas">EAS</a><a href="https://docs.expo.dev/">Docs</a><img src="/static/images/app-icon.png" alt="Expo">`;
    expect(hasAppleAppStoreLink(html)).toBe(false);
  });
});

describe("annual_billing_signal — billing phrasing, not any 'annual'", () => {
  it("detects bolt.new's pricing toggle", () => {
    const html = `<button role="tab" type="button" data-value="yearly" tabindex="-1" aria-selected="false"><span class="relative truncate">Yearly</span></button><p><b>Save up to 28%</b> with yearly billing</p>`;
    expect(hasAnnualBillingSignal(html)).toBe(true);
  });

  it("detects linear.app's 'Billed yearly' and figma's annual toggle", () => {
    expect(hasAnnualBillingSignal(`<label>Billed yearly</label>`)).toBe(true);
    expect(hasAnnualBillingSignal(`<button aria-label="Show annual billing prices: Annual selected">Annual</button>`)).toBe(true);
  });

  it("does not match stripe.com's 'annual letter' prose", () => {
    expect(hasAnnualBillingSignal(`<p>Our annual letter explores the trends defining the internet economy.</p>`)).toBe(false);
  });

  it("does not match gymshark's i18n 'Save {{amount}}' … 'year' on one minified line", () => {
    expect(hasAnnualBillingSignal(`{"save":"Save {{amount}}","wishlist":"Wishlist","footer":"© year Gymshark"}`)).toBe(false);
  });

  it("does not match a /year-in-review URL", () => {
    expect(hasAnnualBillingSignal(`<a href="/blog/year-in-review">2025 in review</a>`)).toBe(false);
  });
});
