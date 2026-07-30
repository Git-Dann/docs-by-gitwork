import { describe, it, expect, vi, afterEach } from "vitest";
import { runApiBehaviourChecks } from "../api-behaviour";
import type { ExtendedCheckContext } from "../_types";

// ─────────────────────────────────────────────────────────────────────────────
// The point of this family is that it PROBES rather than reads documentation, so
// the tests that matter are the ones about what a probe is allowed to conclude:
//
//   • A probe that did not complete yields SKIPPED, never FAIL. "We could not
//     look" must not render as "it is not there" (§35).
//   • On a catch-all host, a 200 for a path that should not exist proves nothing,
//     so the error-shape check must decline to answer.
// ─────────────────────────────────────────────────────────────────────────────

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

/** Stub global fetch with a per-URL responder. */
function stubFetch(responder: (url: string, init: RequestInit) => { status: number; headers?: Record<string, string>; body?: string } | "throw") {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const result = responder(String(url), init);
    if (result === "throw") throw new Error("network");
    const headers = new Headers(result.headers ?? {});
    return {
      status: result.status,
      headers,
      text: async () => result.body ?? "",
    } as unknown as Response;
  }));
}

afterEach(() => { vi.unstubAllGlobals(); });

const statusOf = (checks: { checkKey: string; status: string }[], key: string) =>
  checks.find((c) => c.checkKey === key)?.status;

describe("applicability", () => {
  it("skips entirely for shapes with no HTTP surface", async () => {
    for (const platform of ["IOS_APP", "CLI_TOOL", "DESKTOP_APP", "CHROME_EXTENSION"]) {
      const checks = await runApiBehaviourChecks(ctx({ platform }));
      expect(checks.every((c) => c.status === "SKIPPED")).toBe(true);
    }
  });

  it("skips when there are no API signals at all", async () => {
    const checks = await runApiBehaviourChecks(ctx({
      platform: "OTHER",
      ctx: { ...ctx().ctx, hasBackend: false },
    }));
    expect(checks.every((c) => c.status === "SKIPPED")).toBe(true);
  });
});

describe("CORS", () => {
  it("fails wildcard origin combined with credentials", async () => {
    stubFetch(() => ({
      status: 200,
      headers: { "access-control-allow-origin": "*", "access-control-allow-credentials": "true" },
    }));
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_cors_credentials")).toBe("FAIL");
  });

  it("accepts a wildcard on genuinely public data", async () => {
    stubFetch(() => ({ status: 200, headers: { "access-control-allow-origin": "*" } }));
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_cors_credentials")).toBe("PASS");
  });

  it("fails an API that reflects an arbitrary Origin with credentials", async () => {
    stubFetch((_url, init) => {
      const origin = (init.headers as Record<string, string> | undefined)?.Origin ?? "";
      return {
        status: 200,
        headers: { "access-control-allow-origin": origin, "access-control-allow-credentials": "true" },
      };
    });
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_cors_origin_reflection")).toBe("FAIL");
  });

  it("passes an API that names a specific origin", async () => {
    stubFetch(() => ({ status: 200, headers: { "access-control-allow-origin": "https://app.example.com" } }));
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_cors_origin_reflection")).toBe("PASS");
    expect(statusOf(checks, "api_cors_credentials")).toBe("PASS");
  });
});

describe("a failed probe is never a finding", () => {
  it("reports SKIPPED, not FAIL, when every request throws", async () => {
    stubFetch(() => "throw");
    const checks = await runApiBehaviourChecks(ctx());
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.some((c) => c.status === "FAIL")).toBe(false);
    expect(checks.filter((c) => c.status === "SKIPPED").length).toBeGreaterThan(0);
    // And it must say WHY, so a reader can tell this apart from a clean result.
    expect(checks.find((c) => c.checkKey === "api_cors_credentials")!.detail)
      .toMatch(/could not look/i);
  });
});

describe("error responses", () => {
  it("fails a response that leaks a stack trace", async () => {
    stubFetch((url): { status: number; headers?: Record<string, string>; body?: string } =>
      url.includes("__pulse_probe")
        ? { status: 500, body: `TypeError: x is not a function\n    at handler (/var/www/app/src/api.js:42:11)` }
        : { status: 200 });
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_verbose_errors")).toBe("FAIL");
  });

  it("declines to answer on a catch-all host", async () => {
    // A 200 with the app shell for any unknown path proves nothing about the API's
    // error handling — reporting PASS here would be a fabricated clean result.
    stubFetch(() => ({ status: 200, body: "<!doctype html><div id=\"__next\"></div>" }));
    const checks = await runApiBehaviourChecks(ctx({ catchAll200: true }));
    expect(statusOf(checks, "api_verbose_errors")).toBe("SKIPPED");
    expect(checks.find((c) => c.checkKey === "api_verbose_errors")!.detail).toMatch(/catch-all/i);
  });

  it("passes a clean generic error", async () => {
    stubFetch((url): { status: number; headers?: Record<string, string>; body?: string } =>
      url.includes("__pulse_probe")
        ? { status: 404, body: `{"error":"Not found","requestId":"abc123"}` }
        : { status: 200 });
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_verbose_errors")).toBe("PASS");
  });
});

describe("headers and methods", () => {
  it("recognises explicit response contracts and a machine-readable error", async () => {
    stubFetch((url): { status: number; headers?: Record<string, string>; body?: string } =>
      url.includes("__pulse_probe")
        ? { status: 404, headers: { "content-type": "application/problem+json" }, body: '{"type":"https://example.test/not-found","status":404}' }
        : { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_123", "cache-control": "private, no-store" } });
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_response_content_type")).toBe("PASS");
    expect(statusOf(checks, "api_request_correlation")).toBe("PASS");
    expect(statusOf(checks, "api_cache_policy")).toBe("PASS");
    expect(statusOf(checks, "api_error_machine_readable")).toBe("PASS");
  });

  it("does not claim an HTML catch-all is a valid API error contract", async () => {
    stubFetch((url): { status: number; headers?: Record<string, string>; body?: string } =>
      url.includes("__pulse_probe")
        ? { status: 200, headers: { "content-type": "text/html" }, body: "<html>app shell</html>" }
        : { status: 200, headers: { "content-type": "application/json" } });
    const checks = await runApiBehaviourChecks(ctx({ catchAll200: true }));
    expect(statusOf(checks, "api_error_machine_readable")).toBe("SKIPPED");
  });

  it("warns when the server advertises its exact version", async () => {
    stubFetch(() => ({ status: 200, headers: { server: "nginx/1.24.0", "x-powered-by": "Express" } }));
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_server_banner")).toBe("WARN");
  });

  it("passes a version-less server header", async () => {
    stubFetch(() => ({ status: 200, headers: { server: "cloudflare" } }));
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_server_banner")).toBe("PASS");
  });

  it("recognises rate-limit headers in either naming convention", async () => {
    stubFetch(() => ({ status: 200, headers: { "ratelimit-remaining": "99" } }));
    expect(statusOf(await runApiBehaviourChecks(ctx()), "api_rate_limit_headers")).toBe("PASS");

    stubFetch(() => ({ status: 200, headers: { "x-ratelimit-limit": "100" } }));
    expect(statusOf(await runApiBehaviourChecks(ctx()), "api_rate_limit_headers")).toBe("PASS");

    stubFetch(() => ({ status: 200, headers: {} }));
    expect(statusOf(await runApiBehaviourChecks(ctx()), "api_rate_limit_headers")).toBe("WARN");
  });

  it("warns when TRACE is advertised", async () => {
    stubFetch((_url, init) =>
      init.method === "OPTIONS"
        ? { status: 204, headers: { allow: "GET, POST, TRACE, OPTIONS" } }
        : { status: 200 });
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_trace_method")).toBe("WARN");
  });
});

describe("GraphQL", () => {
  it("does not apply when there is no GraphQL endpoint", async () => {
    stubFetch((url) => (url.endsWith("/graphql") ? { status: 404, body: "Not found" } : { status: 200 }));
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_graphql_introspection")).toBe("SKIPPED");
  });

  it("warns when a playground is served to an unauthenticated GET", async () => {
    stubFetch((url) =>
      url.endsWith("/graphql")
        ? { status: 200, headers: { "content-type": "text/html" }, body: "<div id=graphiql>GraphiQL</div>" }
        : { status: 200 });
    const checks = await runApiBehaviourChecks(ctx());
    expect(statusOf(checks, "api_graphql_introspection")).toBe("WARN");
  });
});
