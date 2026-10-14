import { describe, expect, it } from "vitest";
import { runSaasExtended } from "../saas-extended";
import type { ExtendedCheckContext } from "../_types";

function context(html: string): ExtendedCheckContext {
  return { pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test/" }, httpsUrl: "https://example.test", hostname: "example.test", platform: "SAAS", ctx: { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" }, htmlLower: html.toLowerCase(), catchAll200: false };
}
const statusOf = async (html: string, key: string) => (await runSaasExtended(context(html))).find((c) => c.checkKey === key)?.status;

describe("dark_mode_supported only passes on real dark-theme markers", () => {
  it("does not pass Stripe-style markup that merely contains light/dark/toggle words far apart", async () => {
    const html = '<link rel="preload" href="https://b.stripecdn.com/mkt-ssr-statics/assets/_next/static/media/palette-light.3c0e6604.webp" crossorigin="anonymous"/><section class="hero"><h1>Financial infrastructure to grow your revenue</h1></section><div class="Dark__GAa1o section-dark-bg">Accept payments</div><button aria-label="Toggle navigation">Menu</button>';
    expect(await statusOf(html, "dark_mode_supported")).toBe("WARN");
  });
  it("still passes prefers-color-scheme, data-color-mode and Tailwind dark: variants", async () => {
    expect(await statusOf('<style>@media (prefers-color-scheme: dark){:root{--bg:#000}}</style>', "dark_mode_supported")).toBe("PASS");
    expect(await statusOf('<html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark"><body></body></html>', "dark_mode_supported")).toBe("PASS");
    expect(await statusOf('<html data-theme="dark"><body><div class="bg-white dark:bg-contrast">Shop</div></body></html>', "dark_mode_supported")).toBe("PASS");
  });
  it("keeps a plain page without any theming as WARN", async () => {
    expect(await statusOf('<html lang="en" op="news"><head><link rel="stylesheet" href="news.css"></head><body><table id="hnmain"></table></body></html>', "dark_mode_supported")).toBe("WARN");
  });
});

describe("app_marketplace_listed recognises marketplace links", () => {
  it("passes Figma-style homepage linking its plugin marketplace", async () => {
    const html = '<nav><a href="https://www.figma.com/community">Community</a><a href="https://www.figma.com/community/plugins"><span class="nav-highlight">Plugins</span></a></nav>';
    expect(await statusOf(html, "app_marketplace_listed")).toBe("PASS");
  });
  it("still passes GitHub's marketplace link", async () => {
    expect(await statusOf('<a href="https://github.com/marketplace">Marketplace</a>', "app_marketplace_listed")).toBe("PASS");
  });
  it("does not pass on unrelated 'app' and 'marketplaces' words far apart", async () => {
    const html = '<script type="application/json" id="client-env">{"locale":"en"}</script><main><h1>Build your app</h1><a href="/use-cases/marketplaces">Payments for marketplaces</a></main>';
    expect(await statusOf(html, "app_marketplace_listed")).toBe("WARN");
  });
});

describe("audit saas-extended-1: reviewer-requested regressions", () => {
  it("PASSes theme-toggle wording and WARNs on unrelated 'theme' copy", async () => {
    expect(await statusOf('<button aria-label="Toggle theme"></button>', "dark_mode_supported")).toBe("PASS");
    expect(await statusOf('<button title="Switch between dark and light mode"></button>', "dark_mode_supported")).toBe("PASS");
    expect(await statusOf("<a href=\"/themes\">Switch to the theme store</a>", "dark_mode_supported")).toBe("WARN");
  });
  it("PASSes the real marketplaces the first fix missed", async () => {
    expect(await statusOf('<a href="https://marketplace.zoom.us/">Marketplace</a>', "app_marketplace_listed")).toBe("PASS");
    expect(await statusOf('<a href="https://apps.shopify.com/">App Store</a>', "app_marketplace_listed")).toBe("PASS");
    expect(await statusOf('<a href="https://cursor.com/marketplace/dropbox">Cursor</a>', "app_marketplace_listed")).toBe("PASS");
    expect(await statusOf('<nav><span>Marketplace</span></nav>', "app_marketplace_listed")).toBe("PASS");
  });
  it("still WARNs on WordPress plugin assets and App Store download badges", async () => {
    expect(await statusOf('<link rel="stylesheet" href="/wp-content/plugins/x/style.css"><a href="https://apps.apple.com/app/id1">Download on the App Store</a>', "app_marketplace_listed")).toBe("WARN");
  });
});
