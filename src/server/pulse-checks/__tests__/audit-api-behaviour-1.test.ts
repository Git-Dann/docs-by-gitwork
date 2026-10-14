import { describe, it, expect, vi, afterEach } from "vitest";
import { runApiBehaviourChecks } from "../api-behaviour";
import type { ExtendedCheckContext } from "../_types";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

function ctx(overrides: Partial<ExtendedCheckContext> = {}): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html: "", responseTimeMs: 10, finalUrl: "https://api.example.com" },
    httpsUrl: "https://api.example.com",
    hostname: "api.example.com",
    platform: "API_BACKEND",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: "",
    catchAll200: false,
    ...overrides,
  };
}

type Stub = { status: number; headers?: Record<string, string>; body?: string };

/** The scanned URL itself gets `main`; every probe path (error probe, /graphql) 404s. */
function stubMain(main: Stub, mainUrl = "https://api.example.com") {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const r: Stub = String(url).replace(/\/+$/, "") === mainUrl.replace(/\/+$/, "")
      ? main
      : { status: 404, body: "Not found" };
    // A null-body status (204/205/304) must be constructed without a body.
    const nullBody = r.status === 204 || r.status === 205 || r.status === 304;
    const res = new Response(nullBody ? null : (r.body ?? ""), { status: r.status, headers: new Headers(r.headers ?? {}) });
    // A string body makes Response add `text/plain` — the fixture must carry only the headers it set.
    if (!Object.keys(r.headers ?? {}).some((h) => h.toLowerCase() === "content-type")) res.headers.delete("content-type");
    return res;
  }));
}

afterEach(() => { vi.unstubAllGlobals(); });

const find = (checks: { checkKey: string; status: string; detail?: string; evidence?: string }[], key: string) =>
  checks.find((c) => c.checkKey === key)!;

describe("api_request_correlation recognises platform request IDs", () => {
  it("passes a Vercel-hosted response carrying x-vercel-id (posthog.com / supabase.com)", async () => {
    stubMain({
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, must-revalidate",
        server: "Vercel",
        "x-vercel-cache": "HIT",
        "x-vercel-id": "lhr1::p6n27-1792000426577-2cc20c657362",
      },
      body: "<!doctype html><html></html>",
    });
    const c = find(await runApiBehaviourChecks(ctx()), "api_request_correlation");
    expect(c.status).toBe("PASS");
    expect(c.evidence).toContain("x-vercel-id");
  });

  it("passes x-github-request-id", async () => {
    stubMain({ status: 200, headers: { "content-type": "application/json; charset=utf-8", "x-github-request-id": "167D:139546:71B07A:AABD68:6ACFC198" }, body: "{}" });
    expect(find(await runApiBehaviourChecks(ctx()), "api_request_correlation").status).toBe("PASS");
  });

  it("still warns when no request identifier exists (stripe.com marketing HTML shape)", async () => {
    stubMain({
      status: 200,
      headers: {
        server: "nginx",
        "content-type": "text/html; charset=utf-8",
        "x-content-type-options": "nosniff",
        "x-mkt-cache": "HIT",
        "x-stripe-proxy-response": "upstream",
        "x-served-by": "cache-lcy-egml8630047-LCY",
      },
      body: "<!doctype html>",
    });
    expect(find(await runApiBehaviourChecks(ctx()), "api_request_correlation").status).toBe("WARN");
  });
});

describe("api_response_content_type does not demand a media type on a bodiless response", () => {
  it("does not WARN on a 204 No Content (countries.trevorblades.com/graphql)", async () => {
    stubMain({
      status: 204,
      headers: {
        "cache-control": "s-maxage=0, no-cache, no-store, must-revalidate",
        "access-control-allow-origin": "*",
        "x-powered-by": "Stellate",
      },
    }, "https://countries.trevorblades.com/graphql");
    const c = find(await runApiBehaviourChecks(ctx({ httpsUrl: "https://countries.trevorblades.com/graphql" })), "api_response_content_type");
    expect(c.status).not.toBe("WARN");
    expect(c.status).toBe("SKIPPED");
    expect(c.detail).toMatch(/204/);
  });

  it("still warns on a 200 with a body but no Content-Type", async () => {
    stubMain({ status: 200, headers: { server: "gunicorn/19.9.0" }, body: '{"slideshow":{"title":"Sample"}}' });
    expect(find(await runApiBehaviourChecks(ctx()), "api_response_content_type").status).toBe("WARN");
  });

  it("still passes an explicit JSON media type", async () => {
    stubMain({ status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: "{}" });
    expect(find(await runApiBehaviourChecks(ctx()), "api_response_content_type").status).toBe("PASS");
  });
});
