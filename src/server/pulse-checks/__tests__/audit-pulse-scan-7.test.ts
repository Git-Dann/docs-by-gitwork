// @vitest-environment node
/**
 * pulse-scan-7 audit (2026-10-14). Each case was verified by hand against the live site
 * with curl before it was called a defect:
 *   · www.gov.uk self-hosts SpeedCurve LUX (lux-measurer / rum-loader) — told "No RUM".
 *   · expo.dev sets <meta name="referrer" content="origin"/> — told "No Referrer-Policy".
 *   · uk.gymshark.com footer links support.gymshark.com/…/returns-policy — told "No refund policy".
 *   · news.ycombinator.com has only an SVG logo and a spacer GIF — told its images aren't responsive.
 *   · en.wikipedia.org sets 6 cookies, 4 without SameSite — PASSed, because only the LAST
 *     Set-Cookie reached the check (Headers.forEach yields them one at a time).
 *
 * The network is faked at the one SSRF-guarded transport; everything else is the real engine.
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

import { runUrlChecks } from "@/server/pulse-scan";

const PROSE = Array.from({ length: 40 }, () => "Find information and services for people, businesses and organisations across the country.").join(" ");

function page(body: string, cookies: string[] = []): Response {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  const r = new Response(body, { status: 200, headers });
  Object.defineProperty(r, "url", { value: "https://site.test/" });
  return r;
}

async function scan(body: string, cookies: string[] = []) {
  route = () => page(body, cookies);
  const out = await runUrlChecks("https://site.test", "WEB_APP");
  return (key: string) => out.checks.find((c) => c.checkKey === key);
}

beforeEach(() => { route = () => new Error("unset"); });

// Shapes copied from the live pages named above.
const LIVE_SHAPES = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Welcome to GOV.UK</title>
<meta name="referrer" content="origin"/>
<script src="/assets/frontend/govuk_publishing_components/vendor/lux/lux-measurer-d66192b1b665d415e1874e49a48138b7ae339548.js" async="async"></script>
<script src="/assets/frontend/govuk_publishing_components/rum-loader-a65b10e18ceeba3bd8a2eac507c7f2c513cdc82f.js" async="async" data-lux-reporter-script="/assets/frontend/govuk_publishing_components/vendor/lux/lux-reporter-24dca204ac4a.js"></script>
</head><body><header><a href="/"><img src="y18.svg" width="18" height="18" style="border:1px white solid; display:block"></a><img src="s.gif" height="10" width="0"></header>
<main><h1>Services and information</h1><p>${PROSE}</p></main>
<footer><a class="navigation_link__fD9xJ" href="https://support.gymshark.com/en-US/article/delivery-information" target="_self">Delivery Information</a><a class="navigation_link__fD9xJ" href="https://support.gymshark.com/en-US/article/returns-policy" target="_self">Returns Policy</a><a href="/api/status">Status</a></footer></body></html>`;

// A page that genuinely lacks every one of those things.
const GENUINELY_MISSING = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Acme</title>
<script src="/static/app.js" defer></script></head><body>
<main><h1>Acme</h1><img src="/images/hero.jpg" width="1200" height="600" alt="Hero"><p>${PROSE}</p>
<a href="/blog/diminishing-returns">Diminishing returns</a></main>
<footer><a href="/terms">Terms</a><a href="/api/status">Status</a></footer></body></html>`;

// Old-style signals that must keep passing.
const OLD_STYLE_PRESENT = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Shop</title>
<script src="https://unpkg.com/web-vitals@4/dist/web-vitals.iife.js"></script></head><body>
<main><h1>Shop</h1><img src="/a.jpg" srcset="/a-2x.jpg 2x" alt="A"><p>${PROSE}</p></main>
<footer><a href="/refund-policy">Refunds</a><a href="/api/status">Status</a></footer></body></html>`;

describe("evidence that was in the page is now read", () => {
  it("gov.uk LUX, expo meta referrer, gymshark returns link, HN images, wikipedia cookies", async () => {
    const check = await scan(LIVE_SHAPES, [
      "tracking_id=abc123; Path=/; Max-Age=3600",
      "sid=xyz; Path=/; Secure; HttpOnly; SameSite=Lax",
    ]);
    expect(check("real_user_monitoring")?.status).toBe("PASS");

    expect(check("referrer_policy")?.status).toBe("PASS");
    expect(check("referrer_policy")?.detail).toMatch(/origin/);

    expect(check("refund_policy")?.status).toBe("PASS");

    expect(check("responsive_images")?.status).toBe("NOT_APPLICABLE");

    // The bad cookie came FIRST; the old code only ever saw the last (good) one and passed.
    const cookie = check("secure_cookie_attributes");
    expect(cookie?.status).toBe("WARN");
    expect(cookie?.detail).toContain("tracking_id");
    expect(cookie?.detail).not.toContain("sid,");
  }, 60_000);
});

describe("real absences are still reported", () => {
  it("a page with none of those things still WARNs on each", async () => {
    const check = await scan(GENUINELY_MISSING, [
      "tracking_id=abc123; Path=/; Max-Age=3600",
      "pref=dark; Path=/; Secure; SameSite=Lax",
    ]);
    expect(check("real_user_monitoring")?.status).toBe("WARN");
    expect(check("real_user_monitoring")?.detail).toMatch(/not visible to this check/);

    expect(check("referrer_policy")?.status).toBe("WARN");
    // …but no longer claims full URLs leak under the browser default.
    expect(check("referrer_policy")?.detail).not.toMatch(/page URLs may leak/);
    expect(check("referrer_policy")?.detail).toMatch(/strict-origin-when-cross-origin/);

    // A blog slug containing "returns" is not a refund policy.
    expect(check("refund_policy")?.status).toBe("WARN");

    // A real raster hero image with no srcset/picture/lazy is still a finding.
    expect(check("responsive_images")?.status).toBe("WARN");

    // An insecure cookie is caught whichever position it is in.
    expect(check("secure_cookie_attributes")?.status).toBe("WARN");
    expect(check("secure_cookie_attributes")?.detail).toContain("tracking_id");
  }, 60_000);

  it("signals the old detector recognised still pass, and fully-hardened cookies pass", async () => {
    const check = await scan(OLD_STYLE_PRESENT, [
      "a=1; Path=/; Secure; SameSite=Lax; Expires=Thu, 14 Oct 2027 00:00:00 GMT",
      "b=2; Path=/; Secure; HttpOnly; SameSite=Strict",
    ]);
    expect(check("real_user_monitoring")?.status).toBe("PASS");
    expect(check("refund_policy")?.status).toBe("PASS");
    expect(check("responsive_images")?.status).toBe("PASS");
    expect(check("secure_cookie_attributes")?.status).toBe("PASS");
    expect(check("secure_cookie_attributes")?.detail).toMatch(/All 2 cookie/);
  }, 60_000);

  it("a response with no cookies is still not assessed", async () => {
    const check = await scan(GENUINELY_MISSING);
    expect(check("secure_cookie_attributes")?.status).toBe("SKIPPED");
  }, 60_000);
});
