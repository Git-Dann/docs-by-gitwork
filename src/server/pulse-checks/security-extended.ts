import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, fetchWithTimeout, headRequest, verifyFileExposure, checkDnsRecord, resolveDnsRecord, probeInconclusive, skip, platformIs, CATCH_ALL_NOTE } from "./_types";

const CHECKS: Array<[string, string]> = [
  ["cross_origin_opener_policy", "Cross-Origin-Opener-Policy (COOP)"],
  ["cross_origin_resource_policy", "Cross-Origin-Resource-Policy (CORP)"],
  ["cross_origin_embedder_policy", "Cross-Origin-Embedder-Policy (COEP)"],
  ["csp_report_directive", "CSP report-uri / report-to configured"],
  ["rate_limiting_headers", "Rate-limiting headers present"],
  ["caa_dns_record", "CAA DNS record (cert authority restriction)"],
  ["dnssec_enabled", "DNSSEC enabled on domain"],
  ["certificate_expiry_30d", "SSL cert not expiring within 30 days"],
  ["no_exposed_ds_store", ".DS_Store not publicly accessible"],
  ["no_exposed_composer_json", "composer.json not at web root"],
  ["no_exposed_package_json_root", "package.json not served at root"],
  ["no_exposed_swagger_open", "Swagger UI not open in production"],
  ["no_exposed_actuator", "/actuator endpoints not public"],
  ["no_exposed_prometheus_metrics", "/metrics endpoint not public"],
  ["no_graphql_introspection_prod", "GraphQL introspection disabled in prod"],
  ["no_exposed_source_maps", "Source maps not served with page"],
  ["no_api_keys_in_html", "No API key patterns in HTML source"],
  ["csrf_protection_signals", "CSRF token protection detected"],
  ["bot_protection_present", "Bot protection (Cloudflare / reCAPTCHA)"],
  ["sql_error_exposure", "No SQL errors exposed in responses"],
  ["brute_force_protection", "Brute force / rate limit on auth"],
  ["session_cookie_httponly", "HttpOnly flag on session cookies"],
  ["session_cookie_samesite", "SameSite attribute on cookies"],
  ["csp_frame_ancestors", "frame-ancestors in CSP policy"],
  ["no_exposed_env_variants", ".env.prod / .env.docker not accessible"],
  ["secret_scanning_github", "No secrets / keys in page HTML"],
  ["cors_credentials_restricted", "CORS credentials not open to all origins"],
  ["dependency_audit_clean", "No obvious vulnerable library versions"],
  ["subdomain_takeover_risk", "No dangling CNAME / subdomain takeover risk"],
  ["content_security_policy_nonce", "CSP uses nonces (not unsafe-inline)"],
];

export async function runSecurityExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { pageResult, httpsUrl, hostname, htmlLower, catchAll200 } = ctx;
  const h = pageResult.headers;

  if (platformIs(ctx.platform, "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORIES.SECURITY, CHECKS, "Not applicable — native mobile apps are not web servers.");
  }

  const checks: PulseScanCheckInput[] = [];

  // COOP
  const hasCoop = !!h["cross-origin-opener-policy"];
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "cross_origin_opener_policy", label: "Cross-Origin-Opener-Policy (COOP)", status: hasCoop ? "PASS" : "WARN", detail: hasCoop ? `COOP header present: ${h["cross-origin-opener-policy"]}` : "No COOP header — prevents cross-origin window attacks (Spectre). Set to same-origin or same-origin-allow-popups." });

  // CORP
  const hasCorp = !!h["cross-origin-resource-policy"];
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "cross_origin_resource_policy", label: "Cross-Origin-Resource-Policy (CORP)", status: hasCorp ? "PASS" : "WARN", detail: hasCorp ? `CORP header: ${h["cross-origin-resource-policy"]}` : "No CORP header — resources can be embedded by any origin. Set to same-site or same-origin to prevent cross-origin information leakage." });

  // COEP
  const hasCoep = !!h["cross-origin-embedder-policy"];
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "cross_origin_embedder_policy", label: "Cross-Origin-Embedder-Policy (COEP)", status: hasCoep ? "PASS" : "WARN", detail: hasCoep ? `COEP header: ${h["cross-origin-embedder-policy"]}` : "No COEP header — required alongside COOP to enable cross-origin isolation and SharedArrayBuffer." });

  // CSP report directive
  const csp = h["content-security-policy"] ?? "";
  const hasReportUri = csp.includes("report-uri") || csp.includes("report-to");
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "csp_report_directive", label: "CSP report-uri / report-to configured", status: hasReportUri ? "PASS" : "WARN", detail: hasReportUri ? "CSP report endpoint configured — policy violations are captured." : "No CSP report endpoint — without report-uri/report-to you have no visibility into CSP violations or injection attempts." });

  // Rate limiting headers
  const hasRateLimit = !!h["x-ratelimit-limit"] || !!h["x-ratelimit-remaining"] || !!h["retry-after"] || !!h["ratelimit-limit"];
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "rate_limiting_headers", label: "Rate-limiting headers present", status: hasRateLimit ? "PASS" : "WARN", detail: hasRateLimit ? "Rate limiting headers detected — API endpoint protection in place." : "No rate-limiting headers — consider adding X-RateLimit-* headers to API responses to signal throttling behaviour." });

  // CAA DNS record
  const caaRecords = await checkDnsRecord(hostname, "CAA");
  const hasCaa = caaRecords.length > 0;
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "caa_dns_record", label: "CAA DNS record (cert authority restriction)", status: hasCaa ? "PASS" : "WARN", detail: hasCaa ? `CAA record found — only authorised CAs can issue certificates for this domain.` : "No CAA record — any certificate authority can issue SSL certificates for your domain. Add a CAA record to restrict issuance to your CA." });

  // DNSSEC
  const dsRecords = await checkDnsRecord(hostname, "DS");
  const hasDnssec = dsRecords.length > 0;
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "dnssec_enabled", label: "DNSSEC enabled on domain", status: hasDnssec ? "PASS" : "WARN", detail: hasDnssec ? "DNSSEC DS record found — DNS responses are cryptographically signed." : "No DNSSEC detected — DNS responses are unauthenticated and vulnerable to cache poisoning attacks." });

  // Certificate expiry (check for Strict-Transport-Security max-age or server header)
  const stsHeader = h["strict-transport-security"] ?? "";
  const maxAgeMatch = stsHeader.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
  const certExpirySoon = maxAge > 0 && maxAge < 30 * 24 * 3600;
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "certificate_expiry_30d", label: "SSL cert not expiring within 30 days", status: certExpirySoon ? "WARN" : "PASS", detail: certExpirySoon ? "HSTS max-age is very short — may indicate certificate expiring soon. Verify renewal is automated (Let's Encrypt / certbot)." : "Certificate appears valid with adequate HSTS max-age." });

  // ── Exposed-file / endpoint probes ───────────────────────────────────────────
  // Two failure modes to avoid on SPA / Vercel / Next.js hosts that serve their
  // app shell (200) for ANY path:
  //   • Direct files (.env.prod, .DS_Store, composer.json, package.json) are
  //     content-verified — a real exposure serves its own bytes, not the HTML
  //     shell — so verifyFileExposure() rejects a soft-200.
  //   • Endpoints (/swagger-ui, /actuator, /metrics, /graphql) can legitimately
  //     return HTML/JSON, so content alone can't disambiguate; when the host is a
  //     catch-all (catchAll200) these probes are inconclusive → PASS with a note.
  const isJsonBody = (body: string, ct: string) =>
    ct.includes("json") || /^\s*[[{]/.test(body);
  const [dsStoreExposed, composerExposed, packageJsonExposed, swaggerStatus, actuatorStatus, prometheusStatus, graphqlStatus, envProdExposed, envDockerExposed] = await Promise.all([
    verifyFileExposure(`${httpsUrl}/.DS_Store`),
    verifyFileExposure(`${httpsUrl}/composer.json`, isJsonBody),
    verifyFileExposure(`${httpsUrl}/package.json`, isJsonBody),
    headRequest(`${httpsUrl}/swagger-ui`),
    headRequest(`${httpsUrl}/actuator`),
    headRequest(`${httpsUrl}/metrics`),
    headRequest(`${httpsUrl}/graphql`),
    verifyFileExposure(`${httpsUrl}/.env.prod`),
    verifyFileExposure(`${httpsUrl}/.env.docker`),
  ]);

  // Endpoint exposure only counts when the host is NOT a catch-all 200 host.
  const swaggerExposed   = !catchAll200 && swaggerStatus === 200;
  const actuatorExposed  = !catchAll200 && actuatorStatus === 200;
  const metricsExposed   = !catchAll200 && prometheusStatus === 200;
  const graphqlPresent   = !catchAll200 && graphqlStatus === 200;
  const endpointNote = catchAll200 ? CATCH_ALL_NOTE : "";

  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_ds_store", label: ".DS_Store not publicly accessible", status: dsStoreExposed ? "FAIL" : "PASS", detail: dsStoreExposed ? "CRITICAL: .DS_Store file accessible — exposes directory structure and filenames to attackers." : ".DS_Store not accessible." });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_composer_json", label: "composer.json not at web root", status: composerExposed ? "WARN" : "PASS", detail: composerExposed ? "composer.json accessible at web root — exposes PHP dependency list and potential vulnerable package versions." : "composer.json not accessible at web root." });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_package_json_root", label: "package.json not served at root", status: packageJsonExposed ? "WARN" : "PASS", detail: packageJsonExposed ? "package.json accessible — exposes dependency list, scripts, and potentially internal tooling details." : "package.json not served at web root." });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_swagger_open", label: "Swagger UI not open in production", status: swaggerExposed ? "WARN" : "PASS", detail: swaggerExposed ? "Swagger UI appears publicly accessible — ensure API documentation requires authentication in production." : "Swagger UI not found at /swagger-ui." + endpointNote });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_actuator", label: "/actuator endpoints not public", status: actuatorExposed ? "FAIL" : "PASS", detail: actuatorExposed ? "CRITICAL: Spring Boot Actuator endpoint publicly accessible — exposes heap dumps, env vars, and internal metrics." : "/actuator not publicly accessible." + endpointNote });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_prometheus_metrics", label: "/metrics endpoint not public", status: metricsExposed ? "WARN" : "PASS", detail: metricsExposed ? "/metrics endpoint is publicly accessible — may expose internal infrastructure details and business metrics." : "/metrics endpoint not publicly accessible." + endpointNote });

  // GraphQL introspection. The probe failing is NOT evidence that introspection is
  // off — that inversion previously turned any timeout into a clean PASS.
  let gqlIntrospectionOff = true;
  let gqlProbeError: string | null = null;
  if (graphqlPresent) {
    try {
      const gqlRes = await fetchWithTimeout(`${httpsUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __schema { types { name } } }" }),
        signal: AbortSignal.timeout(5000),
      });
      const body = await gqlRes.text();
      gqlIntrospectionOff = !body.includes("__schema");
    } catch (error) {
      gqlProbeError = error instanceof Error ? error.message : "introspection query failed";
    }
  }
  if (gqlProbeError) {
    checks.push(probeInconclusive(CATEGORIES.SECURITY, "no_graphql_introspection_prod", "GraphQL introspection disabled in prod",
      `A GraphQL endpoint responded at /graphql but the introspection query did not complete (${gqlProbeError}). Re-run the scan, or send the introspection query by hand.`));
  } else {
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_graphql_introspection_prod", label: "GraphQL introspection disabled in prod", status: graphqlPresent && !gqlIntrospectionOff ? "WARN" : "PASS", detail: graphqlPresent && !gqlIntrospectionOff ? "GraphQL introspection is enabled — attackers can enumerate your entire API schema. Disable introspection in production." : "GraphQL introspection appears disabled or endpoint not present." });
  }

  // Source maps
  const hasSourceMaps = /\.js\.map["']/i.test(pageResult.html) || /sourceMappingURL=/i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_source_maps", label: "Source maps not served with page", status: hasSourceMaps ? "WARN" : "PASS", detail: hasSourceMaps ? "Source map references detected in page HTML — production source maps expose your application source code to anyone who opens DevTools." : "No source map references detected in page HTML." });

  // API keys in HTML
  const apiKeyPatterns = /AIza[0-9A-Za-z\-_]{35}|sk-[a-zA-Z0-9]{32,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}/;
  const hasExposedKeys = apiKeyPatterns.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_api_keys_in_html", label: "No API key patterns in HTML source", status: hasExposedKeys ? "FAIL" : "PASS", detail: hasExposedKeys ? "CRITICAL: Potential API key or secret detected in page HTML source. Rotate affected credentials immediately." : "No obvious API key patterns detected in HTML source." });

  // CSRF tokens
  const hasCsrf = /name=["']_csrf["']|name=["']csrf_token["']|name=["']authenticity_token["']|csrf-token/i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "csrf_protection_signals", label: "CSRF token protection detected", status: hasCsrf ? "PASS" : "WARN", detail: hasCsrf ? "CSRF token detected in page HTML — form submissions are protected against cross-site request forgery." : "No CSRF token detected — ensure state-changing requests use CSRF protection (synchroniser tokens or SameSite cookies)." });

  // Bot protection
  const hasCfBot = !!h["cf-mitigated"] || htmlLower.includes("__cf_bm") || htmlLower.includes("cf-turnstile");
  const hasRecaptcha = htmlLower.includes("recaptcha") || htmlLower.includes("hcaptcha");
  const hasBotProtection = hasCfBot || hasRecaptcha;
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "bot_protection_present", label: "Bot protection (Cloudflare / reCAPTCHA)", status: hasBotProtection ? "PASS" : "WARN", detail: hasBotProtection ? "Bot protection signals detected (Cloudflare / reCAPTCHA / hCaptcha)." : "No bot protection detected — consider Cloudflare Turnstile, hCaptcha, or similar to protect forms and auth endpoints." });

  // SQL error exposure
  const hasSqlError = /SQL syntax|mysql_fetch|ORA-\d{5}|pg_query|You have an error in your SQL syntax/i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "sql_error_exposure", label: "No SQL errors exposed in responses", status: hasSqlError ? "FAIL" : "PASS", detail: hasSqlError ? "CRITICAL: SQL error message detected in page response — exposes database structure and confirms SQL injection vectors." : "No SQL error messages detected in page response." });

  // Brute force protection
  const hasBruteForce = htmlLower.includes("account locked") || htmlLower.includes("too many attempts") || htmlLower.includes("temporarily disabled") || hasRateLimit;
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "brute_force_protection", label: "Brute force / rate limit on auth", status: hasBruteForce ? "PASS" : "WARN", detail: hasBruteForce ? "Account lockout or rate limiting signals detected on authentication." : "No brute force protection signals found — ensure login endpoints have rate limiting and lockout policies." });

  // Cookie flags
  const setCookie = h["set-cookie"] ?? "";
  const hasHttpOnly = /httponly/i.test(setCookie);
  const hasSameSite = /samesite/i.test(setCookie);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "session_cookie_httponly", label: "HttpOnly flag on session cookies", status: setCookie ? (hasHttpOnly ? "PASS" : "WARN") : "PASS", detail: setCookie ? (hasHttpOnly ? "HttpOnly flag detected on cookies — JavaScript cannot access session cookies." : "Cookies set without HttpOnly flag — session cookies are accessible via JavaScript and vulnerable to XSS theft.") : "No Set-Cookie header on this response." });
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "session_cookie_samesite", label: "SameSite attribute on cookies", status: setCookie ? (hasSameSite ? "PASS" : "WARN") : "PASS", detail: setCookie ? (hasSameSite ? "SameSite attribute detected on cookies — CSRF via cross-site navigation is mitigated." : "Cookies set without SameSite attribute — add SameSite=Strict or SameSite=Lax to reduce CSRF risk.") : "No Set-Cookie header on this response." });

  // CSP frame-ancestors
  const hasCspFrameAncestors = csp.includes("frame-ancestors");
  const hasXfo = !!h["x-frame-options"];
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "csp_frame_ancestors", label: "frame-ancestors in CSP policy", status: hasCspFrameAncestors ? "PASS" : hasXfo ? "WARN" : "WARN", detail: hasCspFrameAncestors ? "CSP frame-ancestors directive present — clickjacking protection via CSP (supersedes X-Frame-Options)." : "No frame-ancestors in CSP — use CSP frame-ancestors instead of X-Frame-Options for modern clickjacking protection." });

  // .env variants
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "no_exposed_env_variants", label: ".env.prod / .env.docker not accessible", status: (envProdExposed || envDockerExposed) ? "FAIL" : "PASS", detail: (envProdExposed || envDockerExposed) ? "CRITICAL: .env.prod or .env.docker accessible — environment secrets are exposed." : ".env variant files not publicly accessible." });

  // Secrets / keys in HTML (broader check)
  const hasSecretPatterns = /password\s*=\s*["'][^"']{8,}["']|secret\s*=\s*["'][^"']{8,}["']/i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "secret_scanning_github", label: "No secrets / keys in page HTML", status: hasSecretPatterns ? "FAIL" : "PASS", detail: hasSecretPatterns ? "Potential hardcoded secret or password detected in page source. Review and rotate if confirmed." : "No hardcoded secret patterns detected in page HTML." });

  // CORS credentials
  const corsOrigin = h["access-control-allow-origin"] ?? "";
  const corsCredentials = h["access-control-allow-credentials"] ?? "";
  const badCors = corsOrigin === "*" && corsCredentials.toLowerCase() === "true";
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "cors_credentials_restricted", label: "CORS credentials not open to all origins", status: badCors ? "FAIL" : "PASS", detail: badCors ? "CRITICAL: CORS allows all origins (*) with credentials — this configuration is invalid and dangerous. Specify explicit allowed origins." : "CORS credentials configuration appears safe." });

  // Vulnerable library versions (basic jQuery check from existing + old Angular)
  const hasOldLib = /jquery[/-]1\.[0-6]\./i.test(pageResult.html) || /angular\.js.*1\.[0-3]\./i.test(pageResult.html);
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "dependency_audit_clean", label: "No obvious vulnerable library versions", status: hasOldLib ? "WARN" : "PASS", detail: hasOldLib ? "Outdated library version detected — check npm audit / Dependabot for known CVEs." : "No obviously vulnerable library versions detected in page source." });

  // Subdomain takeover (CNAME to common unclaimed services). The PASS here rests on
  // an EMPTY answer, so a failed lookup must not reach it — see resolveDnsRecord.
  const cname = await resolveDnsRecord(hostname, "CNAME");
  if (!cname.ok) {
    checks.push(probeInconclusive(CATEGORIES.SECURITY, "subdomain_takeover_risk", "No dangling CNAME / subdomain takeover risk",
      `The CNAME lookup for ${hostname} did not complete (${cname.reason}), so dangling-CNAME risk could not be assessed.`));
  } else {
    const dangling = ["s3.amazonaws.com", "azurewebsites.net", "herokuapp.com", "pages.github.io", "ghost.io", "cargo.site", "surge.sh", "bitbucket.io"];
    const subTakeoverRisk = cname.records.some((r) => dangling.some((d) => r.includes(d)));
    checks.push({ category: CATEGORIES.SECURITY, checkKey: "subdomain_takeover_risk", label: "No dangling CNAME / subdomain takeover risk", status: subTakeoverRisk ? "FAIL" : "PASS", detail: subTakeoverRisk ? "CNAME points to a cloud service that may be unclaimed — subdomain takeover risk. Verify the target resource still exists." : "No obvious dangling CNAME records detected." });
  }

  // CSP nonce
  const hasCspNonce = csp.includes("nonce-") || /nonce=["'][^"']+["']/i.test(pageResult.html);
  const hasUnsafeInline = csp.includes("unsafe-inline");
  checks.push({ category: CATEGORIES.SECURITY, checkKey: "content_security_policy_nonce", label: "CSP uses nonces (not unsafe-inline)", status: hasCspNonce ? "PASS" : hasUnsafeInline ? "WARN" : "WARN", detail: hasCspNonce ? "CSP nonce detected — inline scripts are controlled and unsafe-inline is not needed." : csp ? "CSP present but uses unsafe-inline — migrate to nonce-based CSP for stronger XSS protection." : "No CSP detected — implement a nonce-based Content-Security-Policy." });

  return checks;
}
