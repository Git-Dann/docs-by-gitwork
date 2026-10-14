// @vitest-environment node
/**
 * A 200 is not an answer. vercel.com answers /actuator, /metrics, /graphql and
 * /security with its own HTML homepage while a random path 404s (so catchAll200 is
 * false); cbc.ca answers with a "Menu" page. Every probe below used to decide from
 * the status alone. Each test pins both directions: the soft-routed homepage must
 * NOT produce the finding (or the pass), and the genuine format MUST still be found.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import type { ExtendedCheckContext, PulseScanCheckInput } from "../_types";
import { runSecurityExtended, looksLikeActuator, looksLikePrometheusMetrics, graphqlEnvelope } from "../security-extended";
import { runMissingPagesExtended } from "../missing-pages-extended";
import { runTrustBrandExtended } from "../trust-brand-extended";
import { runApiBehaviourChecks } from "../api-behaviour";
import { runApiHealthChecks } from "../api-health";
import { CATEGORIES } from "../categories";

const DNS = "cloudflare-dns.com";

/** A real homepage that happens to mention the very words naive matchers look for. */
const HOMEPAGE =
  `<!DOCTYPE html><html><head><title>Vercel: Build and deploy the best web experiences</title></head>` +
  `<body><nav>Menu</nav><h1>Ship faster</h1><p>Try our GraphQL playground and Swagger docs. Metrics and actuator ` +
  `dashboards built in.</p><a href="/app/settings-page">Settings</a><p>Select a plan from Pro or Enterprise.</p></body></html>`;
const MENU_PAGE = `<!DOCTYPE html><html><head><title>Menu</title></head><body><h1>Menu</h1></body></html>`;

type Reply = { status: number; body?: string; type?: string } | "throw";
type Router = (path: string, init?: RequestInit) => Reply;

function serve(router: Router) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes(DNS)) {
      return new Response(JSON.stringify({ Answer: [] }), { headers: { "content-type": "application/dns-json" } });
    }
    const reply = router(new URL(url).pathname, init);
    if (reply === "throw") throw new Error("ECONNRESET");
    return new Response(reply.body ?? "", { status: reply.status, headers: { "content-type": reply.type ?? "text/html; charset=utf-8" } });
  }));
}

afterEach(() => { vi.unstubAllGlobals(); });

function context(html: string, overrides: Partial<ExtendedCheckContext> = {}): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
    ...overrides,
  };
}

const get = (checks: PulseScanCheckInput[], key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`missing ${key}`);
  return c;
};

// ── security-extended: /actuator, /swagger-ui, /metrics, /graphql ────────────

describe("security-extended endpoint probes on a soft-routed host", () => {
  it("does not report the homepage as Actuator, Swagger UI, metrics or GraphQL", async () => {
    serve((path) => (/actuator|swagger|metrics|graphql/.test(path) || path === "/" ? { status: 200, body: HOMEPAGE } : { status: 404, body: "nope", type: "text/plain" }));
    const checks = await runSecurityExtended(context(HOMEPAGE));
    expect(get(checks, "no_exposed_actuator").status).toBe("PASS");
    expect(get(checks, "no_exposed_actuator").detail).toMatch(/not an Actuator/);
    expect(get(checks, "no_exposed_swagger_open").status).toBe("PASS");
    expect(get(checks, "no_exposed_prometheus_metrics").status).toBe("PASS");
    const gql = get(checks, "no_graphql_introspection_prod");
    expect(gql.status).toBe("PASS");
    expect(gql.detail).not.toMatch(/A GraphQL endpoint (responded|answered)/);
  });

  it("is inconclusive, not a pass, when the endpoint requests fail", async () => {
    serve((path) => (path === "/" ? { status: 200, body: HOMEPAGE } : "throw"));
    const checks = await runSecurityExtended(context(HOMEPAGE));
    expect(get(checks, "no_exposed_actuator").status).toBe("INCONCLUSIVE");
    expect(get(checks, "no_exposed_swagger_open").status).toBe("INCONCLUSIVE");
    expect(get(checks, "no_exposed_prometheus_metrics").status).toBe("INCONCLUSIVE");
    expect(get(checks, "no_graphql_introspection_prod").status).toBe("INCONCLUSIVE");
    expect(get(checks, "no_graphql_introspection_prod").detail).not.toMatch(/A GraphQL endpoint responded/);
  });
});

describe("security-extended endpoint probes still catch the real thing", () => {
  const ACTUATOR = '{"_links":{"self":{"href":"https://example.test/actuator","templated":false},"health":{"href":"https://example.test/actuator/health","templated":false}}}';
  const SWAGGER = '<!DOCTYPE html><html><head><title>Swagger UI</title><link rel="stylesheet" href="./swagger-ui.css"></head><body><div id="swagger-ui"></div><script>window.ui = SwaggerUIBundle({url: "/v3/api-docs"})</script></body></html>';
  const METRICS = '# HELP http_requests_total The total number of HTTP requests.\n# TYPE http_requests_total counter\nhttp_requests_total{method="post",code="200"} 1027\n';

  it("finds Actuator, Swagger UI, Prometheus metrics and GraphQL introspection", async () => {
    serve((path, init) => {
      if (path === "/actuator") return { status: 200, body: ACTUATOR, type: "application/vnd.spring-boot.actuator.v3+json" };
      if (path === "/swagger-ui") return { status: 200, body: SWAGGER };
      if (path === "/metrics") return { status: 200, body: METRICS, type: "text/plain; version=0.0.4" };
      if (path === "/graphql") {
        if (init?.method === "POST") return { status: 200, body: '{"data":{"__schema":{"types":[{"name":"Query"}]}}}', type: "application/json" };
        return { status: 400, body: '{"errors":[{"message":"Must provide query string."}]}', type: "application/json" };
      }
      if (path === "/") return { status: 200, body: HOMEPAGE };
      return { status: 404, body: "nope", type: "text/plain" };
    });
    const checks = await runSecurityExtended(context(HOMEPAGE));
    expect(get(checks, "no_exposed_actuator").status).toBe("FAIL");
    expect(get(checks, "no_exposed_swagger_open").status).toBe("WARN");
    expect(get(checks, "no_exposed_prometheus_metrics").status).toBe("WARN");
    expect(get(checks, "no_graphql_introspection_prod").status).toBe("WARN");
  });

  it("recognises a GraphQL server from its POST envelope when the GET says nothing", async () => {
    serve((path, init) => {
      if (path === "/graphql") {
        return init?.method === "POST"
          ? { status: 200, body: '{"data":{"__schema":{"types":[{"name":"Query"}]}}}', type: "application/json" }
          : { status: 405, body: "", type: "text/plain" };
      }
      return path === "/" ? { status: 200, body: HOMEPAGE } : { status: 404, body: "nope", type: "text/plain" };
    });
    const checks = await runSecurityExtended(context(HOMEPAGE));
    expect(get(checks, "no_graphql_introspection_prod").status).toBe("WARN");
  });

  it("signature helpers reject the homepage and accept the formats", () => {
    expect(looksLikeActuator(ACTUATOR)).toBe(true);
    expect(looksLikeActuator(HOMEPAGE)).toBe(false);
    expect(looksLikeActuator('{"_links":{"self":{"href":"/api"}}}')).toBe(false);
    expect(looksLikePrometheusMetrics(METRICS)).toBe(true);
    expect(looksLikePrometheusMetrics(HOMEPAGE)).toBe(false);
    expect(graphqlEnvelope('{"errors":[{"message":"x"}]}')).toBe("errors");
    expect(graphqlEnvelope('{"data":{"a":1}}')).toBe("data");
    expect(graphqlEnvelope(HOMEPAGE)).toBeNull();
    expect(graphqlEnvelope('{"errors":"nope"}')).toBeNull();
  });
});

// ── missing-pages-extended + trust-brand-extended ────────────────────────────

const PLAIN_HOME = `<!DOCTYPE html><html><head><title>Acme — home</title></head><body><h1>Acme</h1><p>hello</p></body></html>`;
const isRoutePageCheck = (c: PulseScanCheckInput) => c.category === CATEGORIES.MISSING_PAGES && c.checkKey.endsWith("_page");

describe("topic-page probes", () => {
  it("a homepage served for every path does not count as the page (or as its absence)", async () => {
    serve(() => ({ status: 200, body: PLAIN_HOME }));
    const checks = (await runMissingPagesExtended(context(PLAIN_HOME))).filter(isRoutePageCheck);
    expect(checks.length).toBe(8);
    for (const c of checks) {
      expect(c.status, c.checkKey).toBe("INCONCLUSIVE");
      expect(c.detail, c.checkKey).toMatch(/does not name itself/);
    }
  });

  it("a page that does not name the topic (cbc.ca's 'Menu') is not the page", async () => {
    serve((path) => (path === "/" ? { status: 200, body: PLAIN_HOME } : { status: 200, body: MENU_PAGE }));
    const checks = await runMissingPagesExtended(context(PLAIN_HOME));
    expect(get(checks, "security_dedicated_page").status).toBe("INCONCLUSIVE");
    expect(get(checks, "legal_hub_page").status).toBe("INCONCLUSIVE");
  });

  it("a page that names itself passes; a real 404 is still the absence warning", async () => {
    serve((path) => {
      if (path === "/security") return { status: 200, body: "<html><head><title>Security | Acme</title></head><body></body></html>" };
      if (path === "/legal") return { status: 200, body: "<html><head><title>Acme</title></head><body><h1>Legal Center</h1></body></html>" };
      return { status: 404, body: "Not found", type: "text/plain" };
    });
    const checks = await runMissingPagesExtended(context(PLAIN_HOME));
    expect(get(checks, "security_dedicated_page").status).toBe("PASS");
    expect(get(checks, "legal_hub_page").status).toBe("PASS");
    expect(get(checks, "roadmap_public_page").status).toBe("WARN");
  });

  it("security whitepaper: soft-200 homepage is inconclusive, a real page passes, a 404 warns", async () => {
    serve(() => ({ status: 200, body: PLAIN_HOME }));
    expect(get(await runTrustBrandExtended(context(PLAIN_HOME)), "security_whitepaper").status).toBe("INCONCLUSIVE");

    serve((path) => (path === "/security-whitepaper"
      ? { status: 200, body: "<html><head><title>Security Whitepaper — Acme</title></head></html>" }
      : { status: 404, body: "" }));
    expect(get(await runTrustBrandExtended(context(PLAIN_HOME)), "security_whitepaper").status).toBe("PASS");

    serve(() => ({ status: 404, body: "Not found", type: "text/plain" }));
    expect(get(await runTrustBrandExtended(context(PLAIN_HOME)), "security_whitepaper").status).toBe("WARN");
  });
});

// ── api-behaviour ────────────────────────────────────────────────────────────

describe("api-behaviour on a soft-routed host", () => {
  it("a homepage mentioning GraphQL and a playground is not a GraphQL endpoint", async () => {
    serve(() => ({ status: 200, body: HOMEPAGE }));
    const checks = await runApiBehaviourChecks(context(HOMEPAGE));
    expect(get(checks, "api_graphql_introspection").status).toBe("SKIPPED");
  });

  it("still finds a real GraphQL IDE", async () => {
    serve((path) => (path === "/graphql"
      ? { status: 200, body: "<html><head><title>GraphiQL</title></head><body><div id=\"graphiql\"></div></body></html>" }
      : { status: 404, body: "{}", type: "application/json" }));
    const checks = await runApiBehaviourChecks(context(HOMEPAGE));
    expect(get(checks, "api_graphql_introspection").status).toBe("WARN");
  });

  it("an HTML page with ordinary links and prose is not a verbose error", async () => {
    serve(() => ({ status: 404, body: HOMEPAGE }));
    const checks = await runApiBehaviourChecks(context(HOMEPAGE));
    expect(get(checks, "api_verbose_errors").status).toBe("PASS");
  });

  it("a 200 homepage for a path that cannot exist never reached an error handler — not a FAIL, not a pass", async () => {
    serve(() => ({ status: 200, body: HOMEPAGE }));
    const checks = await runApiBehaviourChecks(context(HOMEPAGE));
    expect(get(checks, "api_verbose_errors").status).toBe("SKIPPED");
  });

  it("still fails a real stack trace — in JSON, and in an HTML error page's <pre>", async () => {
    serve((path) => (path.startsWith("/api/__pulse_probe")
      ? { status: 500, body: '{"error":"boom","stack":"TypeError: x\\n    at Object.handler (/app/server/routes/user.js:42:13)"}', type: "application/json" }
      : { status: 200, body: "{}", type: "application/json" }));
    expect(get(await runApiBehaviourChecks(context(HOMEPAGE)), "api_verbose_errors").status).toBe("FAIL");

    serve((path) => (path.startsWith("/api/__pulse_probe")
      ? { status: 500, body: '<html><body><h1>Server Error</h1><pre>Traceback (most recent call last):\n  File "/var/www/app/views.py", line 12</pre></body></html>' }
      : { status: 200, body: "{}", type: "application/json" }));
    expect(get(await runApiBehaviourChecks(context(HOMEPAGE)), "api_verbose_errors").status).toBe("FAIL");

    serve((path) => (path.startsWith("/api/__pulse_probe")
      ? { status: 500, body: '<html><body><pre>SELECT id, email FROM users WHERE id = 1</pre></body></html>' }
      : { status: 200, body: "{}", type: "application/json" }));
    expect(get(await runApiBehaviourChecks(context(HOMEPAGE)), "api_verbose_errors").status).toBe("FAIL");
  });
});

// ── api-health ───────────────────────────────────────────────────────────────

describe("api-health: an HTML page is not a resolved API route", () => {
  const PAGE = `<html><head><title>Acme</title></head><body><script>fetch("/api/users")</script></body></html>`;

  it("a 200 HTML page for an API path is inconclusive, not resolved", async () => {
    serve(() => ({ status: 200, body: PLAIN_HOME }));
    const c = get(await runApiHealthChecks(context(PAGE)), "api_endpoint_unverified");
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).toMatch(/did not answer as an API/);
  });

  it("a JSON answer resolves; a 404 is a dead reference", async () => {
    serve(() => ({ status: 200, body: '{"users":[]}', type: "application/json" }));
    expect(get(await runApiHealthChecks(context(PAGE)), "api_endpoint_unverified").status).toBe("PASS");
    serve(() => ({ status: 401, body: '{"error":"unauthorised"}', type: "application/json" }));
    expect(get(await runApiHealthChecks(context(PAGE)), "api_endpoint_unverified").status).toBe("PASS");
    serve(() => ({ status: 404, body: "Not found", type: "text/plain" }));
    expect(get(await runApiHealthChecks(context(PAGE)), "api_endpoint_unverified").status).toBe("WARN");
  });
});

describe("Bubble markers, from bubble.io's own runtime (2026-10-14)", () => {
  it("reads the live runtime's version function", async () => {
    const { isBubblePage, isBubbleDevVersion } = await import("@/server/pulse-checks/builder-platforms");
    const live = `<script src="https://cdn.bubble.io/x.js"></script><script>var _bubble_page_load_data = {}; var o = { app_version: function() { return "live"; } }</script>`;
    expect(isBubblePage(live)).toBe(true);
    expect(isBubbleDevVersion(live)).toBe(false);
    expect(isBubbleDevVersion(live.replace('"live"', '"test"'))).toBe(true);
  });
  it("a page that only mentions bubble.io is not a Bubble app", async () => {
    const { isBubblePage } = await import("@/server/pulse-checks/builder-platforms");
    expect(isBubblePage('<p>We moved off <a href="https://bubble.io">bubble.io</a> last year.</p>')).toBe(false);
  });
});
