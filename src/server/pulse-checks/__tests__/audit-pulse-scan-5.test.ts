// @vitest-environment node
/**
 * Audit packet pulse-scan-5. Every input below is shaped on what the live site actually
 * served (curl, October 2026). Each case is two-sided: the false verdict must change, and a
 * realistic correct input must keep its verdict.
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

import { runUrlChecks, classifyTopicPage } from "@/server/pulse-scan";

const res = (status: number, body: string, headers: Record<string, string> = {}, finalUrl = "https://site.test/") => {
  const r = new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
  Object.defineProperty(r, "url", { value: finalUrl });
  return r;
};

const PROSE = Array.from({ length: 12 }, (_, i) =>
  `<p>Section ${i}: our team builds tools that help people ship reliable software faster, with clear documentation and friendly support.</p>`).join("\n");
const page = (head: string, body: string) =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Acme — Build faster</title>${head}</head>` +
  `<body><nav><a href="/pricing">Pricing</a><a href="/docs">Docs</a><a href="/about">About</a><a href="/blog">Blog</a>` +
  `<a href="/contact">Contact</a><a href="/careers">Careers</a></nav><main><h1>Acme</h1>${PROSE}${body}</main></body></html>`;

async function scan(html: string, headers: Record<string, string> = {}) {
  route = (url) => {
    const p = new URL(url).pathname;
    if (p === "/") return res(200, html, headers);
    return res(404, "not found", { "content-type": "text/plain" }, url);
  };
  const out = await runUrlChecks("https://site.test", "SAAS");
  return Object.fromEntries(out.checks.map((c) => [c.checkKey, c]));
}

beforeEach(() => { route = () => new Error("unset"); });

describe("live_chat_signal needs a widget, not a vendor's name", () => {
  it("figma.com blog slug and bolt.new HubSpot logo are not a chat widget", async () => {
    const c = await scan(page("",
      `<script>self.__next_f.push([1,"[\\"/blog/the-making-of-practice/\\",\\"/blog/intercom-pioneer-ai-summit-b/\\"]"])</script>` +
      `<div aria-label="Google, Microsoft, Salesforce, AWS, Meta, HubSpot, Accenture, TikTok"><span class="i-bolt:logos-hubspot?mask"></span></div>`));
    expect(c.live_chat_signal.status).toBe("WARN");
  }, 60_000);
  it("a real Intercom / Crisp install is still detected", async () => {
    const c = await scan(page("",
      `<script>window.intercomSettings={app_id:"abc123"};</script><script async src="https://widget.intercom.io/widget/abc123"></script>`));
    expect(c.live_chat_signal.status).toBe("PASS");
    const d = await scan(page("", `<script>window.$crisp=[];window.CRISP_WEBSITE_ID="x";</script><script src="https://client.crisp.chat/l.js" async></script>`));
    expect(d.live_chat_signal.status).toBe("PASS");
  }, 60_000);
});

describe("meta_description reads the tag whatever the attribute order", () => {
  it("bbc.co.uk: data-rh before name", async () => {
    const c = await scan(page(
      `<meta data-rh="true" name="description" content="The best of the BBC, with the latest news and sport headlines, weather, TV &amp; radio highlights and much more from across the whole of BBC Online."/>`, ""));
    expect(c.meta_description.status).toBe("PASS");
    expect(c.meta_description.evidence).toMatch(/^The best of the BBC/);
  }, 60_000);
  it("an apostrophe inside a double-quoted description does not truncate it", async () => {
    const c = await scan(page(`<meta name="description" content="We're the UK's friendliest scanner.">`, ""));
    expect(c.meta_description.status).toBe("PASS");
    expect(c.meta_description.evidence).toBe("We're the UK's friendliest scanner.");
  }, 60_000);
  it("og:/twitter: descriptions alone are still not a meta description", async () => {
    const c = await scan(page(
      `<meta property="og:description" content="Hacker News"><meta name="twitter:description" content="Hacker News">`, ""));
    expect(c.meta_description.status).toBe("WARN");
  }, 60_000);
});

describe("native_lazy_loading judges only media that is in the HTML", () => {
  it("no <img>/<iframe> at all (anthropic.com, zalando.de) is not a WARN", async () => {
    const c = await scan(page("", `<script>function initLazyLoading(){ /* custom loader */ }</script>`));
    expect(c.native_lazy_loading.status).not.toBe("WARN");
    expect(c.native_lazy_loading.detail).not.toMatch(/improve LCP/);
  }, 60_000);
  it("eager images still WARN, and quoted or unquoted loading=lazy PASSes", async () => {
    const eager = await scan(page("", `<img src="/hero.jpg" alt="Hero"><img src="/feature.png" alt="Feature">`));
    expect(eager.native_lazy_loading.status).toBe("WARN");
    const quoted = await scan(page("", `<img src="/hero.jpg" alt="Hero"><img src="/f.png" loading="lazy" alt="F">`));
    expect(quoted.native_lazy_loading.status).toBe("PASS");
    const bare = await scan(page("", `<img src="/hero.jpg" alt="Hero"><img src=/f.png loading=lazy alt=F>`));
    expect(bare.native_lazy_loading.status).toBe("PASS");
  }, 120_000);
});

describe("no_hash_routing ignores other sites' routers", () => {
  it("wikipedia's stats link and baidu's beian link are not this site's routes", async () => {
    const c = await scan(page("",
      `<li id="footer-places-statslink"><a href="https://stats.wikimedia.org/#/en.wikipedia.org">Statistics</a></li>` +
      `<p class="lh"><a class="text-color" href="https://beian.mps.gov.cn/#/query/webSearch?code=11010802025">beian</a></p>`));
    expect(c.no_hash_routing.status).toBe("PASS");
  }, 60_000);
  it("relative and same-host hash routes still WARN", async () => {
    const rel = await scan(page("", `<a href="#/settings">Settings</a>`));
    expect(rel.no_hash_routing.status).toBe("WARN");
    const same = await scan(page("", `<a href="https://www.site.test/#/dashboard">Dashboard</a>`));
    expect(same.no_hash_routing.status).toBe("WARN");
  }, 120_000);
});

describe("no_server_version is informational, matching server_header_leakage", () => {
  it("badssl.com's nginx/1.10.3 (Ubuntu) is a WARN, not a FAIL", async () => {
    const c = await scan(page("", ""), { server: "nginx/1.10.3 (Ubuntu)" });
    expect(c.no_server_version.status).toBe("WARN");
    expect(c.no_server_version.detail).toContain("nginx/1.10.3");
  }, 60_000);
  it("a versionless Server header still PASSes", async () => {
    const c = await scan(page("", ""), { server: "cloudflare" });
    expect(c.no_server_version.status).toBe("PASS");
  }, 60_000);
});

describe("media_kit: a press-kit archive is a media kit", () => {
  const MEDIA_KIT_TOPIC = /media kit|press kit|brand|logos?/i;
  it("anthropic.com/press-kit → 307 → .zip is present", () => {
    const probe = { status: 200, contentType: "application/zip", body: "PK\u0003\u0004", finalUrl: "https://www-cdn.anthropic.com/ae59ca4ca194dac9c9dc3bc78c5829468cb0e8af.zip" };
    expect(classifyTopicPage(probe, "/press-kit", MEDIA_KIT_TOPIC, "home | anthropic")).toBe("present");
  });
  it("the homepage soft-routed to /press-kit, or an archive at an unrelated path, is not", () => {
    const home = { status: 200, contentType: "text/html", body: "<title>Home | Anthropic</title><h1>AI research</h1>", finalUrl: "https://www.anthropic.com/press-kit" };
    expect(classifyTopicPage(home, "/press-kit", MEDIA_KIT_TOPIC, "home | anthropic")).toBe("unverified");
    const zip = { status: 200, contentType: "application/zip", body: "PK", finalUrl: "https://cdn.site.test/release-1.2.zip" };
    expect(classifyTopicPage(zip, "/download", MEDIA_KIT_TOPIC, null)).toBe("unverified");
  });
});
