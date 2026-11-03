import { afterEach, describe, expect, it, vi } from "vitest";

// Transport boundary only, so the real bounded reader in mobile-extended runs.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import type { ExtendedCheckContext } from "../_types";
import { runAuthExtended } from "../auth-extended";
import { runMobileExtended } from "../mobile-extended";
import { runObservabilityExtended } from "../observability-extended";

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test/" },
    httpsUrl: "https://example.test", hostname: "example.test", platform: "SAAS",
    ctx: { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "password" },
    htmlLower: html.toLowerCase(), catchAll200: false,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("auth_security_notifications: a sign-in form is not a notification disclosure", () => {
  const status = async (html: string) =>
    (await runAuthExtended(context(html))).find((c) => c.checkKey === "auth_security_notifications")?.status;

  it("does not PASS on an email field next to a 'New login?' prompt", async () => {
    expect(await status("<p>Email address. New login? Sign up</p>")).toBe("WARN");
    expect(await status("<p>Enter your email to create a new login</p>")).toBe("WARN");
  });

  it("still PASSes when the notification precedes the new-device event", async () => {
    expect(await status("<h3>Security alerts</h3><p>We email you when a new device signs in to your account.</p>")).toBe("PASS");
    expect(await status("<p>Get notified of every new sign-in.</p>")).toBe("PASS");
  });
});

describe("public_status_page: a customer's own record status is not a service status page", () => {
  const status = async (html: string) =>
    (await runObservabilityExtended(context(html))).find((c) => c.checkKey === "public_status_page")?.status;

  it("does not PASS on order or application status links", async () => {
    expect(await status(`<a href="/account/orders/status">Track</a>`)).toBe("WARN");
    expect(await status(`<a href="/application/status">Check</a>`)).toBe("WARN");
  });

  it("still PASSes on a status page under a support path", async () => {
    expect(await status(`<a href="/support/status">Status</a>`)).toBe("PASS");
    expect(await status(`<a href="/en/status">Status</a>`)).toBe("PASS");
  });
});

describe("reduced_motion_css: the stylesheet read is bounded and an HTML shell is not CSS", () => {
  const HEAD = `<html><head><link rel="stylesheet" href="/a.css"></head><body></body></html>`;
  const reducedMotion = async () =>
    (await runMobileExtended(context(HEAD))).find((c) => c.checkKey === "reduced_motion_css")!;

  it("is INCONCLUSIVE, not WARN, when the stylesheet is larger than the read cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(".a{color:red}".repeat(200_000), { status: 200, headers: { "content-type": "text/css" } })));
    expect((await reducedMotion()).status).toBe("INCONCLUSIVE");
  });

  it("still PASSes when the query appears early in a large stylesheet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("@media (prefers-reduced-motion:reduce){*{animation:none}}" + ".a{}".repeat(600_000),
        { status: 200, headers: { "content-type": "text/css" } })));
    expect((await reducedMotion()).status).toBe("PASS");
  });

  it("treats a 200 HTML shell (soft-routed missing file) as contributing nothing — WARN, not PASS", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("<!doctype html><html><style>@media (prefers-reduced-motion:reduce){}</style></html>",
        { status: 200, headers: { "content-type": "text/html" } })));
    expect((await reducedMotion()).status).toBe("WARN");
  });
});
