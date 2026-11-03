// @vitest-environment node
/**
 * Review-requested cases for audit packet pulse-scan (October 2026). Each fix in that
 * packet was approved WITH CHANGES; these pin the changes the reviewers asked for, in
 * both directions — the defect shape must change, a representative correct input must not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Route = (url: string) => Response | Error;
let route: Route = () => new Error("unset");

vi.mock("@/server/pulse-lite/url-guard", async (orig) => {
  const actual = await orig<typeof import("@/server/pulse-lite/url-guard")>();
  return {
    ...actual,
    fetchScannableUrl: vi.fn(async (url: string) => {
      const r = route(url);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

import {
  CAREERS_LINK_TOKENS,
  CONTACT_LINK_TOKENS,
  countCrossOriginSubresources,
  findPrivacyPolicyHref,
  hasAnalyticsSignal,
  hasAnnualBillingSignal,
  hasAuthEntryLink,
  isInlinePrivacyPolicy,
  isOpenApiDocument,
  linksOwnStatusPage,
  linksPathContaining,
  runUrlChecks,
} from "@/server/pulse-scan";

const res = (status: number, body: string, headers: Record<string, string> = {}) => {
  const r = new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
  Object.defineProperty(r, "url", { value: "https://site.test/" });
  return r;
};
const HOME = (extra = "", head = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Site</title>${head}</head><body><h1>Site</h1><p>${"Real words about the product. ".repeat(80)}</p>${extra}<a href="/privacy">Privacy</a><a href="/terms">Terms</a></body></html>`;

async function check(key: string, platform = "SAAS") {
  const out = await runUrlChecks("https://site.test", platform);
  const c = out.checks.find((x) => x.checkKey === key);
  expect(c, key).toBeDefined();
  return c!;
}

beforeEach(() => { route = () => new Error("unset"); });

describe("annual_billing_signal — toggles and price-anchored rates", () => {
  it("matches the common toggle labels and save-N%-near-annual", () => {
    expect(hasAnnualBillingSignal("<button>Monthly</button><button>Yearly</button>")).toBe(true);
    expect(hasAnnualBillingSignal("<span>Annual (save 20%)</span>")).toBe(true);
    expect(hasAnnualBillingSignal("<button>Annually</button>")).toBe(true);
    expect(hasAnnualBillingSignal("<p>Save 20% with annual</p>")).toBe(true);
    expect(hasAnnualBillingSignal("<p>Pro: $96 per year</p>")).toBe(true);
    expect(hasAnnualBillingSignal("<p>£8/yr</p>")).toBe(true);
  });
  it("does not match prose rates or a /year URL", () => {
    expect(hasAnnualBillingSignal("<p>We process 5 billion requests per year.</p>")).toBe(false);
    expect(hasAnnualBillingSignal('<a href="/year">Our year</a>')).toBe(false);
  });
});

describe("auth / analytics token edges", () => {
  it("accepts Rails/Devise /users/sign_in and /users/sign_up", () => {
    expect(hasAuthEntryLink('<a href="/users/sign_in">Sign in</a>')).toBe(true);
    expect(hasAuthEntryLink('<a href="/users/sign_up">Sign up</a>')).toBe(true);
  });
  it("Umami counts by its script host, not the culinary word", () => {
    expect(hasAnalyticsSignal('<script defer src="https://cloud.umami.is/script.js" data-website-id="x"></script>')).toBe(true);
    expect(hasAnalyticsSignal("<p>A rich umami broth with miso and kombu.</p>")).toBe(false);
  });
});

describe("careers / contact link tokens are whole segments", () => {
  it("careers: webflow /company/careers and a careers.* host count; articles do not", () => {
    expect(linksPathContaining('<a href="/company/careers">Careers</a>', CAREERS_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="https://careers.google.com/">Jobs</a>', CAREERS_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="/money/work-and-careers">Work</a><a href="/tag/careers-advice">x</a><a href="/blog/careers-in-tech">y</a>', CAREERS_LINK_TOKENS)).toBe(false);
  });
  it("contact: /help/contact-us, /contact-us and /contact count; contacts, lenses and CSS do not", () => {
    expect(linksPathContaining('<a href="/help/contact-us">Contact</a>', CONTACT_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="/contact-us">Contact</a>', CONTACT_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="/contact">Contact</a>', CONTACT_LINK_TOKENS)).toBe(true);
    expect(linksPathContaining('<a href="/features/contacts">CRM</a><a href="/contact-lenses">Lenses</a><link rel="stylesheet" href="/css/contact.css">', CONTACT_LINK_TOKENS)).toBe(false);
  });
});

describe("helpers tightened at review", () => {
  it("isOpenApiDocument rejects a package.json that depends on swagger", () => {
    expect(isOpenApiDocument('{"name":"x","dependencies":{"swagger":"0.7.5"}}')).toBe(false);
    expect(isOpenApiDocument('{"openapi":"3.0.4","info":{"title":"Petstore"},"paths":{}}')).toBe(true);
  });
  it("findPrivacyPolicyHref skips another organisation's policy (reCAPTCHA notice)", () => {
    const html = `<p>Protected by reCAPTCHA. <a href="https://policies.google.com/privacy">Privacy</a></p><footer><a href="/legal/privacy">Privacy</a></footer>`;
    expect(findPrivacyPolicyHref(html, "https://acme.com")).toBe("https://acme.com/legal/privacy");
    expect(findPrivacyPolicyHref(`<a href="https://policies.google.com/privacy">Privacy</a>`, "https://acme.com")).toBeNull();
  });
  it("isInlinePrivacyPolicy needs heading, volume AND policy structure", () => {
    const body = "<p>We use personal information to fulfil orders.</p>".repeat(16);
    expect(isInlinePrivacyPolicy(`<h1>Privacy Policy</h1>${body}<h2>Your rights</h2><h2>Third parties</h2>`)).toBe(true);
    expect(isInlinePrivacyPolicy(`<h1>Privacy Policy</h1>${body}`)).toBe(false);
    expect(isInlinePrivacyPolicy(`<h1>About us</h1>${body}<h2>Your rights</h2><h2>Third parties</h2>`)).toBe(false);
    // Attribute values do not count toward the volume.
    const attrs = `<span data-x="personal data personal data personal data">x</span>`.repeat(10);
    expect(isInlinePrivacyPolicy(`<h1>Privacy Policy</h1>${attrs}<h2>Your rights</h2><h2>Third parties</h2>`)).toBe(false);
  });
  it("linksOwnStatusPage: own brand only, never a substring of another's", () => {
    expect(linksOwnStatusPage('<a href="https://status.cal.com/">Status</a>', "cal.com")).toBe(true);
    expect(linksOwnStatusPage('<a href="https://www.vercel-status.com">Status</a>', "vercel.com")).toBe(true);
    expect(linksOwnStatusPage('<a href="https://www.githubstatus.com">Status</a>', "github.com")).toBe(true);
    expect(linksOwnStatusPage('<a href="https://status.calendly.com">Calendly status</a>', "cal.com")).toBe(false);
    expect(linksOwnStatusPage('<a href="https://www.githubstatus.com">GitHub status</a>', "git.example.com")).toBe(false);
    expect(linksOwnStatusPage('<a href="https://twitter.com/acme/status/123">Tweet</a>', "acme.com")).toBe(false);
  });
  it("countCrossOriginSubresources reads unquoted src and CDN stylesheets, not data-src", () => {
    expect(countCrossOriginSubresources("<script src=https://cdn.jsdelivr.net/npm/x@1/x.js></script>", "https://site.test/")).toBe(1);
    expect(countCrossOriginSubresources('<link rel="stylesheet" href="https://cdn.example.net/a.css">', "https://site.test/")).toBe(1);
    expect(countCrossOriginSubresources('<img data-src="https://cdn.example.net/a.png"><script src="/app.js"></script><link rel="stylesheet" href="/a.css">', "https://site.test/")).toBe(0);
  });
});

describe("has_robots_txt — an unanswered request is not an absence", () => {
  it("503 / 429 / 403 on /robots.txt -> INCONCLUSIVE", async () => {
    for (const code of [503, 429, 403]) {
      route = (url) => {
        const p = new URL(url).pathname;
        if (p === "/") return res(200, HOME());
        if (p === "/robots.txt") return res(code, "busy", { "content-type": "text/plain" });
        return res(404, "Not Found", { "content-type": "text/plain" });
      };
      expect((await check("has_robots_txt")).status).toBe("INCONCLUSIVE");
    }
  });
  it("a real 404 still WARNs", async () => {
    route = (url) => (new URL(url).pathname === "/" ? res(200, HOME()) : res(404, "Not Found", { "content-type": "text/plain" }));
    expect((await check("has_robots_txt")).status).toBe("WARN");
  });
});

describe("vary_header — field-qualified private is still shared-cacheable", () => {
  it("gzip + private=\"set-cookie\", max-age=600 with no Vary -> WARN", async () => {
    route = (url) => (new URL(url).pathname === "/"
      ? res(200, HOME(), { "content-encoding": "gzip", "cache-control": 'private="set-cookie", max-age=600' })
      : res(404, "Not Found", { "content-type": "text/plain" }));
    expect((await check("vary_header")).status).toBe("WARN");
  });
  it("gzip + bare private -> PASS (nothing shared to mix up)", async () => {
    route = (url) => (new URL(url).pathname === "/"
      ? res(200, HOME(), { "content-encoding": "gzip", "cache-control": "private, max-age=0" })
      : res(404, "Not Found", { "content-type": "text/plain" }));
    expect((await check("vary_header")).status).toBe("PASS");
  });
});

describe("meta_description / image alt / live chat / responsive images", () => {
  it("a '>' inside the quoted description does not end the tag", async () => {
    route = (url) => (new URL(url).pathname === "/" ? res(200, HOME("", '<meta name="description" content="Compare plans > pick one">')) : res(404, "x", { "content-type": "text/plain" }));
    expect((await check("meta_description")).status).toBe("PASS");
  });
  it("an image whose CLASS contains 'alt' still has no alt", async () => {
    route = (url) => (new URL(url).pathname === "/" ? res(200, HOME('<img src="/a.png" alt="A"><img src="/e.png" class="x alt y">')) : res(404, "x", { "content-type": "text/plain" }));
    const c = await check("image_alt_coverage");
    expect(c.detail).toMatch(/1\s*(?:of|\/)\s*2|50%/);
  });
  it("Freshworks' fw-cdn loader is a live chat widget; the word 'Freshchat' is not", async () => {
    route = (url) => (new URL(url).pathname === "/" ? res(200, HOME('<script src="//fw-cdn.com/1234567/2345678.js" chat="true"></script>')) : res(404, "x", { "content-type": "text/plain" }));
    expect((await check("live_chat_signal")).status).toBe("PASS");
    route = (url) => (new URL(url).pathname === "/" ? res(200, HOME('<a href="/blog/why-we-left-freshchat">Blog</a>')) : res(404, "x", { "content-type": "text/plain" }));
    expect((await check("live_chat_signal")).status).not.toBe("PASS");
  });
  it("a 1200x40 raster banner still needs responsive markup", async () => {
    route = (url) => (new URL(url).pathname === "/" ? res(200, HOME('<img src="/banner.jpg" width="1200" height="40" alt="">')) : res(404, "x", { "content-type": "text/plain" }));
    expect((await check("responsive_images")).status).toBe("WARN");
  });
  it("an 18px icon and an SVG logo only -> NOT_APPLICABLE", async () => {
    route = (url) => (new URL(url).pathname === "/" ? res(200, HOME('<img src="/logo.svg" alt="Logo"><img src="/s.gif" width="18" height="18" alt="">')) : res(404, "x", { "content-type": "text/plain" }));
    expect((await check("responsive_images")).status).toBe("NOT_APPLICABLE");
  });
  it("an empty client-rendered shell is never NOT_APPLICABLE (images not rendered yet)", async () => {
    const shell = `<!doctype html><html><head><title>App</title><script type="module" src="/assets/index.js"></script></head><body><div id="root"></div></body></html>`;
    route = (url) => (new URL(url).pathname === "/" ? res(200, shell) : res(404, "x", { "content-type": "text/plain" }));
    expect((await check("responsive_images")).status).not.toBe("NOT_APPLICABLE");
  });
});
