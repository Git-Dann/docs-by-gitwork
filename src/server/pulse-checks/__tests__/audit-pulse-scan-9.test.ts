// @vitest-environment node
/**
 * Audit packet pulse-scan-9, live-observed false positives:
 *  - universal_links: github.com serves its AASA at /apple-app-site-association (root), not /.well-known.
 *  - viewport_meta: example.com serves <meta name=viewport ...> unquoted.
 *  - vary_header: flipkart.com (br + private, no-store) / httpbin (uncompressed) cannot suffer a CDN variant mix-up.
 * Each case is two-sided: the real defect shape must still be reported.
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

const res = (status: number, body: string, headers: Record<string, string> = {}) => {
  const r = new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
  Object.defineProperty(r, "url", { value: "https://site.test/" });
  return r;
};

const GITHUB_HOME = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><title>GitHub</title></head><body><a href="https://apps.apple.com/app/github/id1477376905">Download on the App Store</a><a href="/privacy">Privacy</a></body></html>`;
const AASA = `{\n  "applinks": {\n    "defaults": {\n      "caseSensitive": false\n    },\n    "details": [{ "appIDs": ["VEKTX9H2N7.com.github.stormbreaker.prod"], "components": [{ "/": "/*" }] }]\n  }\n}`;

async function check(key: string, platform = "SAAS") {
  const out = await runUrlChecks("https://site.test", platform);
  const c = out.checks.find((x) => x.checkKey === key);
  expect(c, key).toBeDefined();
  return c!;
}

beforeEach(() => { route = () => new Error("unset"); });

describe("universal_links honours the root AASA location", () => {
  it("github.com shape: 404 at .well-known, valid AASA at root -> PASS", async () => {
    route = (url) => {
      const p = new URL(url).pathname;
      if (p === "/") return res(200, GITHUB_HOME);
      if (p === "/apple-app-site-association") return res(200, AASA, { "content-type": "application/octet-stream" });
      return res(404, "Not Found", { "content-type": "text/plain; charset=utf-8" });
    };
    expect((await check("universal_links")).status).toBe("PASS");
  });
  it("no AASA anywhere -> still WARN", async () => {
    route = (url) => (new URL(url).pathname === "/" ? res(200, GITHUB_HOME) : res(404, "Not Found", { "content-type": "text/plain" }));
    expect((await check("universal_links")).status).toBe("WARN");
  });
  it("root path answers generic JSON (not an AASA) -> still WARN", async () => {
    route = (url) => {
      const p = new URL(url).pathname;
      if (p === "/") return res(200, GITHUB_HOME);
      if (p === "/apple-app-site-association") return res(200, '{"error":"not_found","status":404}', { "content-type": "application/json" });
      return res(404, "Not Found", { "content-type": "text/plain" });
    };
    expect((await check("universal_links")).status).toBe("WARN");
  });
});

describe("viewport_meta accepts an unquoted attribute value", () => {
  it("example.com shape: <meta name=viewport ...> -> PASS", async () => {
    const html = `<!doctype html><html lang=en><head><title>Example Domain</title><meta name=viewport content="width=device-width,initial-scale=1"></head><body><h1>Example Domain</h1></body></html>`;
    route = (url) => (new URL(url).pathname === "/" ? res(200, html) : res(404, "not found", { "content-type": "text/plain" }));
    expect((await check("viewport_meta", "MARKETING_SITE")).status).toBe("PASS");
  });
  it("baidu.com shape: no viewport meta -> still FAIL", async () => {
    const html = `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html;charset=utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"><meta name="theme-color" content="#ffffff"><title>Baidu</title></head><body><h1>Baidu</h1></body></html>`;
    route = (url) => (new URL(url).pathname === "/" ? res(200, html) : res(404, "not found", { "content-type": "text/plain" }));
    expect((await check("viewport_meta", "WEB_APP")).status).toBe("FAIL");
  });
});

describe("vary_header only warns when a cached compressed variant can be mixed up", () => {
  const html = `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Shop</title></head><body><h1>Shop</h1></body></html>`;
  const home = (headers: Record<string, string>) => (url: string) =>
    new URL(url).pathname === "/" ? res(200, html, headers) : res(404, "not found", { "content-type": "text/plain" });

  it("flipkart shape: br + private, no-store, no Vary -> PASS", async () => {
    route = home({ "content-encoding": "br", "cache-control": "private, no-cache, no-store, must-revalidate" });
    expect((await check("vary_header", "WEB_APP")).status).toBe("PASS");
  });
  it("httpbin shape: uncompressed, no Vary -> PASS", async () => {
    route = home({});
    expect((await check("vary_header", "WEB_APP")).status).toBe("PASS");
  });
  it("hydrogen.shop shape: br + cacheable, no Vary -> still WARN", async () => {
    route = home({ "content-encoding": "br", "cache-control": "null" });
    const c = await check("vary_header", "WEB_APP");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/compressed \(br\)/);
  });
  it("public max-age + gzip, no Vary -> still WARN", async () => {
    route = home({ "content-encoding": "gzip", "cache-control": "public, max-age=300" });
    expect((await check("vary_header", "WEB_APP")).status).toBe("WARN");
  });
  it("Vary present -> PASS unchanged", async () => {
    route = home({ "content-encoding": "br", vary: "Accept-Encoding" });
    expect((await check("vary_header", "WEB_APP")).status).toBe("PASS");
  });
});
