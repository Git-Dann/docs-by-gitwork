// @vitest-environment node
/**
 * Audit packet pulse-scan-2 — each case is a shape observed live (2026-10-14):
 *   flipkart `ak-grn` (Akamai), Guardian /uk subpath + /help/contact-us, Supabase /contact-us,
 *   webflow /company/careers (headers overflow), GitHub "Do not share my personal information",
 *   Notion /security + Anthropic trust.anthropic.com, Stripe locale-switcher, Le Monde's
 *   Fastly "Client Challenge" answering unknown paths with 200.
 * Every fix is two-sided: the observed true case must change, a genuine absence must not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Route = (url: string) => Response | Error;
let route: Route = () => new Error("unset");

vi.mock("@/server/pulse-lite/url-guard", async (orig) => {
  const actual = await orig<typeof import("@/server/pulse-lite/url-guard")>();
  return {
    ...actual,
    fetchScannableUrl: vi.fn(async (url: string) => {
      const r = route(String(url));
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

import { detectEdgeCache, runUrlChecks } from "@/server/pulse-scan";
import type { JurisdictionCode } from "@/server/pulse-checks/jurisdictions";

const MARKETS: JurisdictionCode[] = ["UK", "EU", "US", "US-CA"];

const respond = (url: string, status: number, body: string, headers: Record<string, string> = {}) => {
  const r = new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
  Object.defineProperty(r, "url", { value: url });
  return r;
};

const PROSE = `<p>${"Independent reporting, product updates and practical guides for teams who ship software every week. ".repeat(30)}</p>`;
const home = (footer: string, title = "Example Site - Home") =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><header><h1>${title}</h1></header><main>${PROSE}</main><footer>${footer}</footer></body></html>`;
const NOT_FOUND = `<!DOCTYPE html><html><head><title>Page not found</title></head><body><h1>Page not found</h1><p>${"Sorry, we could not find that page. ".repeat(20)}</p></body></html>`;
const CLIENT_CHALLENGE = `<!DOCTYPE html><html lang="en"><head><link href="/_fs-ch-1T1wmsGaOgGaSxcX/assets/styles.css" rel="stylesheet" /><title>Client Challenge</title></head><body><noscript><span class="noscript-span">JavaScript is disabled in your browser.</span><p>Please enable JavaScript to proceed.</p></noscript><div id="loading-error" role="alert">A required part of this site couldn't load.</div></body></html>`;

/** Route a fake site: `pages` keyed by pathname; anything else falls to `fallback` (default 404). */
function site(
  homePath: string,
  homeHtml: string,
  pages: Record<string, (url: string) => Response | Error> = {},
  fallback: (url: string) => Response | Error = (u) => respond(u, 404, NOT_FOUND),
): Route {
  return (url) => {
    let path = "/";
    try { path = new URL(url).pathname; } catch { /* keep */ }
    if (!/^https?:\/\/(site|news)\.test/.test(url)) return respond(url, 404, "{}", { "content-type": "application/json" });
    if (url.startsWith("http://")) return respond(url, 404, NOT_FOUND);
    if (path === homePath) return respond(url, 200, homeHtml);
    if (pages[path]) return pages[path](url);
    return fallback(url);
  };
}

async function scan(url: string, platform = "SAAS") {
  const out = await runUrlChecks(url, platform, undefined, MARKETS);
  return (key: string) => out.checks.find((c) => c.checkKey === key);
}

beforeEach(() => { route = () => new Error("unset"); });

describe("cdn_detected", () => {
  it("recognises Akamai's live ak-grn header (www.flipkart.com)", () => {
    const ev = detectEdgeCache({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-cache, no-store, must-revalidate",
      "ak-grn": "0.0e847b5c.1792001083.223f9a97",
    });
    expect(ev?.header).toBe("ak-grn");
  });
  it("recognises the WordPress/Automattic x-nc cache status (wordpress.org/news)", () => {
    expect(detectEdgeCache({ server: "nginx", "x-nc": "EXPIRED dca 2" })?.header).toBe("x-nc");
  });
  it("still reports an origin-only response (petstore3 Jetty) as no CDN", () => {
    expect(detectEdgeCache({
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      server: "Jetty(9.4.53.v20231009)",
    })).toBeNull();
  });
});

describe("contact_page", () => {
  it("counts a linked contact page when /contact 404s (Guardian /help/contact-us)", async () => {
    route = site("/", home(`<a href="/help/contact-us">Contact us</a>`));
    const c = await scan("https://site.test");
    expect(c("contact_page")?.status).toBe("PASS");
  }, 60_000);
  it("still warns when nothing is linked and /contact 404s", async () => {
    route = site("/", home(`<a href="/about">About</a>`));
    const c = await scan("https://site.test");
    expect(c("contact_page")?.status).toBe("WARN");
  }, 60_000);
});

describe("careers_page", () => {
  it("counts a linked careers page when the guessed paths cannot be fetched (webflow.com)", async () => {
    const overflow = () => Object.assign(new Error("fetch failed"), { cause: { code: "UND_ERR_HEADERS_OVERFLOW" } });
    route = site("/", home(`<a href="https://site.test/company/careers">Careers</a>`), { "/careers": overflow, "/jobs": overflow });
    const c = await scan("https://site.test");
    expect(c("careers_page")?.status).toBe("PASS");
  }, 60_000);
  it("probes the origin, not the scanned path (www.theguardian.com/uk)", async () => {
    const careers = (u: string) => respond(u, 200, `<!DOCTYPE html><html><head><title>Guardian Careers | The Guardian</title></head><body><h1>Careers</h1>${PROSE}</body></html>`);
    route = site("/uk", home(`<a href="/about">About</a>`, "News, sport and opinion"), { "/careers": careers });
    const c = await scan("https://news.test/uk");
    expect(c("careers_page")?.status).toBe("PASS");
  }, 60_000);
  it("still warns when there is no careers link and both guesses 404", async () => {
    route = site("/", home(`<a href="/about">About</a>`));
    const c = await scan("https://site.test");
    expect(c("careers_page")?.status).toBe("WARN");
  }, 60_000);
});

describe("cookie_policy_page", () => {
  it("does not claim the law requires a DEDICATED page", async () => {
    route = site("/", home(`<a href="/privacy">Privacy</a>`));
    const c = await scan("https://site.test");
    expect(c("cookie_policy_page")?.status).toBe("WARN");
    expect(c("cookie_policy_page")?.detail).not.toMatch(/require transparent disclosure of all cookies/);
    expect(c("cookie_policy_page")?.detail).toMatch(/privacy policy/);
  }, 60_000);
  it("still passes a linked cookie policy", async () => {
    route = site("/", home(`<a href="/cookie-policy?origin=footer">Cookie Policy</a>`));
    const c = await scan("https://site.test");
    expect(c("cookie_policy_page")?.status).toBe("PASS");
  }, 60_000);
});

describe("cookie_consent", () => {
  it("does not say a banner is required unconditionally (Wikipedia sets no non-essential cookies)", async () => {
    route = site("/", home(`<a href="/about">About</a>`));
    const c = await scan("https://site.test");
    expect(c("cookie_consent")?.status).toBe("WARN");
    expect(c("cookie_consent")?.detail).not.toMatch(/required for EU\/UK markets/);
    expect(c("cookie_consent")?.detail).toMatch(/non-essential/);
  }, 60_000);
  it("still passes a real banner", async () => {
    route = site("/", home(`<div id="cookie-banner"><p>We use cookies to collect data and improve our services.</p><button>Accept all cookies</button><button>Reject all cookies</button></div>`));
    const c = await scan("https://site.test");
    expect(c("cookie_consent")?.status).toBe("PASS");
  }, 60_000);
});

describe("ccpa_compliance", () => {
  it("recognises the CPRA 'Do not share' link (github.com footer)", async () => {
    route = site("/", home(`<ul><li><cookie-consent-link><button type="button" class="Link--secondary underline-on-hover">Do not share my personal information</button></cookie-consent-link></li></ul>`));
    const c = await scan("https://site.test");
    expect(c("ccpa_compliance")?.status).toBe("PASS");
  }, 60_000);
  it("still warns with no opt-out link, without claiming a universal requirement or leaking entities", async () => {
    route = site("/", home(`<a href="/privacy">Privacy</a>`));
    const c = await scan("https://site.test");
    expect(c("ccpa_compliance")?.status).toBe("WARN");
    expect(c("ccpa_compliance")?.detail).not.toMatch(/&lsquo;|required for California users/);
    expect(c("ccpa_compliance")?.detail).toMatch(/sell or share/);
  }, 60_000);
});

describe("compliance_certifications", () => {
  it("is INCONCLUSIVE, not WARN, when the page links a security page (notion.so /security)", async () => {
    route = site("/", home(`<a class="variantSecondary" href="/security">Security</a>`));
    const c = await scan("https://site.test");
    expect(c("compliance_certifications")?.status).toBe("INCONCLUSIVE");
  }, 60_000);
  it("is INCONCLUSIVE for a trust-centre host (anthropic.com → trust.anthropic.com)", async () => {
    route = site("/", home(`<a href="http://trust.anthropic.com/" class="nav_dropdown_link">Trust center</a>`));
    const c = await scan("https://site.test");
    expect(c("compliance_certifications")?.status).toBe("INCONCLUSIVE");
  }, 60_000);
  it("still warns with no mention and no trust link (a Trustpilot link is not one)", async () => {
    route = site("/", home(`<a href="https://www.trustpilot.com/review/site.test">Reviews</a>`));
    const c = await scan("https://site.test");
    expect(c("compliance_certifications")?.status).toBe("WARN");
  }, 60_000);
  it("still passes an inline certification (supabase.com)", async () => {
    route = site("/", home(`<li>SOC2 Type 2 <span>Certified</span></li><li>ISO 27001</li>`));
    const c = await scan("https://site.test");
    expect(c("compliance_certifications")?.status).toBe("PASS");
  }, 60_000);
});

describe("country_region_selector", () => {
  it("recognises a locale switcher (stripe.com footer)", async () => {
    route = site("/", home(`<div class="footer-bottom"><div><button type="button" class="hds-button locale-switcher__button hds-button--transparent" aria-label="United Kingdom. Choose your country"><span class="locale-switcher__trigger-region">United Kingdom</span>(<span>English</span>)</button></div></div>`));
    const c = await scan("https://site.test");
    expect(c("country_region_selector")?.status).toBe("PASS");
  }, 60_000);
  it("still warns when no selector exists", async () => {
    route = site("/", home(`<a href="/about">About</a>`));
    const c = await scan("https://site.test");
    expect(c("country_region_selector")?.status).toBe("WARN");
  }, 60_000);
});

describe("custom_404_page", () => {
  it("does not call a bot challenge 'catch-all routing' (www.lemonde.fr)", async () => {
    route = site("/", home(`<a href="/about">About</a>`, "Le Monde.fr"), {}, (u) => respond(u, 200, CLIENT_CHALLENGE));
    const c = await scan("https://site.test", "MARKETING_SITE");
    expect(c("custom_404_page")?.status).toBe("INCONCLUSIVE");
    expect(c("custom_404_page")?.detail).not.toMatch(/catch-all routing/);
  }, 60_000);
  it("still warns a genuine SPA catch-all (the shell for every path, as gitwork.co.uk)", async () => {
    const shell = home(`<a href="/about">About</a>`, "Gitwork. From prompt to production.");
    route = site("/", shell, {}, (u) => respond(u, 200, shell));
    const c = await scan("https://site.test", "MARKETING_SITE");
    expect(c("custom_404_page")?.status).toBe("WARN");
    expect(c("custom_404_page")?.detail).toMatch(/catch-all routing/);
  }, 60_000);
});
