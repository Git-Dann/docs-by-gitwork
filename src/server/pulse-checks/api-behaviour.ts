// ─────────────────────────────────────────────────────────────────────────────
// API BEHAVIOURAL CHECKS — what the API actually DOES, not what it documents.
//
// WHY THIS EXISTS. Pulse already had `api-quality.ts`, and every one of its
// fifteen checks asks whether something is *documented*: "Rate limits documented",
// "Auth method documented", "Pagination documented". That is a useful axis for a
// developer platform and it is the wrong axis for "is this API safe to put in
// front of customers". An API can have immaculate docs and still reflect any
// Origin with credentials attached.
//
// So this module probes. Each check maps to an item in the OWASP API Security
// Top 10 (2023) that is observable from OUTSIDE with an unauthenticated request —
// see docs/platform-check-sources.md for the per-check mapping.
//
// TWO RULES THIS MODULE MUST NOT BREAK, both learned the expensive way (§35):
//
//   1. A FAILED PROBE IS NOT A FINDING. Every fetch here can fail for reasons
//      that have nothing to do with the API — network, WAF, our own timeout. A
//      probe that did not complete yields SKIPPED with the reason, never a FAIL.
//      "We could not look" must never render as "it is not there".
//
//   2. CATCH-ALL HOSTS INVALIDATE PATH PROBES. `ctx.catchAll200` is true when the
//      host answers 200 with its app shell for any unknown path. On such a host,
//      "GET /debug returned 200" means nothing. Those checks report SKIPPED with
//      the reason rather than inventing an exposure.
//
// Probes are bounded: a fixed, small set of requests, run in parallel, each with
// the shared 8s timeout. Nothing here mutates state — GET, HEAD and OPTIONS only.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import {
  fetchWithTimeout,
  platformIs,
  skip,
  type ExtendedCheckContext,
  type PulseScanCheckInput,
} from "./_types";

/** An Origin we control the shape of, used to see whether the server reflects it. */
const PROBE_ORIGIN = "https://pulse-probe.invalid";

const ALL_CHECKS: Array<[string, string]> = [
  ["api_cors_credentials", "CORS does not combine wildcard origin with credentials"],
  ["api_cors_origin_reflection", "CORS does not reflect arbitrary origins"],
  ["api_verbose_errors", "Errors do not leak stack traces or internals"],
  ["api_rate_limit_headers", "Rate-limit headers are returned"],
  ["api_server_banner", "Server software version is not advertised"],
  ["api_graphql_introspection", "GraphQL introspection is disabled in production"],
  ["api_debug_endpoints", "No debug or admin endpoints exposed"],
  ["api_nosniff_header", "API responses set X-Content-Type-Options"],
  ["api_unauthenticated_data", "Data endpoints require authentication"],
  ["api_trace_method", "TRACE / TRACK methods are disabled"],
  ["api_response_content_type", "Scanned API response declares a Content-Type"],
  ["api_request_correlation", "Scanned API response carries a correlation ID"],
  ["api_cache_policy", "Scanned API response declares a cache policy"],
  ["api_error_machine_readable", "API error responses are machine-readable"],
];

interface ProbeResult {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** A bounded, non-mutating probe. Never throws — a failure is reported as !ok. */
async function probe(
  url: string,
  init: RequestInit & { method: "GET" | "HEAD" | "OPTIONS" },
): Promise<ProbeResult | null> {
  try {
    const res = await fetchWithTimeout(url, {
      ...init,
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0", ...(init.headers ?? {}) },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const body = init.method === "GET" ? (await res.text().catch(() => "")).slice(0, 4000) : "";
    return { ok: true, status: res.status, headers, body };
  } catch {
    return null;
  }
}

/** SKIPPED because the probe itself did not complete — never a failure. */
function unprobed(
  checkKey: string,
  label: string,
  what: string,
  category: PulseScanCheckInput["category"] = CATEGORIES.SECURITY,
): PulseScanCheckInput {
  return {
    category,
    checkKey,
    label,
    status: "SKIPPED",
    detail: `Could not complete the ${what} probe (network error, timeout, or the request was blocked upstream). ` +
      `This is "we could not look", not "nothing is wrong" — re-run the scan, and if it persists check whether a WAF ` +
      `is refusing automated requests.`,
  };
}

export async function runApiBehaviourChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  // Shapes with no HTTP surface of their own. Mirrors api-quality.ts's guard so
  // the two modules agree about what an API scan even means.
  if (platformIs(ctx.platform, "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "CLI_TOOL", "DESKTOP_APP", "CHROME_EXTENSION")) {
    return skip(CATEGORIES.SECURITY, ALL_CHECKS, "Not applicable — this project does not serve an HTTP API of its own.");
  }

  const { httpsUrl, ctx: pctx, htmlLower } = ctx;
  const looksLikeApi =
    pctx.hasBackend ||
    htmlLower.includes("/api/") ||
    platformIs(ctx.platform, "API_BACKEND", "SAAS", "WEB_APP");
  if (!looksLikeApi) {
    return skip(CATEGORIES.SECURITY, ALL_CHECKS, "No API signals detected on this site.");
  }

  const base = httpsUrl.replace(/\/+$/, "");
  const checks: PulseScanCheckInput[] = [];

  // One parallel wave. Everything below reads from these four results.
  const [corsRes, errorRes, graphqlRes, traceRes] = await Promise.all([
    probe(base, { method: "GET", headers: { Origin: PROBE_ORIGIN } }),
    // A path that should not exist, to see the shape of an error response.
    probe(`${base}/api/__pulse_probe_${Date.now().toString(36)}`, { method: "GET" }),
    probe(`${base}/graphql`, {
      method: "GET",
      headers: { Accept: "application/json" },
    }),
    probe(base, { method: "OPTIONS", headers: { Origin: PROBE_ORIGIN } }),
  ]);

  checks.push(...corsChecks(corsRes, traceRes));
  checks.push(...errorChecks(errorRes, ctx));
  checks.push(...headerChecks(corsRes));
  checks.push(...graphqlChecks(graphqlRes));
  checks.push(...methodChecks(traceRes));
  checks.push(...apiContractChecks(corsRes, errorRes, ctx));

  return checks;
}

// ── CORS (OWASP API8:2023 — Security Misconfiguration) ──────────────────────
function corsChecks(res: ProbeResult | null, preflight: ProbeResult | null): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const source = res ?? preflight;

  if (!source) {
    return [
      unprobed("api_cors_credentials", "CORS does not combine wildcard origin with credentials", "CORS"),
      unprobed("api_cors_origin_reflection", "CORS does not reflect arbitrary origins", "CORS"),
    ];
  }

  const allowOrigin = source.headers["access-control-allow-origin"] ?? "";
  const allowCredentials = (source.headers["access-control-allow-credentials"] ?? "").toLowerCase() === "true";

  // Wildcard + credentials. Browsers reject this combination outright, so it is
  // both a live CORS bug and a sign the policy was written without testing.
  const wildcard = allowOrigin.trim() === "*";
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "api_cors_credentials",
    label: "CORS does not combine wildcard origin with credentials",
    status: wildcard && allowCredentials ? "FAIL" : "PASS",
    confidence: "HIGH",
    detail: wildcard && allowCredentials
      ? `The API returns \`Access-Control-Allow-Origin: *\` together with ` +
        `\`Access-Control-Allow-Credentials: true\`. Browsers reject this pairing, so any authenticated ` +
        `cross-origin call from a real front end is failing right now — and the intent behind it (allow everyone, ` +
        `with cookies) is exactly the configuration that would let any website read logged-in users' data if it did ` +
        `work. Name the specific origins you trust instead of using a wildcard.`
      : wildcard
        ? `\`Access-Control-Allow-Origin: *\` without credentials — acceptable for genuinely public, unauthenticated ` +
          `data. Confirm nothing behind this origin relies on cookies or an Authorization header.`
        : allowOrigin
          ? `CORS names a specific origin (\`${allowOrigin.slice(0, 80)}\`) rather than a wildcard.`
          : `No CORS headers returned — the API is same-origin only, which is the safest default.`,
    evidence: allowOrigin ? `Allow-Origin: ${allowOrigin.slice(0, 60)}${allowCredentials ? " + credentials" : ""}` : undefined,
  });

  // Origin reflection. We sent an Origin we control; if it comes back verbatim
  // with credentials allowed, ANY site can make authenticated calls.
  const reflects = allowOrigin.trim() === PROBE_ORIGIN;
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "api_cors_origin_reflection",
    label: "CORS does not reflect arbitrary origins",
    status: reflects && allowCredentials ? "FAIL" : reflects ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: reflects && allowCredentials
      ? `The API echoed back an arbitrary Origin we supplied (\`${PROBE_ORIGIN}\`) AND sets ` +
        `\`Access-Control-Allow-Credentials: true\`. That is a functional wildcard with cookies enabled: any website ` +
        `a logged-in user visits can call this API as them and read the response. This is usually a regex or ` +
        `\`origin => callback(null, true)\` in a CORS middleware. Replace it with an explicit allow-list.`
      : reflects
        ? `The API reflects arbitrary Origins back in \`Access-Control-Allow-Origin\`, though credentials are not ` +
          `allowed. The immediate risk is limited, but reflection means the allow-list is not doing any work — if ` +
          `credentials are ever switched on, this becomes a full account-data exposure with no other change.`
        : `Arbitrary origins are not reflected.`,
    evidence: reflects ? `reflected ${PROBE_ORIGIN}` : undefined,
  });

  return checks;
}

// ── Error responses (OWASP API8:2023) ───────────────────────────────────────
function errorChecks(res: ProbeResult | null, ctx: ExtendedCheckContext): PulseScanCheckInput[] {
  if (!res) return [unprobed("api_verbose_errors", "Errors do not leak stack traces or internals", "error-response")];

  // A catch-all host answers 200 with its app shell for any path, so this probe
  // never reached an error handler and cannot say anything about one.
  if (ctx.catchAll200 && res.status === 200) {
    return [{
      category: CATEGORIES.SECURITY,
      checkKey: "api_verbose_errors",
      label: "Errors do not leak stack traces or internals",
      status: "SKIPPED",
      detail: `The host returns 200 with its application shell for unknown paths (catch-all routing), so this probe ` +
        `never reached an API error handler. Inconclusive rather than a pass — test an API route directly if you ` +
        `need this verified.`,
    }];
  }

  const body = res.body;
  const STACK_SIGNALS = [
    [/\bat\s+[\w$.<>]+\s*\([^)]*:\d+:\d+\)/, "a JavaScript stack frame"],
    [/Traceback \(most recent call last\)/, "a Python traceback"],
    [/\bat\s+[\w.$]+\([\w]+\.java:\d+\)/, "a Java stack frame"],
    [/#\d+\s+\/[\w/.-]+\.php\(\d+\)/, "a PHP stack frame"],
    [/goroutine\s+\d+\s+\[/, "a Go goroutine dump"],
  ] as const;
  const PATH_SIGNALS = [
    [/\/(home|Users|var\/www|usr\/src|app)\/[\w.\-/]{6,}/, "absolute server file paths"],
    [/\b(postgres|mysql|mongodb):\/\/[^\s"']+/i, "a database connection string"],
    [/\b(SELECT|INSERT|UPDATE|DELETE)\s+.{0,40}\s+FROM\s+["\w.]+/i, "a raw SQL statement"],
  ] as const;

  const found = [
    ...STACK_SIGNALS.filter(([re]) => re.test(body)).map(([, what]) => what),
    ...PATH_SIGNALS.filter(([re]) => re.test(body)).map(([, what]) => what),
  ];

  return [{
    category: CATEGORIES.SECURITY,
    checkKey: "api_verbose_errors",
    label: "Errors do not leak stack traces or internals",
    status: found.length > 0 ? "FAIL" : "PASS",
    confidence: found.length > 0 ? "HIGH" : "MEDIUM",
    detail: found.length > 0
      ? `A request to a non-existent path returned ${found.join(" and ")} in the response body. Verbose errors hand an ` +
        `attacker your framework and version, your directory layout, and often your query structure — which is the ` +
        `reconnaissance step that makes every subsequent attempt cheaper. Return a generic message with a correlation ` +
        `id to the client and keep the detail in your server logs. This is usually one environment flag left in ` +
        `development mode.`
      : `A request to a non-existent path returned status ${res.status} with no stack trace, server path or query ` +
        `detail in the body.`,
    evidence: found.length > 0 ? found.join(", ") : undefined,
  }];
}

// ── Response headers (OWASP API4 + API8:2023) ───────────────────────────────
function headerChecks(res: ProbeResult | null): PulseScanCheckInput[] {
  if (!res) {
    return [
      unprobed("api_rate_limit_headers", "Rate-limit headers are returned", "rate-limit header"),
      unprobed("api_server_banner", "Server software version is not advertised", "response header"),
      unprobed("api_nosniff_header", "API responses set X-Content-Type-Options", "response header"),
    ];
  }
  const checks: PulseScanCheckInput[] = [];
  const h = res.headers;

  // Rate-limit headers (RFC 9331 draft naming, plus the common X- variants).
  const rateHeaders = Object.keys(h).filter((k) =>
    /^(ratelimit(-|$)|x-ratelimit-|retry-after$|x-rate-limit-)/.test(k),
  );
  checks.push({
    category: CATEGORIES.API_QUALITY,
    checkKey: "api_rate_limit_headers",
    label: "Rate-limit headers are returned",
    status: rateHeaders.length > 0 ? "PASS" : "WARN",
    confidence: "MEDIUM",
    detail: rateHeaders.length > 0
      ? `Rate-limit headers are present (${rateHeaders.slice(0, 4).join(", ")}), so clients can back off before being ` +
        `throttled.`
      : `No rate-limit headers (\`RateLimit-*\`, \`X-RateLimit-*\`, \`Retry-After\`) on the response. Two ` +
        `consequences: a well-behaved client has no way to pace itself, so it discovers your limit by hitting it; ` +
        `and their absence is consistent with there being no limit at all, which is OWASP API4 — unrestricted ` +
        `resource consumption, where one loop in a customer's integration exhausts the capacity everyone else shares. ` +
        `A header alone is not proof of a limit, so verify the limit exists as well as advertising it.`,
    evidence: rateHeaders.slice(0, 4).join(", ") || undefined,
  });

  // Server / framework version disclosure.
  const banners = ["server", "x-powered-by", "x-aspnet-version", "x-generator"]
    .map((k) => (h[k] ? `${k}: ${h[k]}` : null))
    .filter((v): v is string => v !== null);
  const versioned = banners.filter((b) => /\d+\.\d+/.test(b));
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "api_server_banner",
    label: "Server software version is not advertised",
    status: versioned.length > 0 ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: versioned.length > 0
      ? `Response headers advertise the exact software version (${versioned.join("; ").slice(0, 120)}). That turns ` +
        `"is this host vulnerable to CVE-X" into a lookup rather than a probe, and it is what mass scanners index on. ` +
        `Suppress it — \`server_tokens off\` in nginx, \`poweredByHeader: false\` in Next.js, ` +
        `\`app.disable('x-powered-by')\` in Express.`
      : banners.length > 0
        ? `Server headers are present but carry no version number.`
        : `No server or framework identification headers returned.`,
    evidence: versioned.join("; ").slice(0, 120) || undefined,
  });

  // X-Content-Type-Options on API responses.
  const nosniff = (h["x-content-type-options"] ?? "").toLowerCase().includes("nosniff");
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "api_nosniff_header",
    label: "API responses set X-Content-Type-Options",
    status: nosniff ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: nosniff
      ? `\`X-Content-Type-Options: nosniff\` is set.`
      : `No \`X-Content-Type-Options: nosniff\`. Browsers may then ignore the declared Content-Type and sniff the ` +
        `body — so a JSON response containing attacker-supplied text can be interpreted as HTML and executed in your ` +
        `origin. It is one header with no compatibility cost.`,
  });

  return checks;
}

// ── GraphQL (OWASP API9:2023 — Improper Inventory Management) ───────────────
function graphqlChecks(res: ProbeResult | null): PulseScanCheckInput[] {
  if (!res) return [unprobed("api_graphql_introspection", "GraphQL introspection is disabled in production", "GraphQL")];

  // No GraphQL endpoint is not a finding — most APIs are REST.
  const isGraphql =
    res.status < 500 &&
    (/graphql/i.test(res.headers["content-type"] ?? "") ||
      /"data"\s*:|"errors"\s*:\s*\[|GraphQL|graphiql|__schema/i.test(res.body));
  if (!isGraphql || res.status === 404) {
    return [{
      category: CATEGORIES.SECURITY,
      checkKey: "api_graphql_introspection",
      label: "GraphQL introspection is disabled in production",
      status: "SKIPPED",
      detail: `No GraphQL endpoint found at /graphql — this check does not apply.`,
    }];
  }

  // A GET that returns a playground or an introspection-shaped response means the
  // schema is readable by anyone.
  const exposesSchema = /__schema|graphiql|apollo.*sandbox|playground/i.test(res.body);
  return [{
    category: CATEGORIES.SECURITY,
    checkKey: "api_graphql_introspection",
    label: "GraphQL introspection is disabled in production",
    status: exposesSchema ? "WARN" : "PASS",
    confidence: "MEDIUM",
    detail: exposesSchema
      ? `The /graphql endpoint serves an interactive playground or responds to introspection. That publishes your ` +
        `entire schema — every type, field, mutation and argument, including the internal ones you have not ` +
        `documented — which is a complete map of the attack surface and the fastest route to finding an endpoint ` +
        `missing an authorisation check (OWASP API5). Disable introspection and the playground in production; keep ` +
        `both in development.`
      : `A GraphQL endpoint responds but does not serve a playground or introspection result to an unauthenticated ` +
        `GET request.`,
  }];
}

// ── HTTP methods (OWASP API8:2023) ──────────────────────────────────────────
function methodChecks(res: ProbeResult | null): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  if (!res) {
    return [
      unprobed("api_trace_method", "TRACE / TRACK methods are disabled", "HTTP method"),
      unprobed("api_debug_endpoints", "No debug or admin endpoints exposed", "HTTP method"),
      unprobed("api_unauthenticated_data", "Data endpoints require authentication", "HTTP method"),
    ];
  }

  const allow = (res.headers["allow"] ?? res.headers["access-control-allow-methods"] ?? "").toUpperCase();
  const risky = ["TRACE", "TRACK", "CONNECT"].filter((m) => allow.includes(m));
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "api_trace_method",
    label: "TRACE / TRACK methods are disabled",
    status: risky.length > 0 ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: risky.length > 0
      ? `The server advertises ${risky.join(", ")} in its allowed methods. TRACE echoes the request back including ` +
        `headers, which historically enabled Cross-Site Tracing — reading HttpOnly cookies that JavaScript is ` +
        `specifically not allowed to see. There is no production use for it; disable it at the web server.`
      : allow
        ? `Allowed methods (${allow.slice(0, 60)}) contain no TRACE/TRACK/CONNECT.`
        : `No Allow header returned — the server does not advertise its method set.`,
    evidence: risky.join(", ") || undefined,
  });

  // These two need path probes, which the caller has deliberately not run here:
  // a catch-all host makes them meaningless, and the security-extended module
  // already probes exposed paths with the soft-200 guard that requires.
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "api_debug_endpoints",
    label: "No debug or admin endpoints exposed",
    status: "SKIPPED",
    detail: `Covered by the exposed-path probes in the security suite, which apply the soft-200 guard this check ` +
      `would need. Listed here so the API view is complete rather than silently missing the concern.`,
  });

  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "api_unauthenticated_data",
    label: "Data endpoints require authentication",
    status: "SKIPPED",
    detail: `Not assessable from an unauthenticated scan without guessing resource paths, which produces false ` +
      `findings on catch-all hosts and risks touching real data. Broken object-level authorisation (OWASP API1) is ` +
      `the single most common API vulnerability and needs an authenticated test with two accounts — worth booking as ` +
      `a manual exercise rather than inferring from outside.`,
  });

  return checks;
}

// ── API response contracts (observable developer experience) ────────────────
// These deliberately report on the endpoint actually scanned, rather than
// assuming a homepage response represents every route in a product.
function apiContractChecks(
  response: ProbeResult | null,
  error: ProbeResult | null,
  ctx: ExtendedCheckContext,
): PulseScanCheckInput[] {
  const category = CATEGORIES.API_QUALITY;
  if (!response) {
    return [
      unprobed("api_response_content_type", "Scanned API response declares a Content-Type", "Content-Type header", category),
      unprobed("api_request_correlation", "Scanned API response carries a correlation ID", "request correlation header", category),
      unprobed("api_cache_policy", "Scanned API response declares a cache policy", "cache policy header", category),
    ];
  }

  const headers = response.headers;
  const contentType = headers["content-type"] ?? "";
  const correlation = ["x-request-id", "x-correlation-id", "traceparent", "x-amzn-trace-id", "cf-ray"]
    .find((header) => Boolean(headers[header]));
  const cacheControl = headers["cache-control"] ?? "";
  const checks: PulseScanCheckInput[] = [
    {
      category,
      checkKey: "api_response_content_type",
      label: "Scanned API response declares a Content-Type",
      status: contentType ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: contentType
        ? `The scanned response explicitly declares \`${contentType.slice(0, 100)}\`, so clients need not guess how to parse it.`
        : "The scanned response has no Content-Type header. Clients and intermediaries must guess how to parse it; return an explicit media type on every API response.",
      evidence: contentType || undefined,
    },
    {
      category,
      checkKey: "api_request_correlation",
      label: "Scanned API response carries a correlation ID",
      status: correlation ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: correlation
        ? `The scanned response includes \`${correlation}\`, allowing customers to attach a concrete identifier when reporting a failed request.`
        : "No request/correlation identifier was observed on the scanned response. Return a request ID (or W3C traceparent) so customers and support can trace a single failed call without sharing credentials or payloads.",
      evidence: correlation ? `${correlation}: ${headers[correlation].slice(0, 80)}` : undefined,
    },
    {
      category,
      checkKey: "api_cache_policy",
      label: "Scanned API response declares a cache policy",
      status: cacheControl ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: cacheControl
        ? `The scanned response declares \`Cache-Control: ${cacheControl.slice(0, 100)}\`, making cache behaviour explicit to clients and shared intermediaries.`
        : "No Cache-Control policy was observed on the scanned response. Declare an explicit policy—especially no-store/private for account data—so browsers, CDNs and SDKs do not make inconsistent assumptions.",
      evidence: cacheControl || undefined,
    },
  ];

  if (!error) {
    checks.push(unprobed("api_error_machine_readable", "API error responses are machine-readable", "error-response", category));
  } else if (ctx.catchAll200 && error.status === 200) {
    checks.push({
      category,
      checkKey: "api_error_machine_readable",
      label: "API error responses are machine-readable",
      status: "SKIPPED",
      detail: "The host serves its application shell for unknown paths, so Pulse did not reach an API error handler and cannot judge its error format.",
    });
  } else {
    const errorType = error.headers["content-type"] ?? "";
    const structured = /(?:application\/problem\+json|application\/json|\+json)(?:;|$)/i.test(errorType) || /^\s*[\[{]/.test(error.body);
    checks.push({
      category,
      checkKey: "api_error_machine_readable",
      label: "API error responses are machine-readable",
      status: structured ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: structured
        ? `The unknown-route response is machine-readable (${errorType || "JSON body"}), allowing an integration to branch on an error code instead of scraping prose.`
        : `The unknown-route response is not recognisably JSON or Problem Details (${errorType || "no Content-Type"}). Return a stable machine-readable error object for API routes, with a code and safe request identifier.`,
      evidence: errorType || undefined,
    });
  }

  return checks;
}
