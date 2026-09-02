import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, resolveDnsRecord, probeInconclusive } from "./_types";
import { analyzeHost, platformSuffixOf, type HostAnalysis } from "@/server/pulse-lite/registrable-domain";

// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE MAY CONCLUDE FROM
//
// One external HTTP request and public DNS. That is the whole vantage point, and
// four of the rules below used to reach past it:
//
//   • Ten checks grepped the page's own marketing COPY for a phrase and then
//     asserted a fact about the deployment ("no auto-scaling", "single-region").
//     They are SKIPPED now — see PROSE_INFERRED_CHECKS for why that is a removal
//     of noise rather than of signal.
//   • `load_balancer_detected` ran a vendor regex over `JSON.stringify(headers)`,
//     so any site whose CSP or Report-To JSON happened to contain the string
//     "cloudflare" or "nginx" PASSed. It now tests the standards-defined proof
//     (RFC 9211 Cache-Status, RFC 9111 Age, RFC 9110 Via) BEFORE any fingerprint,
//     and splits `Server` fingerprints in two: software that is only ever an
//     intermediary PASSes at MEDIUM, while a dual-role web server (nginx, Caddy,
//     LiteSpeed, OpenResty) is INCONCLUSIVE, because on one response it is
//     indistinguishable from a single origin.
//   • `cdn_custom_caching_rules` fell back to grepping the page body for the
//     strings "cache-tag" and "surrogate-key" — response header NAMES — so a
//     response with no cache header at all PASSed on the strength of the copy.
//     A caching verdict now comes only from headers — and from their VALUES: the
//     same check credited `cf-cache-status: DYNAMIC`, `x-vercel-cache: BYPASS`,
//     `x-cache: MISS` and `cache-status: …; fwd=uri-miss` as "CDN caching active",
//     i.e. it read the header that says the response was not cached as proof that
//     it was.
//   • `backup_domain_configured` concatenated `www.` onto whatever host it was
//     given, asking DNS for `www.www.gov.uk` and `www.news.ycombinator.com` —
//     names that cannot exist — so it was structurally incapable of passing on
//     any non-apex host. It now resolves the host's position first, and declines
//     on a platform-issued name (`myapp.vercel.app`) where a `www` record is not
//     something anyone can add.
//
// The house rule all four now obey (CLAUDE.md §34.2 / §35 / §37): a check that
// could not look returns SKIPPED with a reason, and never converts "we could not
// establish this" into "it is not there".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this response says about an intermediary (cache, reverse proxy, load
 * balancer, CDN edge) having handled it.
 *
 * `basis` records WHAT KIND of statement the header supports, because the three
 * tiers license three different verdicts and the check must not present them as
 * the same thing:
 *
 *  - `"standard"` — a header only an intermediary emits, defined by an RFC or
 *    only ever set by an edge: Cache-Status (RFC 9211), Age (RFC 9111 §5.1, "a
 *    shared cache"), Via (RFC 9110 §7.6.3), or a vendor edge request-id. Seeing
 *    it means something sat in front of the origin. → PASS, directly observed.
 *  - `"edge-product"` — the `Server` header names software that is ONLY EVER an
 *    intermediary: a managed edge (Cloudflare, Fastly, Netlify, Vercel,
 *    CloudFront, Akamai), a dedicated balancer (HAProxy, Envoy, Traefik, AWS
 *    ELB) or a pure caching proxy (Varnish, Squid, Apache Traffic Server). None
 *    of those can be the origin application server, so a separate tier exists —
 *    but it is still a fingerprint rather than the proxy's own account of the
 *    request, so → PASS at MEDIUM.
 *  - `"ambiguous-server"` — the `Server` header names a DUAL-ROLE web server
 *    (nginx, OpenResty, Tengine, Caddy, LiteSpeed). Each is used both as the
 *    edge proxy in front of an application and as the single origin serving it
 *    directly, and nothing in one response distinguishes those. → neither
 *    verdict: INCONCLUSIVE.
 *
 * ⚠️ Do NOT move a dual-role server into `edge-product` to widen coverage. That
 * is what made `server: LiteSpeed`, `server: Caddy` and `server: openresty` —
 * ordinary origin web servers on shared hosting and single VPSes — report "Load
 * balancer / reverse proxy detected", which is the governing rule's other half:
 * "we could not establish this" must not be rendered as "this is fine" any more
 * than as "it is not there". `artifactory` was in that list too, and JFrog
 * Artifactory is a binary repository manager, not a proxy at all.
 */
export type IntermediarySignal = {
  header: string;
  value: string;
  basis: "standard" | "edge-product" | "ambiguous-server";
};

/**
 * Headers that only an intermediary can set. Ordered standards-first so the
 * evidence line quotes the vendor-neutral proof when a response carries both —
 * `Cache-Status: "Netlify Edge"; fwd=miss` says more than `x-nf-request-id`.
 *
 * ⚠️ Do NOT add a header the ORIGIN can set (`cache-control`, `surrogate-control`,
 * `vary`). Those describe what the origin WANTS a cache to do and are present on
 * plenty of un-proxied responses.
 */
const INTERMEDIARY_HEADERS: readonly string[] = [
  // Standards-defined.
  "cache-status", // RFC 9211 — a cache's own machine-readable account of this request.
  "via", // RFC 9110 §7.6.3 — proxy identification.
  // Proxy timing / vendor edge identifiers. None of these can originate at the
  // application: something in front of it added them.
  "x-envoy-upstream-service-time",
  "cf-ray",
  "cf-cache-status",
  "x-amz-cf-id",
  "x-amz-cf-pop",
  "x-vercel-id",
  "x-vercel-cache",
  "x-fastly-request-id",
  "x-served-by",
  "x-cache",
  "x-cache-hits",
  "x-nf-request-id",
  "x-akamai-transformed",
  "x-azure-ref",
  "x-msedge-ref",
  "fly-request-id",
  "x-timer",
];

/**
 * Software that CANNOT be the origin application server — a managed edge, a
 * dedicated load balancer, or a pure caching proxy. Matched against the `Server`
 * header VALUE only.
 *
 * The previous rule ran `/cloudflare|nginx|.../` over `JSON.stringify(headers)`,
 * which matches header NAMES and every other value in the response: a CSP
 * allow-listing `static.cloudflareinsights.com`, or a Report-To endpoint on a
 * `*.cloudflare.com` URL, PASSed a site with no proxy at all.
 *
 * `varnish` and `squid` are kept here on purpose. Neither is ever an application
 * origin — both exist only to sit in front of one — and `pulse-scan.ts`'s
 * `CDN_SERVER_VALUES` already credits `server: varnish` as an edge cache, so
 * dropping it would make `cdn_detected` PASS while `load_balancer_detected`
 * WARNed "nothing sits in front of the origin" on the very same response. A
 * same-scan self-contradiction is the defect class audit items 10/18 exist to
 * remove, so consistency with the sibling check decides it.
 */
const EDGE_TIER_PRODUCTS =
  /\b(cloudflare|cloudfront|netlify|vercel|fastly|akamaighost|akamai|awselb|haproxy|envoy|traefik|apachetrafficserver|varnish|squid)\b/i;

/**
 * Web servers that are equally an edge proxy and a standalone origin. Present
 * here so the check can say "this does not tell me" instead of guessing.
 *
 * nginx is the important one: it is both the canonical reverse-proxy tier in
 * front of node/gunicorn/uvicorn AND the single web server on a one-box VPS. The
 * pre-audit code PASSed it (its regex contained `nginx`), which credited every
 * single-VPS site with a load balancer it does not have; a WARN would equally
 * accuse every real nginx edge tier of having none. Neither claim is supportable
 * from one response, so the honest answer is that the question was not settled.
 */
const DUAL_ROLE_WEB_SERVERS = /\b(nginx|openresty|tengine|caddy|litespeed)\b/i;

/** RFC 9111 §5.1: Age is a non-negative integer of seconds. */
const AGE_VALUE = /^\d+$/;

// ─────────────────────────────────────────────────────────────────────────────
// CACHE STATUS — reading the VALUE, not merely the presence of the header
//
// `cdn_custom_caching_rules` used to PASS on any non-empty value of the five
// headers below, so the responses that state IN TERMS that they were not cached
// were reported as "CDN caching active — caching signals detected":
//
//     cf-cache-status: DYNAMIC          (Cloudflare: not eligible, not cached)
//     cf-cache-status: BYPASS           (a rule or a cookie skipped the cache)
//     x-vercel-cache: BYPASS
//     x-cache: MISS
//     cache-status: "x"; fwd=uri-miss   (RFC 9211: forwarded, nothing stored)
//
// That is the "we could not establish this" → "this is fine" direction of the
// governing rule, and it is the worse one: the check that exists to notice
// missing CDN caching credited a site for the header that says it is missing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Headers whose VALUE is a cache's report on this response. Ordered
 * standards-first: RFC 9211 `Cache-Status` is a cache's own structured account of
 * what it did, the four vendor headers are pre-RFC equivalents.
 *
 * ⚠️ Not `age`. Age is handled separately below because it is a measurement
 * rather than a status, and the two license different verdicts.
 */
const CACHE_STATUS_HEADERS: readonly string[] = [
  "cache-status", // RFC 9211
  "cf-cache-status",
  "x-cache",
  "x-cdn-cache",
  "x-vercel-cache",
];

/**
 * Tokens meaning THE OBJECT WAS IN A CACHE. Matched per token against the
 * lowercased value, `_` kept inside a token so Akamai's `TCP_MEM_HIT` survives
 * intact and `-` splitting so RFC 9211's `fwd=uri-miss` yields `miss`.
 *
 * `/hit$/` rather than an exact list because every vendor spells a hit
 * differently and they all end the same way: `HIT`, `TCP_MEM_HIT`,
 * `TCP_REFRESH_HIT`, CloudFront's `RefreshHit` and `OriginShieldHit`. Nothing in
 * any vendor's negative vocabulary ends in "hit".
 *
 * ⚠️ `EXPIRED` and `STALE` are POSITIVE here, and that is not a slip. A response
 * cannot expire, go stale or be revalidated without first having been STORED, so
 * each is proof that caching is configured — Cloudflare's own definition of
 * EXPIRED is "the resource was found in the cache but had expired". Reading
 * EXPIRED as "not cached" while reading REVALIDATED (its outcome) as "cached"
 * would be incoherent. The check's question is whether caching is configured, not
 * whether this particular request was a hit.
 *
 * ⚠️ KNOWN, ACCEPTED RESIDUAL — `/hit$/` matches inside a word, so a value such
 * as `whitehit` reads as a hit. It is left that way deliberately: the only way to
 * exclude it is to require a token boundary before "hit" (`/(?:^|_)hit$/`), and
 * that also excludes CloudFront's REAL `RefreshHit` and `OriginShieldHit`, which
 * lowercase to `refreshhit` / `originshieldhit`. Nothing distinguishes the two
 * structurally, so an exclusion would trade a value no vendor emits for two that
 * three CDNs do. A NEGATED hit is a different matter and IS handled — see
 * `NEGATION_PREFIX_TOKENS`.
 */
const CACHE_HIT_TOKENS = new Set(["stale", "revalidated", "updating", "prerender", "stored", "expired"]);

/**
 * Tokens that negate the token immediately after them, so `x-cache: no-hit`
 * tokenises to `["no", "hit"]` and must NOT read as a hit — a false PASS on the
 * check that exists to notice missing CDN caching, i.e. the "we could not
 * establish this" → "this is fine" direction.
 *
 * ⚠️ Checked only against the token DIRECTLY preceding a hit, and no real cache
 * header puts one there: Akamai's `TCP_MEM_HIT`, Fastly's `HIT, HIT`,
 * CloudFront's `RefreshHit from cloudfront`, Cloudflare's `HIT`, Vercel's
 * `PRERENDER` and RFC 9211's `ExampleCache; hit` are all unaffected. A broader
 * rule (any negation anywhere in the value) would break `fwd=miss; stored`, where
 * the negative and the positive are both true of the same response.
 */
const NEGATION_PREFIX_TOKENS = new Set(["no", "not", "non", "never"]);

/**
 * Tokens by which a cache reports that it could not determine the status itself.
 * Cloudflare's `UNKNOWN` is documented as exactly that, and it ships as the
 * literal value `NONE/UNKNOWN`, which also contains the miss token `none`.
 *
 * These take precedence over the miss vocabulary, so `NONE/UNKNOWN` is reported
 * as indeterminate rather than as "the cache told us it served this from the
 * origin" — a sentence that overstates what Cloudflare said. No vendor combines
 * `unknown` with a genuine hit or miss in one value, so the precedence is safe.
 */
const CACHE_UNDETERMINED_TOKENS = new Set(["unknown"]);

/**
 * Tokens meaning THIS RESPONSE CAME FROM THE ORIGIN. `/miss$/` covers `MISS`,
 * `TCP_MISS`, `TCP_REFRESH_MISS` and RFC 9211's `fwd=uri-miss` / `fwd=vary-miss`;
 * `/nostore$|nocache$/` covers Azure Front Door's `PRIVATE_NOSTORE` and
 * `CONFIG_NOCACHE`.
 *
 * `dynamic` and `bypass` are here as facts, not as accusations — see the verdict
 * for why an explicit non-cache is INCONCLUSIVE rather than WARN.
 *
 * ⚠️ `unknown` is deliberately NOT here — it moved to
 * `CACHE_UNDETERMINED_TOKENS`. Cloudflare's `UNKNOWN` means "could not
 * determine", which is not a miss.
 */
const CACHE_MISS_TOKENS = new Set(["bypass", "dynamic", "none", "pass", "uncached", "error"]);

/** Why a cache signal was read without settling the question. */
export type CdnCachingUnsettled =
  /** `Age: 0` — a cache handled the response but is not shown to have stored it. */
  | "age-zero"
  /** The cache itself reported that it could not determine the status. */
  | "cache-undetermined"
  /** A value Pulse cannot read as either a hit or a miss. */
  | "unreadable-value";

/** What the response's own cache headers say about caching being configured. */
export type CdnCachingVerdict =
  /** A cache reports it holds (or held) this response. */
  | { kind: "cached"; header: string; value: string; token: string }
  /** A cache reports this response came from the origin. */
  | { kind: "uncached"; header: string; value: string; token: string }
  /** A cache signal was read but does not settle the question either way. */
  | { kind: "indeterminate"; header: string; value: string; why: CdnCachingUnsettled }
  /**
   * No readable cache signal at all.
   *
   * `malformedAge` carries the raw `Age` value when one WAS present and was not
   * the non-negative integer RFC 9111 §5.1 defines. Without it the check's WARN
   * said "this response carried no … or Age" about a response that carried an Age
   * — a true verdict with a false evidence line, which is the kind of sentence
   * that gets a whole report distrusted.
   */
  | { kind: "absent"; malformedAge?: string };

function cacheTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

function isHitToken(token: string): boolean {
  return /hit$/.test(token) || CACHE_HIT_TOKENS.has(token);
}

function isMissToken(token: string): boolean {
  return /miss$/.test(token) || /nostore$|nocache$/.test(token) || CACHE_MISS_TOKENS.has(token);
}

/**
 * The first hit token in a value that is not negated by the token before it.
 * See `NEGATION_PREFIX_TOKENS` for why the guard is positional and narrow.
 */
function findHitToken(tokens: string[]): string | null {
  for (let index = 0; index < tokens.length; index += 1) {
    if (!isHitToken(tokens[index])) continue;
    if (index > 0 && NEGATION_PREFIX_TOKENS.has(tokens[index - 1])) continue;
    return tokens[index];
  }
  return null;
}

/**
 * Classify what this response's cache headers actually say.
 *
 * Exported and pure so both directions can be pinned against real captured
 * values: the fix is entirely in reading the value, and the risk of a fix like
 * this is over-correcting into the opposite false verdict.
 *
 * Resolution order, and each step earns its place:
 *  1. ANY un-negated hit token in ANY of the five headers wins. Multi-hop
 *     responses carry several verdicts in one value (`x-cache: MISS, MISS, HIT` on
 *     MDN — edge missed, shield hit) and a hit anywhere in the chain is proof of
 *     caching. "Un-negated" excludes `no-hit`; see `NEGATION_PREFIX_TOKENS`.
 *  2. `Age` ≥ 1 next. A shared cache reporting a response as N seconds old can
 *     only have been holding it, so a rising Age proves caching even with no
 *     status header (Netlify/Varnish behind an unbranded proxy).
 *  3. A cache reporting that it could not determine the status (Cloudflare's
 *     `NONE/UNKNOWN`) is `indeterminate` BEFORE the miss vocabulary is consulted —
 *     that value contains the miss token `none`, and reading it as a miss puts
 *     words in the cache's mouth.
 *  4. A miss token then decides `uncached`.
 *  5. Anything left that was read but not understood — an unrecognised value, or
 *     a bare `Age: 0` — is `indeterminate`, never a verdict.
 *  6. Nothing readable at all is `absent`, carrying a malformed `Age` when one was
 *     present, so the check's sentence cannot deny a header the response sent.
 */
export function classifyCdnCaching(headers: Record<string, string>): CdnCachingVerdict {
  const present: Array<{ header: string; value: string; tokens: string[] }> = [];
  for (const header of CACHE_STATUS_HEADERS) {
    const raw = headers[header];
    if (raw === undefined) continue;
    const value = String(raw).trim();
    if (!value) continue;
    present.push({ header, value: value.slice(0, 160), tokens: cacheTokens(value) });
  }

  for (const entry of present) {
    const hit = findHitToken(entry.tokens);
    if (hit) return { kind: "cached", header: entry.header, value: entry.value, token: hit };
  }

  const ageRaw = headers["age"] === undefined ? "" : String(headers["age"]).trim();
  const age = AGE_VALUE.test(ageRaw) ? Number(ageRaw) : null;
  if (age !== null && age >= 1) {
    return { kind: "cached", header: "age", value: ageRaw, token: ageRaw };
  }

  for (const entry of present) {
    if (entry.tokens.some((token) => CACHE_UNDETERMINED_TOKENS.has(token))) {
      return { kind: "indeterminate", header: entry.header, value: entry.value, why: "cache-undetermined" };
    }
  }

  for (const entry of present) {
    const miss = entry.tokens.find(isMissToken);
    if (miss) return { kind: "uncached", header: entry.header, value: entry.value, token: miss };
  }

  if (present.length > 0) {
    return { kind: "indeterminate", header: present[0].header, value: present[0].value, why: "unreadable-value" };
  }

  // `Age: 0` on its own. It proves a shared cache handled the request — which is
  // what `load_balancer_detected` uses it for, correctly — but not that the cache
  // stored anything: RFC 9111 §5.1 has a cache compute Age for every response it
  // handles, and 0 is what it reports on one it has just fetched from the origin.
  if (age !== null) return { kind: "indeterminate", header: "age", value: ageRaw, why: "age-zero" };

  // Nothing readable. An `Age` header that IS present but unparseable is not
  // evidence of a cache (`detectIntermediary` rejects it for the same reason), but
  // it is also not nothing: the check's sentence must not claim the response
  // carried no Age when it did.
  return ageRaw ? { kind: "absent", malformedAge: ageRaw.slice(0, 160) } : { kind: "absent" };
}

/**
 * The single place that decides whether a response passed through an
 * intermediary. Exported and pure so it can be unit-tested against real captured
 * header sets, and so `cdn_detected` (currently its own five-vendor list in
 * `pulse-scan.ts`) can share it rather than drifting from it again.
 */
export function detectIntermediary(headers: Record<string, string>): IntermediarySignal | null {
  for (const header of INTERMEDIARY_HEADERS) {
    const value = headers[header];
    if (value !== undefined && String(value).trim().length > 0) {
      return { header, value: String(value).trim().slice(0, 160), basis: "standard" };
    }
  }

  // Age is only generated by a SHARED cache, so its presence proves one — but
  // only when the value is a real integer. A malformed Age is not evidence.
  const age = headers["age"];
  if (age !== undefined && AGE_VALUE.test(String(age).trim())) {
    return { header: "age", value: String(age).trim(), basis: "standard" };
  }

  const server = headers["server"];
  if (server !== undefined) {
    const value = String(server).trim().slice(0, 160);
    // Edge products first: `cloudflare-nginx` (Cloudflare's own historic value)
    // and `nginx` fronted by a named edge must read as the edge, not as the
    // dual-role server whose name they also contain.
    if (EDGE_TIER_PRODUCTS.test(value)) return { header: "server", value, basis: "edge-product" };
    if (DUAL_ROLE_WEB_SERVERS.test(value)) return { header: "server", value, basis: "ambiguous-server" };
  }

  return null;
}

/**
 * Checks whose entire evidence was a regex over the page body. Each one names an
 * operational property of the DEPLOYMENT — regions, autoscaling, feature flags,
 * a secrets manager — and tested whether the marketing copy happened to mention
 * it. Two consequences, both observed in the audit corpus:
 *
 *  - FALSE WARN. developer.mozilla.org and www.gov.uk are both on Fastly's global
 *    anycast network (`x-served-by: cache-lcy-…`, POPs in two cities in one
 *    response) and were advised to "consider multi-region or a global CDN" —
 *    while `cdn_custom_caching_rules`, twenty lines below in this same file,
 *    read `x-cache` off the SAME response and reported "CDN caching active".
 *  - FALSE PASS, trivially. Writing "edge network" in a hero heading passes a
 *    single VPS. On the Hacker News front page one user-submitted story title
 *    ("Post-mortem: the us-east-1 outage") flips `multi_region_signals` from
 *    WARN to PASS, because `us.east` matches it. The verdict was a property of
 *    today's news.
 *
 * ⚠️ No false-negative risk in removing the verdicts: these ten were never
 * measuring the property they name, so what goes away is noise, not signal. They
 * stay registered and SKIPPED (with a reason, so they land in the report's "could
 * not establish" list) rather than being deleted — the question is legitimate,
 * the method was not.
 *
 * To bring one back, rebuild it on something observable from outside: headers,
 * DNS topology, a scanned repository's infrastructure config. Never on `html`.
 */
const PROSE_INFERRED_CHECKS: ReadonlyArray<{
  checkKey: string;
  label: string;
  /** The property the check names, phrased to complete "… cannot be established". */
  subject: string;
  /** Where the answer would actually come from. */
  wouldNeed: string;
}> = [
  {
    checkKey: "multi_region_signals",
    label: "Multi-region deployment signals",
    subject: "which regions this service runs in",
    wouldNeed: "CDN/edge POP identifiers, anycast DNS topology, or the deployment configuration",
  },
  {
    checkKey: "auto_scaling_configured",
    label: "Auto-scaling signals",
    subject: "whether compute scales automatically with load",
    wouldNeed: "the hosting platform's configuration, or a load test",
  },
  {
    checkKey: "circuit_breaker_pattern",
    label: "Circuit breaker / retry pattern",
    subject: "whether outbound calls are wrapped in circuit breakers and backoff",
    wouldNeed: "the application source",
  },
  {
    checkKey: "graceful_shutdown_configured",
    label: "Graceful shutdown / SIGTERM handling",
    subject: "whether SIGTERM drains in-flight requests before exit",
    wouldNeed: "the application source or container lifecycle configuration",
  },
  {
    checkKey: "environment_separation",
    label: "Prod / staging / dev separation",
    subject: "whether production, staging and development are separated",
    wouldNeed: "the hosting account, or the repository's environment configuration",
  },
  {
    checkKey: "blue_green_canary_deploy",
    label: "Blue/green or canary deployment",
    subject: "how releases are rolled out",
    wouldNeed: "the CI/CD pipeline definition",
  },
  {
    checkKey: "feature_flags_system",
    label: "Feature flag system",
    subject: "whether a feature flag system is in use",
    wouldNeed: "the application source or a client-side SDK request, and server-evaluated flags leave no external trace at all",
  },
  {
    checkKey: "secrets_manager_used",
    label: "Secrets manager (Vault / AWS Secrets Manager)",
    subject: "how production secrets are stored",
    wouldNeed: "the deployment configuration — and a correctly configured secrets manager is invisible from outside by design",
  },
  {
    checkKey: "database_read_replicas",
    label: "Database read replicas",
    subject: "the database replication topology",
    wouldNeed: "the database configuration",
  },
  {
    checkKey: "object_storage_signals",
    label: "Object storage (S3 / GCS) for assets",
    subject: "where user uploads and static assets are stored",
    wouldNeed: "asset URLs on a page that actually serves user content, or the application source",
  },
];

export async function runInfrastructureExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  // ⚠️ `ctx.htmlLower` is deliberately NOT read anywhere in this file. Every
  // question here is about the deployment, and the page's own copy is not
  // evidence about the deployment in either direction. Reaching for it is how the
  // prose-regex family (below) and the `cache-tag` fallback (above) happened.
  const { hostname } = ctx;
  const h = ctx.pageResult.headers;
  const checks: PulseScanCheckInput[] = [];

  // ── Measured from DNS and response headers ─────────────────────────────────

  // IPv6 (AAAA record). A failed lookup is not an absent record — reporting one as
  // the other is a finding invented from an outage.
  const aaaa = await resolveDnsRecord(hostname, "AAAA");
  if (!aaaa.ok) {
    checks.push(probeInconclusive(CATEGORIES.INFRASTRUCTURE, "ipv6_dns_record", "IPv6 (AAAA) DNS record present",
      `The AAAA lookup for ${hostname} did not complete (${aaaa.reason}).`));
  } else {
    const hasIpv6 = aaaa.records.length > 0;
    checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "ipv6_dns_record", label: "IPv6 (AAAA) DNS record present", status: hasIpv6 ? "PASS" : "WARN", detail: hasIpv6 ? "IPv6 AAAA record found — dual-stack deployment in place." : "No AAAA record — add IPv6 support to future-proof infrastructure and support ISPs moving to IPv6-only networks." });
  }

  // Load balancer / reverse proxy. Standards-defined proof first, product
  // fingerprint second, and an absence that names the question it asked.
  //
  // ⚠️ The WARN is deliberately MEDIUM, not HIGH: an L4 load balancer (an AWS
  // NLB, a bare TCP balancer, DNS round-robin) adds no headers at all, so an
  // absence of headers cannot disprove one. Confidence declared in-module wins
  // over `HIGH_CONFIDENCE_KEYS` in confidence.ts (see `deriveConfidence`).
  const intermediary = detectIntermediary(h);
  if (intermediary && intermediary.basis === "standard") {
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "load_balancer_detected",
      label: "Load balancer / reverse proxy detected",
      status: "PASS",
      detail: `A proxy or cache handled this request — \`${intermediary.header}: ${intermediary.value}\` can only be set by an intermediary in front of the origin.`,
      evidence: `${intermediary.header}: ${intermediary.value}`,
      // Declared HIGH deliberately. `load_balancer_detected` is in
      // confidence.ts's ABSENCE_DERIVED_KEYS, which floors the key to MEDIUM
      // because its ADVERSE verdict is derived from an absence. This branch is
      // the opposite: a header was read off the response. `deriveConfidence`
      // honours a module-declared confidence first, and confidence.ts's own
      // docblock names that as the intended route back to HIGH.
      confidence: "HIGH",
      confidenceReason: `Directly observed: the response carried \`${intermediary.header}\`, which no origin can set.`,
    });
  } else if (intermediary && intermediary.basis === "edge-product") {
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "load_balancer_detected",
      label: "Load balancer / reverse proxy detected",
      status: "PASS",
      detail: `\`server: ${intermediary.value}\` names software that only ever runs in front of an origin — a managed edge, a dedicated load balancer, or a caching proxy — so a separate tier is handling requests. This is a product fingerprint rather than the proxy's own account of this request: no standards-defined header (Cache-Status, Age, Via) was present.`,
      evidence: `${intermediary.header}: ${intermediary.value}`,
      confidence: "MEDIUM",
      confidenceReason: "A Server product name is a fingerprint; the vendor-neutral proxy headers were absent.",
    });
  } else if (intermediary) {
    // Dual-role web server, and nothing else. NOT a PASS: the software is as
    // likely to be the single origin as an edge tier, and crediting it was how
    // `server: LiteSpeed` / `Caddy` / `openresty` came to report a load
    // balancer. NOT a WARN either: it would accuse a real nginx edge tier of
    // having no proxy. INCONCLUSIVE is excluded from both sides of the health
    // score and lands in the report's "could not establish" list.
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "load_balancer_detected",
      label: "Load balancer / reverse proxy detected",
      status: "INCONCLUSIVE",
      detail: `Not established — the only intermediary-shaped signal on this response was \`server: ${intermediary.value}\`, and that software is used both as the reverse proxy in front of an application and as the single web server on one box. No standards-defined proxy header was present (Cache-Status RFC 9211, Age RFC 9111, Via RFC 9110, or a vendor edge request-id), so Pulse can neither credit a separate tier nor say there is none. Naming the host's load balancer or edge configuration would settle it.`,
      evidence: `${intermediary.header}: ${intermediary.value}`,
    });
  } else {
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "load_balancer_detected",
      label: "Load balancer / reverse proxy detected",
      status: "WARN",
      detail: "This response carried no proxy or cache header — no Cache-Status (RFC 9211), Age, Via, edge request-id, or proxy product in Server. Either nothing sits in front of the origin, or it is a transparent layer-4 balancer that adds no headers. A load balancer or edge tier is what makes horizontal scaling and zero-downtime deploys possible.",
      confidence: "MEDIUM",
      confidenceReason: "Derived from the absence of proxy headers, which a layer-4 balancer would not set either.",
    });
  }

  // DNS TTL healthy
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "dns_ttl_healthy", label: "DNS TTL configured for stability", status: "PASS", detail: "Set DNS TTL to 300–3600 seconds for production records. TTLs under 60s cause excess DNS lookups; TTLs over 86400s slow incident response." });

  // Apex ⟷ www pair.
  checks.push(...await runBackupDomainCheck(hostname));

  // CDN caching rules. `cache-status` (RFC 9211) is read first: a CDN that
  // migrated to the standardised header was previously invisible here, so
  // gitwork.co.uk — which answers `cache-status: "Netlify Edge"; fwd=miss;
  // stored` plus a rising `age` — was told it had no CDN caching at all.
  //
  // ⚠️ A CACHING VERDICT COMES FROM HEADERS AND FROM NOTHING ELSE. This check
  // used to fall back to `htmlLower.includes("cache-tag") || …("surrogate-key")`,
  // i.e. it grepped the PAGE BODY for the names of two response headers. That is
  // the same defect as the prose-regex family below, twenty lines from the code
  // that removes it, and it was a FALSE PASS: a response with no cache header at
  // all was reported "CDN caching active" because the body contained the words
  // ("we use Cache-Tag purging" does it, and so does any article about CDNs).
  // Nothing about a page's copy is evidence that a cache handled the request.
  //
  // ⚠️ AND THE VALUE IS READ, NOT JUST THE HEADER'S PRESENCE. Every one of these
  // five headers has a vocabulary for "this response was NOT cached" —
  // `cf-cache-status: DYNAMIC`, `x-vercel-cache: BYPASS`, `x-cache: MISS`,
  // `cache-status: "x"; fwd=uri-miss` — and a presence test reported each of them
  // as "CDN caching active". See `classifyCdnCaching`.
  checks.push(cdnCachingCheck(h));

  // ── Declined: not observable from a single external request ────────────────
  for (const { checkKey, label, subject, wouldNeed } of PROSE_INFERRED_CHECKS) {
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey,
      label,
      status: "SKIPPED",
      detail: `Not assessed — ${subject} cannot be established from a single external request to a web page. Answering it needs ${wouldNeed}. Pulse previously inferred this from phrases in the page's own copy, which measured what the site says about itself rather than how it is deployed, in both directions.`,
    });
  }

  return checks;
}

/**
 * The `cdn_custom_caching_rules` verdict, from the response's cache headers and
 * nothing else.
 *
 * WHY AN EXPLICIT NON-CACHE IS `INCONCLUSIVE` AND NOT `WARN`
 * ---------------------------------------------------------
 * `cf-cache-status: DYNAMIC` or `x-cache: MISS` is a cache telling us, in terms,
 * that it did not serve this response from store. It is tempting to WARN on it —
 * it is the closest thing to a direct read this check ever gets — and it would be
 * wrong on correctly-configured sites, for two independent reasons:
 *
 *  1. ONE REQUEST, ONE OBJECT. A cold MISS is indistinguishable from caching
 *     being switched off; the second request would separate them and a scan makes
 *     one.
 *  2. IT IS THE WRONG OBJECT. Leaving the HTML document uncached while every
 *     hashed asset beside it is cached for a year is the DEFAULT and correct
 *     shape for a server-rendered app behind a CDN — Cloudflare returns DYNAMIC
 *     for exactly that, and Next.js/Rails/Django on Vercel or Cloudflare all land
 *     there. This scan fetched the document and no assets, so WARNing would flag
 *     the recommended configuration as a defect. That is the false positive this
 *     audit pass exists to remove, arrived at from the other side.
 *
 * INCONCLUSIVE states what was observed, keeps it out of both sides of the health
 * score (§34.2) and puts it in the report's "could not establish" list with the
 * one action that would settle it. The intermediary is still detected either way —
 * `detectIntermediary` reads these same headers for `load_balancer_detected`, and
 * `cf-cache-status: DYNAMIC` still PASSes there, because whether something sits in
 * front of the origin and whether it is caching are two different questions.
 */
function cdnCachingCheck(headers: Record<string, string>): PulseScanCheckInput {
  const KEY = "cdn_custom_caching_rules";
  const LABEL = "CDN caching configured";
  const verdict = classifyCdnCaching(headers);

  if (verdict.kind === "cached") {
    const evidence = `${verdict.header}: ${verdict.value}`;
    return {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: KEY,
      label: LABEL,
      status: "PASS",
      detail: `CDN caching active — this response carried \`${evidence}\`, which only a cache in front of the origin can set, and its value reports the response as ${verdict.header === "age" ? `${verdict.value} seconds old, so a shared cache was holding it` : "held in cache rather than fetched from the origin"}.`,
      evidence,
    };
  }

  if (verdict.kind === "uncached") {
    const evidence = `${verdict.header}: ${verdict.value}`;
    return {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: KEY,
      label: LABEL,
      status: "INCONCLUSIVE",
      detail: `Not established — a cache did handle this request, and it reports that it did NOT serve this response from store (\`${evidence}\`). One request for one HTML document cannot turn that into a verdict: a cold miss looks identical to caching being switched off, and leaving the HTML uncached while the hashed assets beside it are cached for a year is the normal, recommended shape for a server-rendered app behind a CDN — this scan fetched the document and none of the assets. Requesting a hashed JS/CSS asset, or this URL a second time, would settle it.`,
      evidence,
    };
  }

  if (verdict.kind === "indeterminate") {
    const evidence = `${verdict.header}: ${verdict.value}`;
    const why =
      verdict.why === "age-zero"
        ? "RFC 9111 §5.1 has a shared cache compute Age for every response it handles, and 0 is what it reports on one it has just fetched from the origin — so this proves a cache is in the path without showing that it stored anything. A rising Age on a second request, or a hit in Cache-Status, would settle it."
        : verdict.why === "cache-undetermined"
          // Cloudflare's `NONE/UNKNOWN`. Read as a miss it became "the cache
          // reports it did NOT serve this from store", which is not what the cache
          // said: UNKNOWN is documented as the cache being unable to determine the
          // status. Overstating an intermediary's own words is the same defect
          // class as inferring a verdict from page copy, one layer in.
          ? "That is the cache reporting that it could not determine the status itself, so it is not evidence in either direction — not a hit, and not a statement that the response came from the origin. Requesting this URL a second time, or a hashed JS/CSS asset, would settle it."
          : "Pulse could not read that value as either a hit or a miss, and will not infer a caching verdict from a value it does not understand.";
    return {
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: KEY,
      label: LABEL,
      status: "INCONCLUSIVE",
      detail: `Not established — the only cache signal on this response was \`${evidence}\`. ${why}`,
      evidence,
    };
  }

  // Still a WARN: an unparseable `Age` is no evidence that anything cached the
  // response, so the verdict is unchanged and only the evidence line differs.
  // Saying "carried no … Age" about a response that carried one is a false
  // sentence attached to a true finding, and a reader who checks the headers
  // themselves has no way to tell which half of the report to trust.
  const nothingReported = verdict.malformedAge === undefined
    ? "this response carried no Cache-Status (RFC 9211), cf-cache-status, x-cache, x-vercel-cache or Age, so nothing reported caching it"
    : `this response carried no Cache-Status (RFC 9211), cf-cache-status, x-cache or x-vercel-cache, and the Age header it did send (\`age: ${verdict.malformedAge}\`) is not the non-negative integer of seconds RFC 9111 §5.1 defines, so nothing on this response reports caching it`;

  return {
    category: CATEGORIES.INFRASTRUCTURE,
    checkKey: KEY,
    label: LABEL,
    status: "WARN",
    detail: `No CDN caching headers detected — ${nothingReported}. Configure CDN cache rules to reduce origin load and improve global performance.`,
    ...(verdict.malformedAge === undefined ? {} : { evidence: `age: ${verdict.malformedAge}` }),
    confidence: "MEDIUM",
    confidenceReason: verdict.malformedAge === undefined
      ? "Derived from the absence of every cache header; a transparent cache that reports nothing would look the same."
      : "Derived from the absence of every readable cache header; the Age header present could not be parsed, and a transparent cache that reports nothing would look the same.",
  };
}

/**
 * Is the apex reachable, is the `www` name reachable, or is the question not
 * about this host at all?
 *
 * The old rule was one line — `resolveDnsRecord(\`www.${hostname}\`)` — with no
 * apex guard and no leading-`www.` strip, so it asked DNS for names that cannot
 * exist (`www.www.gov.uk`, `www.news.ycombinator.com`, both NXDOMAIN) and then
 * reported the empty answer as "no www subdomain detected". `news.*`, `app.*`,
 * `api.*` and `docs.*` are a large share of real scan targets and `www.` inputs
 * are the commonest form a prospect pastes, so the check could not pass on most
 * of what it was pointed at.
 *
 * Note the file's existing probe-honesty guard did not save it: NXDOMAIN comes
 * back as resolver HTTP 200 with no Answer section, so `resolveDnsRecord`
 * correctly reported `{ok: true, records: []}`. The bug was the query NAME.
 *
 * The residual after that repair was the same shape one level in: a
 * platform-issued name (`myapp.vercel.app`, `someuser.github.io`) IS its own
 * registrable domain, so it read as an apex and still got two lookups for a
 * `www.` name the platform will never issue, plus a WARN telling the owner to
 * create a record they cannot create. `planWwwPair` declines those now.
 */
async function runBackupDomainCheck(hostname: string): Promise<PulseScanCheckInput[]> {
  const KEY = "backup_domain_configured";
  const LABEL = "www subdomain / backup domain configured";
  const analysis = analyzeHost(hostname);
  const plan = planWwwPair(analysis);

  if (plan.kind === "decline") {
    return [{
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: KEY,
      label: LABEL,
      status: "SKIPPED",
      detail: plan.reason,
    }];
  }

  // The name we still need to look up: the counterpart of the one we were given.
  const target = plan.kind === "apex" ? `www.${plan.apex}` : plan.apex;
  const cname = await resolveDnsRecord(target, "CNAME");
  const a = await resolveDnsRecord(target, "A");
  const failure = !cname.ok ? cname.reason : !a.ok ? a.reason : null;
  if (failure) {
    return [probeInconclusive(CATEGORIES.INFRASTRUCTURE, KEY, LABEL,
      `The ${target} lookup did not complete (${failure}).`)];
  }

  const records = [
    ...(cname.ok ? cname.records : []),
    ...(a.ok ? a.records : []),
  ];
  const resolves = records.length > 0;
  const evidence = resolves ? `${target} → ${records.slice(0, 3).join(", ")}` : undefined;

  if (plan.kind === "apex") {
    return [{
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: KEY,
      label: LABEL,
      status: resolves ? "PASS" : "WARN",
      detail: resolves
        ? `www subdomain configured — both ${plan.apex} and ${target} resolve, so links to either form work.`
        : `No www subdomain detected — ${plan.apex} serves the site but ${target} has no A or CNAME record, so anyone following a link written with "www." gets a DNS failure. Add an A/CNAME record (or a redirect) for ${target}.`,
      ...(evidence ? { evidence } : {}),
      ...(resolves ? {} : {
        confidence: "MEDIUM" as const,
        confidenceReason: "Derived from an empty DNS answer for one name; a record served only to some resolvers would look the same.",
      }),
    }];
  }

  // The scanned host IS the www name, which is how a `www.…` URL reaches us and
  // is itself proof that half the pair resolves. So the open question is the
  // other half.
  //
  // ⚠️ Deliberately NOT an unconditional PASS. A site reachable only at `www.`
  // with a dead apex is a real defect — every link written without the prefix
  // breaks — and passing it because the input carried a `www.` would be exactly
  // the false negative this whole audit is guarding against.
  return [{
    category: CATEGORIES.INFRASTRUCTURE,
    checkKey: KEY,
    label: LABEL,
    status: resolves ? "PASS" : "WARN",
    detail: resolves
      ? `Both names resolve — this scan was served from ${analysis.hostname}, and the bare ${plan.apex} resolves too, so links to either form work.`
      : `${analysis.hostname} serves the site but the bare ${plan.apex} has no A or CNAME record, so a visitor typing the domain without "www." gets a DNS failure rather than the site. Add an A/ALIAS record at ${plan.apex} (usually redirecting to ${analysis.hostname}).`,
    ...(evidence ? { evidence } : {}),
    ...(resolves ? {} : {
      confidence: "MEDIUM" as const,
      confidenceReason: "Derived from an empty DNS answer for one name; a record served only to some resolvers would look the same.",
    }),
  }];
}

type WwwPlan =
  /** The scanned host is a domain root; the counterpart to look up is `www.<apex>`. */
  | { kind: "apex"; apex: string }
  /** The scanned host is the `www` name; the counterpart to look up is `<apex>`. */
  | { kind: "www"; apex: string }
  /** The question is not answerable, or not about this host. */
  | { kind: "decline"; reason: string };

/**
 * Locate the scanned host in the apex ⟷ www pair, or decline.
 *
 * Exported for direct unit testing: the mapping is the entire fix, and it is
 * cheaper to pin every hostname shape here than to stub DNS for each one.
 */
export function planWwwPair(analysis: HostAnalysis): WwwPlan {
  const host = analysis.hostname;

  if (!host) {
    return { kind: "decline", reason: `Not assessed — ${analysis.reason ?? "no hostname was supplied."}` };
  }

  if (analysis.isIpLiteral) {
    return {
      kind: "decline",
      reason: `Not assessed — ${host} is an IP address, so there is no domain name to configure an apex/www pair for.`,
    };
  }

  // A name issued beneath a hosting platform's namespace — `myapp.vercel.app`,
  // `someuser.github.io`, `shop.myshopify.com`, `docs.readthedocs.io`. These are
  // apexes by every DNS test in `registrable-domain.ts` (the registrable domain of
  // `myapp.vercel.app` IS `myapp.vercel.app`), so the branch below treated them as
  // domain roots: it spent two lookups on `www.myapp.vercel.app` — NXDOMAIN,
  // necessarily, since the platform issues one label at a time — and then advised
  // "add an A/CNAME record for www.myapp.vercel.app". There is no zone to add it
  // to. Advice that cannot be acted on is a false positive whatever its status
  // field says, so the question is declined and the platform is named.
  //
  // Checked BEFORE the `www.` branch so `www.myapp.netlify.app` declines too, and
  // before the registrable-domain branch because that is the branch that gets it
  // wrong.
  //
  // ⚠️ A CUSTOM domain pointed at one of these platforms is unaffected —
  // `platformSuffixOf` tests the NAME, and a CNAME to Netlify leaves no trace in
  // it. `gitwork.co.uk` is served by Netlify and still gets a real verdict, which
  // is correct: it has its own zone and the www record is genuinely actionable.
  // The namespace apex itself is also unaffected (`substack.com` and
  // `wordpress.com` are real sites with real www names) — see `platformSuffixOf`.
  const platform = platformSuffixOf(host);
  if (platform) {
    return {
      kind: "decline",
      reason: `Not assessed — ${host} is a name issued beneath ${platform}, a hosting platform's own namespace, so it cannot have an apex/www pair of its own. Names under ${platform} are handed out one label at a time by the platform and there is no DNS zone here to add a "www" record to, so any finding either way would be advice nobody can act on. Point a custom domain at this deployment and scan that instead — the apex/www pair is real and worth checking there.`,
    };
  }

  const labels = host.split(".");

  // A leading `www.` means the scanned host IS the www half, whatever sits below
  // it. This is checked before the registrable-domain branch so it also covers
  // hosts whose public suffix is not in the curated list.
  if (labels.length > 2 && labels[0] === "www") {
    return { kind: "www", apex: labels.slice(1).join(".") };
  }

  if (analysis.registrable) {
    if (analysis.subdomainLabels.length === 0) {
      return { kind: "apex", apex: analysis.registrable };
    }
    // ⚠️ The reason must be TRUE for both shapes this branch catches, which is
    // why it no longer asserts either of them:
    //
    //   • `news.ycombinator.com` — one hostname inside a larger site. There is no
    //     `www.news.ycombinator.com` (NXDOMAIN) and nobody would create one.
    //   • `hmrc.gov.uk` — operationally a domain root. `www.hmrc.gov.uk` DOES
    //     resolve, and `gov.uk` is a shared government namespace HMRC does not
    //     own, so the old wording was wrong twice over: it declared that
    //     "www.hmrc.gov.uk" is "not a name that would be expected to exist", and
    //     it advised "scan gov.uk to assess it", which assesses somebody else's
    //     zone. (`registrable-domain.ts` treats `gov.uk` as a registrable domain
    //     on purpose — see deviation (1) in its header — so every UK department
    //     running its own zone lands here.)
    //
    // Nothing in one external request separates the two, so the reason states
    // the ambiguity and makes the only actionable sentence conditional on
    // something the reader knows and Pulse does not: who owns the parent domain.
    return {
      kind: "decline",
      reason: `Not assessed — ${host} sits below ${analysis.registrable}, and from a single external request Pulse cannot tell which of two things it is: one hostname inside a larger site, in which case the apex/www pair belongs to ${analysis.registrable} and is a property of a different host than the one scanned; or an organisational root running its own DNS zone, in which case "www.${host}" may well exist and be the pair that matters (UK government departments under gov.uk, and many university and corporate divisions, are this second kind). Those two cases ask opposite questions, so Pulse asks neither rather than guessing. If ${analysis.registrable} is a domain you control, scanning it directly assesses its own apex/www pair.`,
    };
  }

  // The registrable domain could not be established. A two-label name can only
  // be a domain root or a public suffix itself, so `www.<host>` is still the
  // right question; anything deeper is indeterminate and gets declined rather
  // than guessed at.
  if (labels.length === 2) {
    return { kind: "apex", apex: host };
  }

  return {
    kind: "decline",
    reason: `Not assessed — ${analysis.reason ?? `the registrable domain of ${host} could not be established.`} Pulse therefore cannot tell whether this host is a domain root or a subdomain, and so cannot say which name its apex/www counterpart would be.`,
  };
}
