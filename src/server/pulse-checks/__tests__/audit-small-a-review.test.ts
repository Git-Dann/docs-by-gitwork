/**
 * Reviewer-requested refinements to the October 2026 audit fixes (group small-a).
 * Each fix narrowed a check that used to PASS on unrelated tokens; the reviewer found
 * real phrasings the narrowed form then missed. Every block here asserts BOTH sides:
 * the real phrasing still PASSes, and the noise that motivated the fix still does not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { headMock } = vi.hoisted(() => ({ headMock: vi.fn<(url: string) => Promise<number>>() }));

vi.mock("../_types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_types")>();
  return { ...actual, headRequest: vi.fn((url: string) => headMock(url)) };
});
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { runBusinessOperationsChecks } from "../business-operations";
import { runRolesPermissionsChecks } from "../roles-permissions";
import { runSeoExtended } from "../seo-extended";
import { runVibeCodeHygieneChecks } from "../vibe-code-hygiene";
import type { ExtendedCheckContext } from "../_types";
import type { PulseScanCheckInput } from "@/types/pulse";

function context(html: string, url = "https://example.test", platform: ExtendedCheckContext["platform"] = "SAAS"): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: { "content-type": "text/html; charset=utf-8" }, html, responseTimeMs: 10, finalUrl: url },
    httpsUrl: url,
    hostname: new URL(url).hostname,
    platform,
    ctx: { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

const statusOf = (checks: PulseScanCheckInput[], key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`missing ${key}`);
  return c.status;
};

const page = (body: string) =>
  `<!doctype html><html lang="en"><head><title>Acme — Home</title></head><body><main><h1>Acme</h1><p>Real server-rendered copy about the product.</p>${body}</main></body></html>`;

beforeEach(() => {
  headMock.mockReset();
  headMock.mockImplementation(async (url: string) => (url.includes("pulse-check-nonexistent-path-404") ? 404 : 200));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("physical_address_footer — ordinal, upper-case and &nbsp; street lines", () => {
  const addr = async (html: string) => statusOf(await runBusinessOperationsChecks(context(html, "https://example.test", "WEB_APP")), "physical_address_footer");

  it("passes '350 5th Ave', '548 MARKET STREET' and '548&nbsp;Market Street'", async () => {
    expect(await addr("<footer>350 5th Ave, New York, NY 10118</footer>")).toBe("PASS");
    expect(await addr("<footer>548 MARKET STREET, SAN FRANCISCO</footer>")).toBe("PASS");
    expect(await addr("<footer>548&nbsp;Market Street, San Francisco</footer>")).toBe("PASS");
  });

  it("still WARNs on prose that merely starts with a number", async () => {
    const prose = "<p>3 Finding your Best Sleep</p><p>12 times your maximum contact</p><p>1 list</p><p>5 years past</p><p>3 first</p>";
    expect(await addr(prose)).toBe("WARN");
  });
});

describe("data_retention_schedule — real retention statements, not product copy", () => {
  const ret = async (html: string) => statusOf(await runBusinessOperationsChecks(context(html, "https://example.test", "WEB_APP")), "data_retention_schedule");

  it("passes common privacy-notice phrasings", async () => {
    for (const s of [
      "We retain customer data for 7 years.",
      "How long do we keep your data?",
      "Your information is retained for 30 days.",
      "We store your data for 90 days.",
      "We keep your personal data for 6 years.",
    ]) {
      expect(await ret(`<p>${s}</p>`), s).toBe("PASS");
    }
  });

  it("still WARNs on product copy that has a verb and a duration but no personal-data object", async () => {
    expect(await ret("<p>Store files for 30 days free.</p><p>Keep your streak for 7 days.</p><p>We store your data securely for free.</p>")).toBe("WARN");
  });
});

describe("roles-permissions — refinements", () => {
  const rp = async (html: string, key: string) => statusOf(await runRolesPermissionsChecks(context(html)), key);

  it("guest mode: a crossorigin=anonymous link next to a view-transition meta is not guest copy", async () => {
    expect(await rp('<link crossorigin="anonymous"><meta name="view-transition" content="same-origin">', "guest_anonymous_mode")).toBe("WARN");
    expect(await rp("<p>Allow anonymous viewers on public boards</p>", "guest_anonymous_mode")).toBe("PASS");
  });

  it("IP allowlisting: 'Restrict access by IP' and 'Allowlist IPs' pass; CSS/flag noise does not", async () => {
    expect(await rp("<p>Restrict access by IP</p>", "ip_allowlisting")).toBe("PASS");
    expect(await rp("<p>Allowlist IPs for your workspace</p>", "ip_allowlisting")).toBe("PASS");
    expect(await rp('<button class="cursor-not-allowed">Go</button><svg><clipPath id="a"></clipPath></svg><script>["restricted_pushers_warning"]</script>', "ip_allowlisting")).toBe("WARN");
  });

  it("SCIM: 'Directory syncing', 'Directory Synchronization' and a directory-sync slug pass; far-apart 'directory … sync' does not", async () => {
    expect(await rp("<p>Directory syncing with Okta</p>", "sso_scim_provisioning")).toBe("PASS");
    expect(await rp("<p>Directory Synchronization</p>", "sso_scim_provisioning")).toBe("PASS");
    expect(await rp('<a href="/directory-sync">Learn more</a>', "sso_scim_provisioning")).toBe("PASS");
    expect(await rp('<a href="/partners/directory">Partner directory</a>' + "<p>lorem</p>".repeat(50) + "<p>Data sync</p>", "sso_scim_provisioning")).toBe("WARN");
  });

  it("invite: 'Invite collaborators' / 'Invite clients' pass; Stripe's 'Request an invite' i18n string does not", async () => {
    expect(await rp("<p>Invite collaborators to edit</p>", "invite_workflow")).toBe("PASS");
    expect(await rp("<p>Invite clients to the portal</p>", "invite_workflow")).toBe("PASS");
    expect(await rp('<script>{"hero.invite":"Request an invite","hero.title":"Financial infrastructure"}</script>', "invite_workflow")).toBe("WARN");
  });
});

describe("seo-extended — refinements", () => {
  const seo = async (html: string, key: string) => statusOf(await runSeoExtended(context(html, "https://example.test", "MARKETING_SITE")), key);
  const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

  it("organization_schema: a sourceOrganization property name is not an Organization node", async () => {
    expect(await seo(ld({ "@context": "https://schema.org", "@type": "WebPage", sourceOrganization: "https://example.test/about" }), "organization_schema")).toBe("WARN");
    expect(await seo(ld({ "@context": "https://schema.org", "@type": "OnlineStore", name: "Mercado Livre" }), "organization_schema")).toBe("PASS");
    expect(await seo(ld({ "@type": "WebPage", sourceOrganization: { "@type": "NewsMediaOrganization", name: "X" } }), "organization_schema")).toBe("PASS");
  });

  it("internal_link_depth: an SVG sprite <use href> in the nav is not an internal page link", async () => {
    expect(await seo('<nav><button><svg><use href="/icons/sprite.svg#menu"></use></svg></button></nav>', "internal_link_depth")).toBe("WARN");
    expect(await seo('<nav><a data-x="1" href="https://example.test/pricing">Pricing</a></nav>', "internal_link_depth")).toBe("PASS");
  });
});

describe("vibe-code-hygiene — refinements", () => {
  const vibe = async (html: string, url = "https://example.test") => runVibeCodeHygieneChecks(context(html, url, "MARKETING_SITE"));

  it("a script that mentions 'todos' does not hide a visible TODO", async () => {
    const html = page("<p>TODO: write pricing copy</p><script>const todos = []; // todos list</script>");
    expect(statusOf(await vibe(html), "vibe_placeholder_content")).toBe("FAIL");
  });

  it("a TODO only in an inline script is a WARN, and a clean page passes", async () => {
    expect(statusOf(await vibe(page("<script>// TODO: remove this flag\nwindow.x=1;</script>")), "vibe_placeholder_content")).toBe("WARN");
    expect(statusOf(await vibe(page("")), "vibe_placeholder_content")).toBe("PASS");
  });

  it("the 404 probe keeps the scanned path (an app mounted at /app/ is probed under /app/)", async () => {
    // Origin returns a real 404; the /app/* SPA catch-all serves 200 — a soft 404 the probe must see.
    headMock.mockImplementation(async (url: string) => (url.startsWith("https://example.test/app/") ? 200 : 404));
    const checks = await vibe(page(""), "https://example.test/app/?utm_source=x#top");
    expect(headMock).toHaveBeenCalledWith("https://example.test/app/pulse-check-nonexistent-path-404");
    expect(statusOf(checks, "vibe_no_custom_404")).toBe("WARN");
  });

  it("the 404 probe drops the query and fragment (gov.uk)", async () => {
    await vibe(page(""), "https://www.gov.uk/?utm_source=x#top");
    expect(headMock).toHaveBeenCalledWith("https://www.gov.uk/pulse-check-nonexistent-path-404");
  });
});

describe("adversarial review — second pass", () => {
  const ret = async (html: string) => statusOf(await runBusinessOperationsChecks(context(html, "https://example.test", "WEB_APP")), "data_retention_schedule");
  const vibe = async (html: string) => runVibeCodeHygieneChecks(context(html, "https://example.test", "MARKETING_SITE"));

  it("retention: a duration must be a period of time, not any digit or number word", async () => {
    expect(await ret("<p>We store your data for 3rd party processing.</p>")).toBe("WARN");
    expect(await ret("<p>Keep your data for one low price.</p>")).toBe("WARN");
    expect(await ret("<p>We retain personal data for 12-24 months.</p>")).toBe("PASS");
    expect(await ret("<p>We keep your records for six (6) years.</p>")).toBe("PASS");
    expect(await ret("<p>We hold your information for as long as your account is open.</p>")).toBe("PASS");
  });

  it("404 probe: a refusal or server error is not evidence of 404 handling", async () => {
    for (const code of [403, 405, 429, 500, 503]) {
      headMock.mockImplementation(async (url: string) => (url.includes("pulse-check-nonexistent-path-404") ? code : 200));
      expect(statusOf(await vibe(page("")), "vibe_no_custom_404"), String(code)).toBe("INCONCLUSIVE");
    }
    headMock.mockImplementation(async (url: string) => (url.includes("pulse-check-nonexistent-path-404") ? 400 : 200));
    expect(statusOf(await vibe(page("")), "vibe_no_custom_404")).toBe("PASS");
  });

  it("FIXME followed by a space is detected; 'Growth hack:' prose is not placeholder content", async () => {
    expect(statusOf(await vibe(page("<p>FIXME: real copy goes here</p>")), "vibe_placeholder_content")).toBe("FAIL");
    expect(statusOf(await vibe(page("<script>// FIXME: drop this flag\nwindow.y=1;</script>")), "vibe_placeholder_content")).toBe("WARN");
    expect(statusOf(await vibe(page("<p>Growth hack: send the email on Tuesday.</p>")), "vibe_placeholder_content")).toBe("PASS");
  });
});
