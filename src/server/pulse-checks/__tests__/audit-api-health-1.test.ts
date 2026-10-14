import { describe, it, expect, vi, beforeEach } from "vitest";

const guard = vi.hoisted(() => ({ fetchScannableUrl: vi.fn() }));
vi.mock("@/server/pulse-lite/url-guard", () => guard);

import { runApiHealthChecks } from "../api-health";
import type { ExtendedCheckContext } from "../_types";

function ctx(httpsUrl: string, html: string, platform = "SAAS"): ExtendedCheckContext {
  const hostname = new URL(httpsUrl).hostname;
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: httpsUrl },
    httpsUrl,
    hostname,
    platform,
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

function unverified(checks: Awaited<ReturnType<typeof runApiHealthChecks>>) {
  return checks.find((c) => c.checkKey === "api_endpoint_unverified")!;
}

beforeEach(() => {
  guard.fetchScannableUrl.mockReset();
});

describe("api_endpoint_unverified — only report paths the app itself would call on this host", () => {
  it("does not probe API strings found in protocol-relative third-party CDN bundles (HubSpot)", async () => {
    const html = `<html><head><script src="//static.hsappstatic.net/head-dlb/static-1.5007/bundle.production.js" crossOrigin="anonymous"></script></head><body></body></html>`;
    guard.fetchScannableUrl.mockImplementation(async (url: string) => {
      if (url.includes("static.hsappstatic.net")) return new Response('function e(i,o){var l=document.createElement("iframe");l.src=i+"/api/embed/error-page/"+o}', { status: 200 });
      return new Response("Not Found", { status: 404 });
    });
    const checks = await runApiHealthChecks(ctx("https://app.hubspot.com", html));
    expect(unverified(checks).status).not.toBe("WARN");
    const fetched = guard.fetchScannableUrl.mock.calls.map((c) => String(c[0]));
    expect(fetched.some((u) => u.includes("static.hsappstatic.net"))).toBe(false);
    expect(fetched.some((u) => u.includes("/api/embed/error-page"))).toBe(false);
  });

  it("does not treat an OpenAPI servers base path as a dead endpoint, and probes against the origin (Petstore)", async () => {
    const html = '{"openapi":"3.0.4","info":{"title":"Swagger Petstore - OpenAPI 3.0"},"servers":[{"url":"/api/v3"}],"paths":{"/pet":{}}}';
    guard.fetchScannableUrl.mockResolvedValue(new Response("Not Found", { status: 404 }));
    const checks = await runApiHealthChecks(ctx("https://petstore3.swagger.io/api/v3/openapi.json", html, "API_BACKEND"));
    expect(unverified(checks).status).not.toBe("WARN");
  });

  it("probes root-relative paths on the origin, not appended to the scanned page path", async () => {
    const html = `<script>fetch("/api/status").then(r=>r.json())</script>`;
    guard.fetchScannableUrl.mockImplementation(async (url: string) =>
      url === "https://app.example.test/api/status" ? new Response("{}", { status: 200 }) : new Response("Not Found", { status: 404 }),
    );
    const checks = await runApiHealthChecks(ctx("https://app.example.test/dashboard/home", html));
    expect(unverified(checks).status).toBe("PASS");
  });

  it("still WARNs on a real dead same-origin reference, including one inside a protocol-relative same-origin bundle", async () => {
    const html = `<html><head><script src="//shop.example.test/_next/static/chunks/main-3f9a.js"></script></head><body><script>fetch("/api/legacy-orders",{method:"GET"})</script></body></html>`;
    guard.fetchScannableUrl.mockImplementation(async (url: string) => {
      if (url.endsWith("/_next/static/chunks/main-3f9a.js")) return new Response('axios.get("/api/v2/cart");axios.get("/api/old-wishlist")', { status: 200 });
      if (url === "https://shop.example.test/api/v2/cart") return new Response("{}", { status: 200 });
      return new Response("Not Found", { status: 404 });
    });
    const checks = await runApiHealthChecks(ctx("https://shop.example.test", html));
    const c = unverified(checks);
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("/api/legacy-orders");
    expect(c.detail).toContain("/api/old-wishlist");
    expect(c.detail).not.toContain("/api/v2/cart");
  });
});
