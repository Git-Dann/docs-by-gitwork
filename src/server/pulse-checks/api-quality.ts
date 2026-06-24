import { type ExtendedCheckContext, type PulseScanCheckInput, headRequest, verifyFileExposure, platformIs, skip } from "./_types";

const CATEGORY = "API Quality";

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

export async function runApiQualityChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { httpsUrl, ctx: pctx } = ctx;
  const html = ctx.pageResult.html;

  // Only relevant for API backends and developer-facing SaaS products
  if (platformIs(ctx.platform, "MARKETING_SITE", "IOS_APP", "ANDROID_APP", "CLI_TOOL", "DESKTOP_APP")) {
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
  const hasVersioning = /\/v\d+\/|\/api\/v\d+|version.*v\d|api.*version/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_versioning_present", label: "API versioning (/v1/, /v2/ pattern)", status: hasVersioning ? "PASS" : "WARN", detail: hasVersioning ? "API versioning signals detected (/v1/, /v2/ patterns)." : "No API versioning signals — version your API from day one (/v1/) to allow breaking changes without disrupting existing integrations." });

  // Rate limits documented
  const hasRateLimitDocs = /rate.*limit|rate.*limiting|request.*per.*second|rps\b|requests.*per.*minute|rpm\b|throttl/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_rate_limit_documented", label: "Rate limits documented", status: hasRateLimitDocs ? "PASS" : "WARN", detail: hasRateLimitDocs ? "Rate limiting documentation signals detected." : "No rate limiting documentation — document your rate limits (requests/minute per tier) so developers can build respectful API clients." });

  // Auth method documented
  const hasAuthDocs = /bearer.*token|api.*key.*header|authorization.*header|oauth.*flow|api.*authentication/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_auth_method_documented", label: "Auth method documented", status: hasAuthDocs ? "PASS" : "WARN", detail: hasAuthDocs ? "API authentication documentation detected." : "No auth method documentation — document whether your API uses Bearer tokens, API keys, or OAuth2, with copy-paste code examples." });

  // RFC 7807 Problem Details
  const hasRfc7807 = /rfc.*7807|problem.*detail|application\/problem\+json|application\/problem/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_error_rfc7807", label: "RFC 7807 Problem Details error format", status: hasRfc7807 ? "PASS" : "WARN", detail: hasRfc7807 ? "RFC 7807 Problem Details format signals detected." : "No RFC 7807 reference — standardise API error responses using Problem Details (RFC 7807) so clients get machine-readable errors with type, title, and detail fields." });

  // Pagination
  const hasPaginationDocs = /pagination|cursor.*pagination|page.*cursor|limit.*offset|next.*cursor|has.*more/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_pagination_documented", label: "Pagination documented", status: hasPaginationDocs ? "PASS" : "WARN", detail: hasPaginationDocs ? "Pagination documentation signals detected." : "No pagination documentation — document your pagination model (cursor, offset, keyset) with examples. Undocumented pagination is a top developer complaint." });

  // Filtering/sorting
  const hasFilterDocs = /filter.*param|sort.*param|query.*param|filtering|sorting.*api|\?filter=|\?sort=/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_filtering_sorting", label: "Filtering / sorting query params", status: hasFilterDocs ? "PASS" : "WARN", detail: hasFilterDocs ? "API filtering / sorting documentation detected." : "No filtering/sorting documentation — document available query parameters for filtering and sorting results; this dramatically reduces custom integration code." });

  // Webhook docs
  const hasWebhookDocs = /webhook.*documentation|webhook.*guide|webhook.*event|event.*webhook|webhook.*payload|webhook.*signature/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_webhook_docs", label: "Webhook documentation", status: hasWebhookDocs ? "PASS" : "WARN", detail: hasWebhookDocs ? "Webhook documentation signals detected." : "No webhook documentation — webhooks are essential for real-time integrations; document all event types, payload schemas, and signature verification." });

  // Sandbox/test mode
  const hasSandbox = /sandbox|test.*mode|test.*environment|staging.*api|api.*sandbox|test.*api.*key/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_sandbox_test_mode", label: "Sandbox / test mode", status: hasSandbox ? "PASS" : "WARN", detail: hasSandbox ? "API sandbox / test mode signals detected." : "No sandbox environment signals — a sandbox/test mode with separate API keys enables developers to integrate safely without touching production data." });

  // SDK packages
  const hasSdkDocs = /sdk|client.*library|npm.*package|pip.*install|gem.*install|composer.*require|nuget.*package|go.*get/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_sdk_packages", label: "SDK packages published", status: hasSdkDocs ? "PASS" : "WARN", detail: hasSdkDocs ? "SDK / client library signals detected." : "No SDK signals — official SDKs in major languages (JS/TS, Python, Ruby, Go) reduce integration time from days to hours." });

  // Versioned API changelog
  const hasApiChangelog = /api.*changelog|breaking.*change|deprecat.*api|changelog.*api|api.*version.*history/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_versioned_changelog", label: "Versioned API changelog", status: hasApiChangelog ? "PASS" : "WARN", detail: hasApiChangelog ? "API versioned changelog signals detected." : "No API changelog — publish a versioned API changelog so developers can track breaking changes and plan upgrades." });

  // Health endpoint
  const [healthStatus, statusStatus, apiHealthStatus] = await Promise.all([
    headRequest(`${httpsUrl}/health`),
    headRequest(`${httpsUrl}/status`),
    headRequest(`${httpsUrl}/api/health`),
  ]);
  const hasHealthEndpoint = healthStatus === 200 || statusStatus === 200 || apiHealthStatus === 200;
  checks.push({ category: CATEGORY, checkKey: "api_health_status_endpoint", label: "/api/health or /status endpoint", status: hasHealthEndpoint ? "PASS" : "WARN", detail: hasHealthEndpoint ? `Health endpoint found (${healthStatus === 200 ? "/health" : statusStatus === 200 ? "/status" : "/api/health"}).` : "No health endpoint found at /health, /status, or /api/health — a health endpoint is required for load balancers, monitoring, and Kubernetes liveness probes." });

  // Deprecation policy
  const hasDeprecationPolicy = /deprecation.*policy|sunset.*header|api.*deprecat|deprecated.*api|end.*of.*life.*api/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_deprecation_policy", label: "Deprecation policy / sunset headers", status: hasDeprecationPolicy ? "PASS" : "WARN", detail: hasDeprecationPolicy ? "API deprecation policy signals detected." : "No deprecation policy — document how you announce breaking changes and add Sunset/Deprecation headers to deprecated endpoints per RFC 8594." });

  // API SLA
  const hasApiSla = /api.*sla|api.*uptime|api.*availability|99\.9.*api|api.*service.*level/i.test(html);
  checks.push({ category: CATEGORY, checkKey: "api_sla_documented", label: "API SLA / uptime guarantee", status: hasApiSla ? "PASS" : "WARN", detail: hasApiSla ? "API SLA documentation signals detected." : "No API SLA — enterprise integrations require a documented API uptime SLA; without one, buyers cannot sign off on the integration risk." });

  // GraphQL depth limiting
  const hasGraphqlDepth = /depth.*limit|complexity.*limit|graphql.*limit|query.*depth|max.*depth/i.test(html);
  const hasGraphql = html.toLowerCase().includes("graphql");
  checks.push({ category: CATEGORY, checkKey: "graphql_depth_limiting", label: "GraphQL depth / complexity limiting", status: hasGraphql ? (hasGraphqlDepth ? "PASS" : "WARN") : "PASS", detail: hasGraphql ? (hasGraphqlDepth ? "GraphQL depth / complexity limiting signals detected." : "GraphQL detected but no depth/complexity limiting signals — without depth limiting, malicious clients can craft deeply nested queries that cause exponential database load.") : "Not applicable — no GraphQL detected." });

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
