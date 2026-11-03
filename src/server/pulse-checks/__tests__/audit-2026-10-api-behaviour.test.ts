import { describe, it, expect, vi, afterEach } from "vitest";
import { runApiBehaviourChecks, graphqlProbeUrl, sessionCookies } from "../api-behaviour";
import type { ExtendedCheckContext } from "../_types";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Audit, October 2026 — every fixture here is the shape a real API returned
// (checked with curl): api.stripe.com, jsonplaceholder, httpbin, countries
// GraphQL, petstore.swagger.io/v2, api.github.com. Each fix is tested in both
// directions: the input that must now change, and the one that must not.
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

type Stub = { status: number; headers?: Record<string, string> | Array<[string, string]>; body?: string };
type Probe = "base" | "options" | "error" | "graphql";

/** Route each of the four probes to its own fixture; anything unspecified 404s. */
function stubProbes(fixtures: Partial<Record<Probe, Stub | "throw">>, calls: string[] = []) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    calls.push(u);
    const which: Probe = init.method === "OPTIONS" ? "options"
      : u.includes("?query=") ? "graphql"
        : u.includes("__pulse_probe_") ? "error"
          : "base";
    const r = fixtures[which] ?? { status: 404, body: "" };
    if (r === "throw") throw new Error("network");
    return { status: r.status, headers: new Headers(r.headers ?? {}), text: async () => r.body ?? "" } as unknown as Response;
  }));
}

afterEach(() => { vi.unstubAllGlobals(); });

type Check = { checkKey: string; status: string; detail?: string; confidence?: string; evidence?: string };
const find = (checks: Check[], key: string) => checks.find((c) => c.checkKey === key)!;

const REFLECT = { "access-control-allow-origin": "https://pulse-probe.invalid", "access-control-allow-credentials": "true" };

describe("api_cors_origin_reflection — a confident FAIL needs cookie-based auth", () => {
  it("FAILs reflection + credentials when the API sets a session cookie", async () => {
    stubProbes({ base: { status: 200, headers: { ...REFLECT, "set-cookie": "sid=s%3Aabc; Path=/; HttpOnly; Secure; SameSite=None" } } });
    const c = find(await runApiBehaviourChecks(ctx()), "api_cors_origin_reflection");
    expect(c.status).toBe("FAIL");
    expect(c.confidence).toBe("HIGH");
    expect(c.evidence).toContain("sid");
  });

  it("WARNs (not FAIL) reflection + credentials on a Basic-auth API with no cookies (api.stripe.com shape)", async () => {
    stubProbes({ base: { status: 401, headers: { ...REFLECT, "www-authenticate": 'Basic realm="Stripe"', "content-type": "application/json" }, body: '{"error":{}}' } });
    const c = find(await runApiBehaviourChecks(ctx()), "api_cors_origin_reflection");
    expect(c.status).toBe("WARN");
    expect(c.confidence).toBe("MEDIUM");
    expect(c.detail).toMatch(/only if the API authenticates with cookies/);
    expect(c.detail).toMatch(/No cookie-based auth was seen/);
  });

  it("does not count CDN plumbing cookies as a session", async () => {
    stubProbes({ base: { status: 200, headers: [
      ...Object.entries(REFLECT),
      ["set-cookie", "__cf_bm=x; path=/; HttpOnly"],
      ["set-cookie", "_cfuvid=y; path=/"],
    ] } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_cors_origin_reflection").status).toBe("WARN");
  });

  it("keeps a session cookie that arrives before a CDN cookie (repeated Set-Cookie)", () => {
    expect(sessionCookies([{ ok: true, status: 200, body: "", headers: { "set-cookie": "session=1; Path=/, __cf_bm=2; Path=/" } }]))
      .toEqual(["session"]);
  });

  it("reads reflection set only on the preflight, not just the first response", async () => {
    stubProbes({
      base: { status: 200, headers: {} },
      options: { status: 204, headers: { ...REFLECT, "set-cookie": "session=abc; Path=/" } },
    });
    const checks = await runApiBehaviourChecks(ctx());
    expect(find(checks, "api_cors_origin_reflection").status).toBe("FAIL");
  });

  it("still PASSes an API that does not reflect", async () => {
    stubProbes({ base: { status: 200, headers: { "access-control-allow-origin": "https://app.example.com", "access-control-allow-credentials": "true" } } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_cors_origin_reflection").status).toBe("PASS");
  });
});

describe("api_cors_credentials — our own probe origin is not 'a specific origin'", () => {
  it("says the origin is reflected when it is the probe origin echoed back", async () => {
    stubProbes({ base: { status: 200, headers: REFLECT } });
    const c = find(await runApiBehaviourChecks(ctx()), "api_cors_credentials");
    expect(c.status).toBe("PASS");
    expect(c.detail).not.toMatch(/names a specific origin/);
    expect(c.detail).toMatch(/reflects whatever Origin/);
  });

  it("still describes a genuinely named origin as specific", async () => {
    stubProbes({ base: { status: 200, headers: { "access-control-allow-origin": "https://app.example.com" } } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_cors_credentials").detail).toMatch(/names a specific origin/);
  });
});

describe("api_graphql_introspection — asks the question, at the right URL", () => {
  it("probes a /graphql scan target as-is, never /graphql/graphql", () => {
    expect(graphqlProbeUrl("https://countries.trevorblades.com/graphql")).toBe("https://countries.trevorblades.com/graphql");
    expect(graphqlProbeUrl("https://petstore.swagger.io/v2")).toBe("https://petstore.swagger.io/graphql");
  });

  it("sends an introspection query and WARNs when it is answered (countries.trevorblades.com)", async () => {
    const calls: string[] = [];
    stubProbes({
      base: { status: 204, headers: {} },
      graphql: { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: '{"data":{"__schema":{"queryType":{"name":"Query"}}}}' },
    }, calls);
    const c = find(await runApiBehaviourChecks(ctx({ httpsUrl: "https://countries.trevorblades.com/graphql" })), "api_graphql_introspection");
    expect(c.status).toBe("WARN");
    const gq = calls.find((u) => u.includes("?query="))!;
    expect(gq).not.toContain("/graphql/graphql");
    expect(decodeURIComponent(gq)).toContain("{__schema{queryType{name}}}");
  });

  it("PASSes only when the GraphQL server refuses introspection", async () => {
    stubProbes({ graphql: { status: 400, headers: { "content-type": "application/json" }, body: '{"errors":[{"message":"GraphQL introspection is not allowed by Apollo Server, but the query contained __schema or __type."}]}' } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_graphql_introspection").status).toBe("PASS");
  });

  it("is INCONCLUSIVE when the endpoint refuses the GET transport rather than introspection", async () => {
    stubProbes({ graphql: { status: 405, headers: { "content-type": "application/json" }, body: '{"errors":[{"message":"GET query missing. Use POST."}]}' } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_graphql_introspection").status).toBe("INCONCLUSIVE");
  });

  it("is SKIPPED on a REST host whose /graphql is a 404", async () => {
    stubProbes({ graphql: { status: 404, headers: { "content-type": "application/json" }, body: '{"message":"Not Found"}' } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_graphql_introspection").status).toBe("SKIPPED");
  });
});

describe("api_server_banner — reads every response, not only the base URL", () => {
  it("WARNs on a versioned banner seen only on the error probe (petstore: nginx in front, Jetty behind)", async () => {
    stubProbes({
      base: { status: 404, headers: { server: "nginx", "content-type": "text/html" }, body: "<html>404</html>" },
      error: { status: 404, headers: { server: "Jetty(9.2.9.v20150224)", "content-type": "application/xml" }, body: "<?xml version=\"1.0\"?><apiResponse/>" },
    });
    const c = find(await runApiBehaviourChecks(ctx()), "api_server_banner");
    expect(c.status).toBe("WARN");
    expect(c.evidence).toContain("Jetty(9.2.9");
  });

  it("still PASSes when no response carries a version", async () => {
    stubProbes({
      base: { status: 200, headers: { server: "nginx" } },
      error: { status: 404, headers: { server: "cloudflare" } },
    });
    expect(find(await runApiBehaviourChecks(ctx()), "api_server_banner").status).toBe("PASS");
  });
});

describe("api_nosniff_header — graded on API responses, not an HTML landing page", () => {
  it("PASSes when the API's JSON sets nosniff though the base URL is HTML (jsonplaceholder)", async () => {
    stubProbes({
      base: { status: 200, headers: { "content-type": "text/html; charset=UTF-8" }, body: "<!DOCTYPE html>" },
      error: { status: 404, headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" }, body: "{}" },
    });
    expect(find(await runApiBehaviourChecks(ctx()), "api_nosniff_header").status).toBe("PASS");
  });

  it("WARNs when an API JSON response lacks nosniff", async () => {
    stubProbes({ base: { status: 200, headers: { "content-type": "application/json" }, body: "{}" } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_nosniff_header").status).toBe("WARN");
  });

  it("is INCONCLUSIVE when no API-shaped response was observed", async () => {
    stubProbes({
      base: { status: 200, headers: { "content-type": "text/html" }, body: "<html></html>" },
      error: { status: 404, headers: { "content-type": "text/html" }, body: "<html>404</html>" },
    });
    expect(find(await runApiBehaviourChecks(ctx()), "api_nosniff_header").status).toBe("INCONCLUSIVE");
  });
});

describe("response contracts — a rate-limited or error response is not the API's normal response", () => {
  it("is INCONCLUSIVE on a rate-limited 403 (api.github.com, x-ratelimit-remaining: 0)", async () => {
    stubProbes({ base: { status: 403, headers: { "content-type": "application/json", "x-ratelimit-remaining": "0", "x-ratelimit-limit": "60" }, body: '{"message":"API rate limit exceeded"}' } });
    const checks = await runApiBehaviourChecks(ctx());
    for (const k of ["api_cache_policy", "api_request_correlation", "api_response_content_type"]) {
      expect(find(checks, k).status).toBe("INCONCLUSIVE");
    }
  });

  it("is INCONCLUSIVE on a 429", async () => {
    stubProbes({ base: { status: 429, headers: { "retry-after": "30" } } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_cache_policy").status).toBe("INCONCLUSIVE");
  });

  it("does not grade cache policy from an error response that omits it", async () => {
    stubProbes({ base: { status: 404, headers: { "content-type": "text/html" }, body: "<html>404</html>" } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_cache_policy").status).toBe("INCONCLUSIVE");
  });

  it("still WARNs a 200 with no Cache-Control", async () => {
    stubProbes({ base: { status: 200, headers: { "content-type": "application/json" }, body: "{}" } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_cache_policy").status).toBe("WARN");
  });

  it("still PASSes a 200 that declares no-cache", async () => {
    stubProbes({ base: { status: 200, headers: { "content-type": "application/json", "cache-control": "no-cache" }, body: "{}" } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_cache_policy").status).toBe("PASS");
  });

  it("a plain 403 without rate-limit signals is not treated as rate limiting", async () => {
    stubProbes({ base: { status: 403, headers: { "content-type": "application/json", "x-request-id": "r1" }, body: "{}" } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_request_correlation").status).toBe("PASS");
  });
});

describe("api_error_machine_readable — XML errors are structured", () => {
  it("PASSes an application/xml <apiResponse> error (petstore)", async () => {
    stubProbes({ error: { status: 404, headers: { "content-type": "application/xml" }, body: '<?xml version="1.0"?><apiResponse><code>404</code></apiResponse>' } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_error_machine_readable").status).toBe("PASS");
  });

  it("PASSes application/problem+xml", async () => {
    stubProbes({ error: { status: 404, headers: { "content-type": "application/problem+xml" }, body: "<problem/>" } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_error_machine_readable").status).toBe("PASS");
  });

  it("still WARNs an HTML error page", async () => {
    stubProbes({ error: { status: 404, headers: { "content-type": "text/html" }, body: "<html><h1>Not Found</h1></html>" } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_error_machine_readable").status).toBe("WARN");
  });
});

describe("api_verbose_errors — a refusal before routing never reached the error handler", () => {
  it("is INCONCLUSIVE for a JSON 401 to an unknown path", async () => {
    stubProbes({ error: { status: 401, headers: { "content-type": "application/json" }, body: '{"error":"unauthorized"}' } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_verbose_errors").status).toBe("INCONCLUSIVE");
  });

  it("still PASSes a clean JSON 404", async () => {
    stubProbes({ error: { status: 404, headers: { "content-type": "application/json" }, body: '{"error":"not found"}' } });
    expect(find(await runApiBehaviourChecks(ctx()), "api_verbose_errors").status).toBe("PASS");
  });
});
