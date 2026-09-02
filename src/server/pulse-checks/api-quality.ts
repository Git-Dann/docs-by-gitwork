import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, verifyFileExposure, platformIs, skip } from "./_types";

const CATEGORY = CATEGORIES.API_QUALITY;

const ALL_CHECKS: Array<[string, string]> = [
  ["api_versioning_present", "API versioning (/v1/, /v2/ pattern)"],
  ["api_rate_limit_documented", "Rate limits documented"],
  ["api_auth_method_documented", "Auth method documented"],
  ["api_error_rfc7807", "RFC 7807 Problem Details format"],
  ["api_pagination_documented", "Pagination documented"],
  ["api_filtering_sorting", "Filtering / sorting query params documented"],
  ["api_webhook_docs", "Webhook documentation"],
  ["api_sandbox_test_mode", "Sandbox / test mode available"],
  ["api_sdk_packages", "SDK packages published"],
  ["api_versioned_changelog", "Versioned API changelog"],
  ["api_health_status_endpoint", "/api/health or /status endpoint"],
  ["api_deprecation_policy", "Deprecation policy / sunset headers"],
  ["api_sla_documented", "API SLA / uptime guarantee"],
  ["graphql_depth_limiting", "GraphQL depth / complexity limiting"],
  ["openapi_spec_served", "OpenAPI 3.x spec at /openapi.json"],
];

/**
 * Two keywords as a written PHRASE — separated only by whitespace or light
 * punctuation, never by arbitrary characters.
 *
 * ⚠️ Every doc-keyword regex in this file used to be written `a.*b`. `.` matches
 * anything but a newline and minified HTML is ONE line, so `.*` spanned the entire
 * document: `a.*b` asked "does `a` appear anywhere, and `b` anywhere after it?" —
 * which for common words is true of almost any page. The checks then reported PASS
 * having established nothing. Two were proven to fire on Foundry's own login page,
 * which contains no API documentation at all:
 *
 *   api_sandbox_test_mode  matched `test.*mode`  via minified JS `.test(p)` … `mode`
 *   api_sdk_packages       matched `go.*get`     via the `go` inside `"logo"`
 *
 * A bounded `.{0,8}` is NOT sufficient and was tried first: `.test(p),mode="dark"`
 * puts only four characters between "test" and "mode", so minified JS still matched.
 * What these checks are actually looking for is documentation prose, so the
 * separator is constrained to the characters that legitimately appear inside a
 * phrase — whitespace, hyphen, underscore, slash — which admits "test mode",
 * "rate-limit" and "rate  limits" while rejecting `(p),`.
 *
 * Same class of defect as CLAUDE.md §34.3's `ios_dynamic_type`: a presence test
 * standing in for a real measurement.
 */
function near(a: string, b: string): string {
  return `${a}[\\s\\-_/]{0,3}${b}`;
}

export async function runApiQualityChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl, ctx: pctx } = ctx;
  const html = ctx.pageResult.html;

  // Only relevant for API backends and developer-facing SaaS products
  if (platformIs(ctx.platform, "MARKETING_SITE", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "CLI_TOOL", "DESKTOP_APP")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable — API quality checks are for API backends and developer platforms.");
  }

  if (!pctx.hasBackend && !html.toLowerCase().includes("/api/")) {
    return ALL_CHECKS.map(([checkKey, label]) => ({
      category: CATEGORY, checkKey, label, status: "SKIPPED" as const,
      detail: "No API signals detected on this site.",
    }));
  }

  const checks: PulseScanCheckInput[] = [];

  // API versioning
  const hasVersioning = new RegExp(`/v\\d+/|/api/v\\d+|${near("version", "v\\d")}|${near("api", "version")}`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_versioning_present", label: "API versioning (/v1/, /v2/ pattern)", status: hasVersioning ? "PASS" : "WARN", detail: hasVersioning ? "API versioning signals detected (/v1/, /v2/ patterns)." : "No API versioning signals — version your API from day one (/v1/) to allow breaking changes without disrupting existing integrations." });

  // Rate limits documented
  const hasRateLimitDocs = new RegExp(`${near("rate", "limit")}|${near("request", "per second")}|rps\\b|${near("requests", "per minute")}|rpm\\b|throttl`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_rate_limit_documented", label: "Rate limits documented", status: hasRateLimitDocs ? "PASS" : "WARN", detail: hasRateLimitDocs ? "Rate limiting documentation signals detected." : "No rate limiting documentation — document your rate limits (requests/minute per tier) so developers can build respectful API clients." });

  // Auth method documented
  const hasAuthDocs = new RegExp(`${near("bearer", "token")}|${near("api", "key")}|${near("authorization", "header")}|${near("oauth", "flow")}|${near("api", "authentication")}`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_auth_method_documented", label: "Auth method documented", status: hasAuthDocs ? "PASS" : "WARN", detail: hasAuthDocs ? "API authentication documentation detected." : "No auth method documentation — document whether your API uses Bearer tokens, API keys, or OAuth2, with copy-paste code examples." });

  // RFC 7807 Problem Details
  const hasRfc7807 = new RegExp(`${near("rfc", "7807")}|${near("problem", "detail")}|application/problem\\+json|application/problem`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_error_rfc7807", label: "RFC 7807 Problem Details error format", status: hasRfc7807 ? "PASS" : "WARN", detail: hasRfc7807 ? "RFC 7807 Problem Details format signals detected." : "No RFC 7807 reference — standardise API error responses using Problem Details (RFC 7807) so clients get machine-readable errors with type, title, and detail fields." });

  // Pagination
  const hasPaginationDocs = new RegExp(`pagination|${near("page", "cursor")}|${near("limit", "offset")}|${near("next", "cursor")}`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_pagination_documented", label: "Pagination documented", status: hasPaginationDocs ? "PASS" : "WARN", detail: hasPaginationDocs ? "Pagination documentation signals detected." : "No pagination documentation — document your pagination model (cursor, offset, keyset) with examples. Undocumented pagination is a top developer complaint." });

  // Filtering/sorting
  const hasFilterDocs = new RegExp(`${near("filter", "param")}|${near("sort", "param")}|${near("query", "param")}|filtering|${near("sorting", "api")}|\\?filter=|\\?sort=`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_filtering_sorting", label: "Filtering / sorting query params", status: hasFilterDocs ? "PASS" : "WARN", detail: hasFilterDocs ? "API filtering / sorting documentation detected." : "No filtering/sorting documentation — document available query parameters for filtering and sorting results; this dramatically reduces custom integration code." });

  // Webhook docs
  const hasWebhookDocs = new RegExp(`${near("webhook", "documentation")}|${near("webhook", "guide")}|${near("webhook", "event")}|${near("event", "webhook")}|${near("webhook", "payload")}|${near("webhook", "signature")}`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_webhook_docs", label: "Webhook documentation", status: hasWebhookDocs ? "PASS" : "WARN", detail: hasWebhookDocs ? "Webhook documentation signals detected." : "No webhook documentation — webhooks are essential for real-time integrations; document all event types, payload schemas, and signature verification." });

  // Sandbox/test mode
  const hasSandbox = new RegExp(`sandbox|${near("test", "mode")}|${near("test", "environment")}|${near("staging", "api")}|${near("api", "sandbox")}|${near("test api", "key")}`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_sandbox_test_mode", label: "Sandbox / test mode", status: hasSandbox ? "PASS" : "WARN", detail: hasSandbox ? "API sandbox / test mode signals detected." : "No sandbox environment signals — a sandbox/test mode with separate API keys enables developers to integrate safely without touching production data." });

  // SDK packages
  const hasSdkDocs = new RegExp(`sdk|${near("client", "library")}|${near("npm", "install")}|${near("npm", "package")}|${near("pip", "install")}|${near("gem", "install")}|${near("composer", "require")}|${near("nuget", "package")}|go get `, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_sdk_packages", label: "SDK packages published", status: hasSdkDocs ? "PASS" : "WARN", detail: hasSdkDocs ? "SDK / client library signals detected." : "No SDK signals — official SDKs in major languages (JS/TS, Python, Ruby, Go) reduce integration time from days to hours." });

  // Versioned API changelog
  const hasApiChangelog = new RegExp(`${near("api", "changelog")}|${near("breaking", "change")}|${near("deprecat", "api")}|${near("changelog", "api")}|${near("api version", "history")}`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_versioned_changelog", label: "Versioned API changelog", status: hasApiChangelog ? "PASS" : "WARN", detail: hasApiChangelog ? "API versioned changelog signals detected." : "No API changelog — publish a versioned API changelog so developers can track breaking changes and plan upgrades." });

  // Health endpoint — a real one returns JSON/text for LBs & k8s probes, not the
  // app shell, so content-verify (verifyFileExposure rejects the HTML shell). This
  // keeps the check honest on catch-all hosts that 200 every path.
  const [healthServed, statusServed, apiHealthServed] = await Promise.all([
    verifyFileExposure(`${httpsUrl}/health`),
    verifyFileExposure(`${httpsUrl}/status`),
    verifyFileExposure(`${httpsUrl}/api/health`),
  ]);
  const hasHealthEndpoint = healthServed || statusServed || apiHealthServed;
  checks.push({ category: CATEGORY, checkKey: "api_health_status_endpoint", label: "/api/health or /status endpoint", status: hasHealthEndpoint ? "PASS" : "WARN", detail: hasHealthEndpoint ? `Health endpoint found (${healthServed ? "/health" : statusServed ? "/status" : "/api/health"}).` : "No health endpoint found at /health, /status, or /api/health — a health endpoint is required for load balancers, monitoring, and Kubernetes liveness probes." });

  // Deprecation policy
  const hasDeprecationPolicy = new RegExp(`${near("deprecation", "policy")}|${near("sunset", "header")}|${near("api", "deprecat")}|${near("deprecated", "api")}|${near("end of life", "api")}`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_deprecation_policy", label: "Deprecation policy / sunset headers", status: hasDeprecationPolicy ? "PASS" : "WARN", detail: hasDeprecationPolicy ? "API deprecation policy signals detected." : "No deprecation policy — document how you announce breaking changes and add Sunset/Deprecation headers to deprecated endpoints per RFC 8594." });

  // API SLA
  const hasApiSla = new RegExp(`${near("api", "sla")}|${near("api", "uptime")}|${near("api", "availability")}|${near("99\\.9", "api")}|${near("api", "service level")}`, "i").test(html);
  checks.push({ category: CATEGORY, checkKey: "api_sla_documented", label: "API SLA / uptime guarantee", status: hasApiSla ? "PASS" : "WARN", detail: hasApiSla ? "API SLA documentation signals detected." : "No API SLA — enterprise integrations require a documented API uptime SLA; without one, buyers cannot sign off on the integration risk." });

  // GraphQL depth limiting
  const hasGraphqlDepth = new RegExp(`${near("depth", "limit")}|${near("complexity", "limit")}|${near("graphql", "limit")}|${near("query", "depth")}|${near("max", "depth")}`, "i").test(html);
  const hasGraphql = html.toLowerCase().includes("graphql");
  // SKIPPED, not PASS, when there is no GraphQL. A check whose own detail says
  // "Not applicable" must not earn weight: score-breakdown.ts counts PASS on both
  // sides of the ratio and excludes SKIPPED from both, so returning PASS here handed
  // every non-GraphQL site in the corpus a free point — and quietly inflated the
  // medians in getIndustryBenchmarks that other scans are then compared against.
  checks.push({ category: CATEGORY, checkKey: "graphql_depth_limiting", label: "GraphQL depth / complexity limiting", status: hasGraphql ? (hasGraphqlDepth ? "PASS" : "WARN") : "SKIPPED", detail: hasGraphql ? (hasGraphqlDepth ? "GraphQL depth / complexity limiting signals detected." : "GraphQL detected but no depth/complexity limiting signals — without depth limiting, malicious clients can craft deeply nested queries that cause exponential database load.") : "Not applicable — no GraphQL detected." });

  // OpenAPI spec — content-verify so a catch-all 200 (app shell) isn't mistaken
  // for a served spec; require an actual JSON body mentioning the OpenAPI/Swagger key.
  const isOpenapiJson = (body: string, ct: string) =>
    (ct.includes("json") || /^\s*\{/.test(body)) && /"(openapi|swagger)"\s*:/.test(body);
  const [openapiServed, swaggerServed] = await Promise.all([
    verifyFileExposure(`${httpsUrl}/openapi.json`, isOpenapiJson),
    verifyFileExposure(`${httpsUrl}/swagger.json`, isOpenapiJson),
  ]);
  const hasOpenapiSpec = openapiServed || swaggerServed;
  checks.push({ category: CATEGORY, checkKey: "openapi_spec_served", label: "OpenAPI 3.x spec at /openapi.json", status: hasOpenapiSpec ? "PASS" : "WARN", detail: hasOpenapiSpec ? `OpenAPI spec found at ${openapiServed ? "/openapi.json" : "/swagger.json"}.` : "No OpenAPI spec at /openapi.json or /swagger.json — serving a machine-readable OpenAPI spec enables auto-generated SDKs, Postman collections, and API gateways." });

  return checks;
}
