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
import { looksLikeGraphqlEndpoint } from "./path-probe";
import { graphqlEnvelope } from "./security-extended";

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
    res.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      // Set-Cookie can repeat; keep every one, or a later CDN cookie hides the session cookie.
      headers[key] = key === "set-cookie" && headers[key] ? `${headers[key]}, ${v}` : v;
    });
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

/** INCONCLUSIVE because the probe answered, but not with evidence that bears on the check. */
function inconclusive(
  category: PulseScanCheckInput["category"],
  checkKey: string,
  label: string,
  detail: string,
): PulseScanCheckInput {
  return { category, checkKey, label, status: "INCONCLUSIVE", confidence: "LOW", detail };
}

/** JSON or XML — a body a client parses, as opposed to an HTML page meant for a person. */
function isApiShaped(r: ProbeResult): boolean {
  return /(?:^|[/+])(?:json|xml)(?:\s*;|\s*$)/i.test(r.headers["content-type"] ?? "");
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
    // A read-only introspection query. A bare GET proves nothing: endpoints answer it
    // with 204/400/405, so a PASS would be a verdict on something never asked.
    probe(`${graphqlProbeUrl(httpsUrl)}?query=${GRAPHQL_INTROSPECTION_QUERY}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    }),
    probe(base, { method: "OPTIONS", headers: { Origin: PROBE_ORIGIN } }),
  ]);

  const all = [corsRes, errorRes, graphqlRes, traceRes];
  checks.push(...corsChecks(corsRes, traceRes, sessionCookies(all)));
  checks.push(...errorChecks(errorRes, ctx));
  checks.push(...headerChecks(corsRes, errorRes, traceRes));
  checks.push(...graphqlChecks(graphqlRes, graphqlProbeUrl(httpsUrl)));
  checks.push(...methodChecks(traceRes));
  checks.push(...apiContractChecks(corsRes, errorRes, ctx));

  return checks;
}

/** `{__schema{queryType{name}}}` — the smallest query that only introspection answers. */
const GRAPHQL_INTROSPECTION_QUERY = "%7B__schema%7BqueryType%7Bname%7D%7D%7D";

/**
 * Where to look for GraphQL. A scan target that already IS the endpoint
 * (`…/graphql`) is probed as-is — appending `/graphql` again asked
 * `/graphql/graphql`, which never exists. Otherwise the conventional path at the
 * origin, not under whatever path prefix the scan URL happened to carry.
 */
export function graphqlProbeUrl(httpsUrl: string): string {
  const u = new URL(httpsUrl);
  const path = u.pathname.replace(/\/+$/, "");
  return /\/graphql$/i.test(path) ? `${u.origin}${path}` : `${u.origin}/graphql`;
}

// Infrastructure cookies a CDN or load balancer sets on every response. They say
// nothing about how the API authenticates, so they are not evidence of a session.
const INFRA_COOKIE = /^(__cf_bm|_cfuvid|cf_clearance|__cfruid|__cflb|awsalb|awsalbcors|awsalbtg|awsalbtgcors|awselb|ak_bmsc|bm_sv|bm_sz|_abck|incap_ses_\w*|visid_incap_\w*|nlbi_\w*|ar_debug)$/i;

/** Names of cookies any probe response set, minus CDN/load-balancer plumbing. */
export function sessionCookies(responses: Array<ProbeResult | null>): string[] {
  const names = new Set<string>();
  for (const r of responses) {
    const raw = r?.headers["set-cookie"];
    if (!raw) continue;
    // Headers joins repeated Set-Cookie with ", " — split only where a new name=value starts.
    for (const part of raw.split(/,\s*(?=[^;,=\s]+=)/)) {
      const name = part.split("=")[0]?.trim();
      if (name && !INFRA_COOKIE.test(name)) names.add(name);
    }
  }
  return [...names];
}

// ── CORS (OWASP API8:2023 — Security Misconfiguration) ──────────────────────
function corsChecks(
  res: ProbeResult | null,
  preflight: ProbeResult | null,
  cookies: string[],
): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const sources = [res, preflight].filter((r): r is ProbeResult => r !== null);

  if (sources.length === 0) {
    return [
      unprobed("api_cors_credentials", "CORS does not combine wildcard origin with credentials", "CORS"),
      unprobed("api_cors_origin_reflection", "CORS does not reflect arbitrary origins", "CORS"),
    ];
  }

  // A policy can live on the GET, the preflight, or only one of them. Read both:
  // reading just the first that answered missed reflection set only on OPTIONS.
  const policy = (r: ProbeResult) => ({
    allowOrigin: (r.headers["access-control-allow-origin"] ?? "").trim(),
    allowCredentials: (r.headers["access-control-allow-credentials"] ?? "").toLowerCase() === "true",
  });
  const policies = sources.map(policy);
  const reflecting = policies.filter((p) => p.allowOrigin === PROBE_ORIGIN);
  const reflects = reflecting.length > 0;
  const reflectsWithCredentials = reflecting.some((p) => p.allowCredentials);
  const wildcardWithCredentials = policies.some((p) => p.allowOrigin === "*" && p.allowCredentials);
  const shown = policies.find((p) => p.allowOrigin === PROBE_ORIGIN)
    ?? policies.find((p) => p.allowOrigin === "*" && p.allowCredentials)
    ?? policies.find((p) => p.allowOrigin)
    ?? policies[0];
  const { allowOrigin, allowCredentials } = shown;

  // Wildcard + credentials. Browsers reject this combination outright, so it is
  // both a live CORS bug and a sign the policy was written without testing.
  const wildcard = allowOrigin === "*";
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "api_cors_credentials",
    label: "CORS does not combine wildcard origin with credentials",
    status: wildcardWithCredentials ? "FAIL" : "PASS",
    confidence: "HIGH",
    detail: wildcardWithCredentials
      ? `The API returns \`Access-Control-Allow-Origin: *\` together with ` +
        `\`Access-Control-Allow-Credentials: true\`. Browsers reject this pairing, so any authenticated ` +
        `cross-origin call from a real front end is failing right now — and the intent behind it (allow everyone, ` +
        `with cookies) is exactly the configuration that would let any website read logged-in users' data if it did ` +
        `work. Name the specific origins you trust instead of using a wildcard.`
      : wildcard
        ? `\`Access-Control-Allow-Origin: *\` without credentials — acceptable for genuinely public, unauthenticated ` +
          `data. Confirm nothing behind this origin relies on cookies or an Authorization header.`
        : allowOrigin === PROBE_ORIGIN
          // Our own probe Origin echoed back is not a named allow-list entry.
          ? `No wildcard is used, but the origin returned is the one Pulse sent (\`${PROBE_ORIGIN}\`) — the API ` +
            `reflects whatever Origin it is given. See "CORS does not reflect arbitrary origins".`
          : allowOrigin
            ? `CORS names a specific origin (\`${allowOrigin.slice(0, 80)}\`) rather than a wildcard.`
            : `No CORS headers returned — the API is same-origin only, which is the safest default.`,
    evidence: allowOrigin ? `Allow-Origin: ${allowOrigin.slice(0, 60)}${allowCredentials ? " + credentials" : ""}` : undefined,
  });

  // Origin reflection. We sent an Origin we control; if it comes back verbatim
  // with credentials allowed, any site can make credentialed calls. Whether those
  // calls carry a USER is a separate fact: a browser only attaches cookies, so an
  // API that authenticates with an API key or Basic auth is not readable this way.
  // Only a session cookie we actually saw makes it a confident FAIL.
  const cookieAuthSeen = cookies.length > 0;
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "api_cors_origin_reflection",
    label: "CORS does not reflect arbitrary origins",
    status: reflectsWithCredentials ? (cookieAuthSeen ? "FAIL" : "WARN") : reflects ? "WARN" : "PASS",
    confidence: reflectsWithCredentials && !cookieAuthSeen ? "MEDIUM" : "HIGH",
    detail: reflectsWithCredentials && cookieAuthSeen
      ? `The API echoed back an arbitrary Origin we supplied (\`${PROBE_ORIGIN}\`) AND sets ` +
        `\`Access-Control-Allow-Credentials: true\`, and it sets cookies (${cookies.slice(0, 3).join(", ")}). That is a ` +
        `functional wildcard with cookies enabled: any website a logged-in user visits can call this API as them and ` +
        `read the response. This is usually a regex or \`origin => callback(null, true)\` in a CORS middleware. ` +
        `Replace it with an explicit allow-list.`
      : reflectsWithCredentials
        ? `The API echoes back an arbitrary Origin we supplied (\`${PROBE_ORIGIN}\`) with ` +
          `\`Access-Control-Allow-Credentials: true\`. This is exploitable only if the API authenticates with cookies: ` +
          `a browser attaches cookies to a cross-site request, never an API key or Authorization header. No cookie-based ` +
          `auth was seen on the responses Pulse received, so this is not a confirmed exposure — but the allow-list is ` +
          `doing no work, and the day a session cookie is added it becomes one. Replace reflection with an explicit ` +
          `allow-list, or drop credentials if no browser client needs them.`
        : reflects
          ? `The API reflects arbitrary Origins back in \`Access-Control-Allow-Origin\`, though credentials are not ` +
            `allowed. The immediate risk is limited, but reflection means the allow-list is not doing any work — if ` +
            `credentials are ever switched on, this becomes a full account-data exposure with no other change.`
          : `Arbitrary origins are not reflected.`,
    evidence: reflects
      ? `reflected ${PROBE_ORIGIN}${reflectsWithCredentials ? " + credentials" : ""}` +
        (reflectsWithCredentials ? (cookieAuthSeen ? `; cookies: ${cookies.slice(0, 3).join(", ")}` : "; no cookies set") : "")
      : undefined,
  });

  return checks;
}

// ── Error responses (OWASP API8:2023) ───────────────────────────────────────
function errorChecks(res: ProbeResult | null, ctx: ExtendedCheckContext): PulseScanCheckInput[] {
  if (!res) return [unprobed("api_verbose_errors", "Errors do not leak stack traces or internals", "error-response")];

  const contentType = (res.headers["content-type"] ?? "").toLowerCase();
  const isHtml = contentType.includes("html") || /^\s*(<!doctype html|<html)/i.test(res.body);

  // A catch-all host answers 200 with its app shell for any path, so this probe
  // never reached an error handler and cannot say anything about one. A 200 HTML
  // page for a path that cannot exist is the same thing on a host whose random-path
  // check happened to 404 (soft routing under /api/).
  if ((ctx.catchAll200 || isHtml) && res.status === 200) {
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

  // A refusal (auth or rate limit) to an unknown path is answered by the gateway
  // before routing, so the application's error handler was never reached and a
  // clean body here says nothing about what that handler would print.
  if (!isHtml && (res.status === 401 || res.status === 403 || res.status === 429)) {
    return [inconclusive(
      CATEGORIES.SECURITY,
      "api_verbose_errors",
      "Errors do not leak stack traces or internals",
      `A request to a non-existent path was refused with ${res.status} before routing (authentication or rate ` +
        `limiting), so Pulse never reached the API's error handler and cannot say what it reveals. Test an ` +
        `authenticated request to an unknown route to verify this.`,
    )];
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

  // In an HTML error page, an ordinary link (`href="/app/settings-page"`) or a
  // sentence ("select a plan from…") is not a leak. So HTML is read as its visible
  // text, stack traces are looked for there, and paths / SQL / connection strings
  // only count inside a <pre>/<code> block or alongside a stack trace.
  const text = isHtml ? errorPageText(body) : body;
  const stackFound = STACK_SIGNALS.filter(([re]) => re.test(text)).map(([, what]) => what);
  const pathScope = !isHtml ? body : stackFound.length > 0 ? text : preformattedText(body);
  const found = [
    ...stackFound,
    ...PATH_SIGNALS.filter(([re]) => re.test(pathScope)).map(([, what]) => what),
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

/** Visible text of an HTML page: no scripts, styles or tag attributes (href/src). */
export function errorPageText(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

/** The text inside <pre>/<code> blocks — where a framework's error page prints a trace. */
export function preformattedText(html: string): string {
  const out: string[] = [];
  const re = /<(pre|code)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(decodeBasicEntities(m[2].replace(/<[^>]+>/g, " ")));
  return out.join("\n");
}

function decodeBasicEntities(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

// ── Response headers (OWASP API4 + API8:2023) ───────────────────────────────
function headerChecks(
  res: ProbeResult | null,
  error: ProbeResult | null,
  trace: ProbeResult | null,
): PulseScanCheckInput[] {
  if (!res && !error && !trace) {
    return [
      unprobed("api_rate_limit_headers", "Rate-limit headers are returned", "rate-limit header"),
      unprobed("api_server_banner", "Server software version is not advertised", "response header"),
      unprobed("api_nosniff_header", "API responses set X-Content-Type-Options", "response header"),
    ];
  }
  const checks: PulseScanCheckInput[] = [];

  // Rate-limit headers (RFC 9331 draft naming, plus the common X- variants).
  if (!res) {
    checks.push(unprobed("api_rate_limit_headers", "Rate-limit headers are returned", "rate-limit header"));
  } else {
    const rateHeaders = Object.keys(res.headers).filter((k) =>
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
  }

  // Server / framework version disclosure. Read every response, not just the
  // base URL: a front proxy (nginx) often answers "/" while the API behind it
  // (Jetty, Kestrel…) answers the error probe with its own versioned banner.
  const responded = [res, error, trace].filter((r): r is ProbeResult => r !== null);
  const banners = [...new Set(responded.flatMap((r) =>
    ["server", "x-powered-by", "x-aspnet-version", "x-generator"]
      .map((k) => (r.headers[k] ? `${k}: ${r.headers[k]}` : null))
      .filter((v): v is string => v !== null),
  ))];
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

  // X-Content-Type-Options on API responses. Graded on responses that ARE API
  // responses: a base URL serving an HTML landing page says nothing about the
  // JSON the API returns (jsonplaceholder sets nosniff on every API response).
  const apiShaped = [res, error].filter((r): r is ProbeResult => r !== null && isApiShaped(r));
  const hasNosniff = (r: ProbeResult) => (r.headers["x-content-type-options"] ?? "").toLowerCase().includes("nosniff");
  const nosniff = apiShaped.some(hasNosniff);
  if (apiShaped.length === 0) {
    checks.push(inconclusive(
      CATEGORIES.SECURITY,
      "api_nosniff_header",
      "API responses set X-Content-Type-Options",
      `None of the responses Pulse received was an API response (JSON or XML) — the scanned URL and the error ` +
        `probe returned ${[res, error].filter(Boolean).map((r) => r!.headers["content-type"] || "no Content-Type").join(" and ") || "nothing"}. ` +
        `Scan an API endpoint that returns data to assess this header.`,
    ));
  } else {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "api_nosniff_header",
      label: "API responses set X-Content-Type-Options",
      status: nosniff ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: nosniff
        ? `\`X-Content-Type-Options: nosniff\` is set on the API's responses.`
        : `No \`X-Content-Type-Options: nosniff\` on the API's responses. Browsers may then ignore the declared ` +
          `Content-Type and sniff the body — so a JSON response containing attacker-supplied text can be interpreted as ` +
          `HTML and executed in your origin. It is one header with no compatibility cost.`,
    });
  }

  return checks;
}

// ── GraphQL (OWASP API9:2023 — Improper Inventory Management) ───────────────
export function graphqlChecks(res: ProbeResult | null, url: string): PulseScanCheckInput[] {
  const key = "api_graphql_introspection";
  const label = "GraphQL introspection is disabled in production";
  if (!res) return [unprobed(key, label, "GraphQL")];
  const path = new URL(url).pathname;

  let parsed: Record<string, unknown> | null = null;
  try {
    const v: unknown = JSON.parse(res.body);
    if (v && typeof v === "object" && !Array.isArray(v)) parsed = v as Record<string, unknown>;
  } catch { /* not JSON */ }
  const data = parsed?.data;
  const answered = !!data && typeof data === "object" && "__schema" in (data as Record<string, unknown>);
  const playground = /graphiql|graphql-playground|apollo.{0,20}(sandbox|studio)/i.test(res.body);

  // We sent `{__schema{…}}`. A response carrying data.__schema IS the schema.
  if (answered || playground) {
    return [{
      category: CATEGORIES.SECURITY,
      checkKey: key,
      label,
      status: "WARN",
      confidence: answered ? "HIGH" : "MEDIUM",
      detail: (answered
        ? `An unauthenticated introspection query to ${path} was answered with the schema. `
        : `${path} serves an interactive GraphQL playground to an unauthenticated request. `) +
        `That publishes your entire schema — every type, field, mutation and argument, including the internal ones ` +
        `you have not documented — which is a complete map of the attack surface and the fastest route to finding an ` +
        `endpoint missing an authorisation check (OWASP API5). Disable introspection and the playground in ` +
        `production; keep both in development.`,
      evidence: answered ? `GET ${path}?query={__schema{queryType{name}}} → data.__schema` : "playground served",
    }];
  }

  const contentType = res.headers["content-type"] ?? "";
  const envelope = /json/i.test(contentType) || parsed ? graphqlEnvelope(res.body) : null;
  const isGraphql = res.status < 500 && (
    /graphql/i.test(contentType) ||
    envelope !== null ||
    looksLikeGraphqlEndpoint({ status: res.status, contentType, body: res.body })
  );
  if (!isGraphql) {
    return [{
      category: CATEGORIES.SECURITY,
      checkKey: key,
      label,
      status: "SKIPPED",
      detail: `No GraphQL endpoint found at ${path} — this check does not apply.`,
    }];
  }

  // A GraphQL error is only a refusal of INTROSPECTION when it says so. "GET
  // queries are not supported" or "must provide query" is the endpoint declining
  // the transport, which leaves the actual question unanswered.
  const errorText = Array.isArray(parsed?.errors)
    ? (parsed!.errors as Array<{ message?: unknown }>).map((e) => String(e?.message ?? "")).join(" ")
    : "";
  if (envelope === "errors" && /introspection|__schema|__type/i.test(errorText)) {
    return [{
      category: CATEGORIES.SECURITY,
      checkKey: key,
      label,
      status: "PASS",
      confidence: "HIGH",
      detail: `An unauthenticated introspection query to ${path} was refused by the GraphQL server.`,
      evidence: errorText.slice(0, 120),
    }];
  }

  return [inconclusive(
    CATEGORIES.SECURITY,
    key,
    label,
    `${path} looks like a GraphQL endpoint (HTTP ${res.status}), but it did not answer a GET introspection query ` +
      `either way${errorText ? ` (“${errorText.slice(0, 100)}”)` : ""}. Many servers only accept queries over POST, ` +
      `which this scan does not send. Run \`{__schema{queryType{name}}}\` against it from a GraphQL client to verify.`,
  )];
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
  // 1xx/204/304 carry no content by definition (RFC 9110), so an absent Content-Type there is correct
  // and says nothing about routes that do return a body.
  const bodiless = response.status === 204 || response.status === 304 || (response.status >= 100 && response.status < 200);
  // Platform/vendor per-request IDs count too: Vercel (x-vercel-id), GitHub, Netlify, AWS S3/CloudFront,
  // Azure, Google Cloud, Fly.io and Stripe-style `request-id` all return a unique identifier per request.
  const correlation = [
    "x-request-id", "x-correlation-id", "traceparent", "x-amzn-trace-id", "cf-ray",
    "request-id", "x-vercel-id", "x-github-request-id", "x-nf-request-id", "x-amz-request-id", "x-amz-cf-id",
    "x-ms-request-id", "x-azure-ref", "x-cloud-trace-context", "fly-request-id",
  ]
    .find((header) => Boolean(headers[header]));
  const cacheControl = headers["cache-control"] ?? "";

  // A response refused for rate limiting is the gateway's, not the API's, and it
  // routinely carries none of the headers a served response would (api.github.com
  // sends Cache-Control on a 200 and not on its rate-limit 403).
  const remaining = headers["x-ratelimit-remaining"] ?? headers["ratelimit-remaining"];
  const rateLimited = response.status === 429 ||
    ((response.status === 401 || response.status === 403) && (remaining?.trim() === "0" || Boolean(headers["retry-after"])));
  if (rateLimited) {
    const why = `The scanned URL answered ${response.status} because Pulse was refused by a rate limit, so a normal ` +
      `response from this API was not observed. Re-run the scan later to assess this.`;
    const checks: PulseScanCheckInput[] = [
      inconclusive(category, "api_response_content_type", "Scanned API response declares a Content-Type", why),
      inconclusive(category, "api_request_correlation", "Scanned API response carries a correlation ID", why),
      inconclusive(category, "api_cache_policy", "Scanned API response declares a cache policy", why),
    ];
    checks.push(errorFormatCheck(error, ctx));
    return checks;
  }

  const checks: PulseScanCheckInput[] = [
    {
      category,
      checkKey: "api_response_content_type",
      label: "Scanned API response declares a Content-Type",
      status: contentType ? "PASS" : bodiless ? "SKIPPED" : "WARN",
      confidence: "HIGH",
      detail: contentType
        ? `The scanned response explicitly declares \`${contentType.slice(0, 100)}\`, so clients need not guess how to parse it.`
        : bodiless
          ? `The scanned endpoint answered ${response.status} with no body, so there was no content to label — a missing Content-Type is correct here. Scan an endpoint that returns data to assess this.`
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
    // Error responses legitimately omit Cache-Control (many are uncacheable by
    // default), so its absence on a 4xx/5xx says nothing about the policy on the
    // data this API serves. A policy that IS declared still counts.
    !cacheControl && response.status >= 400
      ? inconclusive(category, "api_cache_policy", "Scanned API response declares a cache policy",
        `The scanned URL answered ${response.status} with no Cache-Control, and an error response says nothing about ` +
          `the cache policy on the data this API serves. Scan an endpoint that returns 200 to assess this.`)
      : {
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

  checks.push(errorFormatCheck(error, ctx));
  return checks;
}

function errorFormatCheck(error: ProbeResult | null, ctx: ExtendedCheckContext): PulseScanCheckInput {
  const category = CATEGORIES.API_QUALITY;
  if (!error) return unprobed("api_error_machine_readable", "API error responses are machine-readable", "error-response", category);
  if (ctx.catchAll200 && error.status === 200) {
    return {
      category,
      checkKey: "api_error_machine_readable",
      label: "API error responses are machine-readable",
      status: "SKIPPED",
      detail: "The host serves its application shell for unknown paths, so Pulse did not reach an API error handler and cannot judge its error format.",
    };
  }
  const errorType = error.headers["content-type"] ?? "";
  // XML errors (Jetty/JAX-RS `<apiResponse>`, problem+xml) are as structured as JSON.
  const structured = isApiShaped(error) || /^\s*[\[{]/.test(error.body) || /^\s*<\?xml\b/i.test(error.body);
  return {
    category,
    checkKey: "api_error_machine_readable",
    label: "API error responses are machine-readable",
    status: structured ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: structured
      ? `The unknown-route response is machine-readable (${errorType || "structured body"}), allowing an integration to branch on an error code instead of scraping prose.`
      : `The unknown-route response is not recognisably JSON, XML or Problem Details (${errorType || "no Content-Type"}). Return a stable machine-readable error object for API routes, with a code and safe request identifier.`,
    evidence: errorType || undefined,
  };
}
