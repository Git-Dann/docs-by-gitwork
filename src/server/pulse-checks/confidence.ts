// Trust layer — grades every check by how SURE we are it's true, and buckets the
// result so a confident finding and a guess are never shown the same way.
//
// Like CHECK_JURISDICTIONS, this is applied at ONE choke point (ingest() in
// run-lite-scan.ts), so it covers all ~500 checks without touching a single probe.
//
// Confidence reflects the DETECTION METHOD, not the verdict:
//   HIGH   — directly observed: response headers, content-verified file/endpoint
//            probes (verifyFileExposure/fileServed), DNS records, SSL/redirect,
//            repo API facts, single-tag meta parses. If we say it, we saw it.
//   MEDIUM — inferred from page HTML via substring/regex heuristics (most legal /
//            trust / SaaS / missing-page content checks). Usually right, not proof.
//   LOW    — weak single-signal guesses.
// Unlisted ⇒ MEDIUM (fail-safe: never silently claim HIGH for an untested key).

import type { PulseScanCheckInput } from "@/types/pulse";

export type CheckConfidence = "HIGH" | "MEDIUM" | "LOW";
export type TrustBucket = "CONFIRMED" | "LIKELY" | "VERIFIED_WORKING" | "INCONCLUSIVE";

// Directly-observed checks → HIGH. Curated; the `has_`/`no_exposed_` prefix rules
// below catch the rest of the deterministic families.
const HIGH_CONFIDENCE_KEYS = new Set<string>([
  // Infrastructure — connection / headers / content-verified files / DNS
  "ssl_valid", "http_redirect", "response_time", "status_200", "custom_domain",
  "cdn_detected", "compression", "caching_headers", "health_endpoint", "favicon",
  "pwa_manifest", "universal_links", "android_asset_links", "dns_ttl_healthy",
  "ipv6_dns_record", "backup_domain_configured", "load_balancer_detected",
  "multi_region_signals", "security_txt",
  // Security — response headers
  "csp_header", "hsts_header", "x_frame_options", "referrer_policy", "permissions_policy",
  "content_security_policy_nonce", "csp_frame_ancestors", "csp_report_directive",
  "cross_origin_opener_policy", "cross_origin_resource_policy", "cross_origin_embedder_policy",
  "rate_limiting_headers", "cors_policy", "cors_not_wildcard", "cors_credentials_restricted",
  "session_cookie_httponly", "session_cookie_samesite", "secure_cookie_attributes",
  "caa_dns_record", "dnssec_enabled", "certificate_expiry_30d", "sql_error_exposure",
  "no_api_keys_in_html", "no_exposed_source_maps",
  // Vibe-coded live security probes — directly observed (live read-only query / bundle scan).
  "supabase_rls_enforced", "no_service_role_key_exposed", "firebase_rules_locked", "no_public_secret_env",
  // Email deliverability — DNS records
  "spf_record", "spf_hardfail", "dkim_record_present", "dmarc_record",
  "dmarc_quarantine_reject", "bimi_record_present", "mta_sts_policy", "tls_rpt_record",
  // SEO — reliable single-tag parses
  "meta_title", "meta_description", "og_tags", "twitter_card", "canonical_url",
  "h1_present", "charset_utf8", "has_heading_hierarchy", "hreflang_tags",
]);

// A handful of genuinely weak inferences → LOW.
const LOW_CONFIDENCE_KEYS = new Set<string>([
  "sufficient_colour_contrast", // inline-style heuristic only
  "valid_html_parsing", // div-balance heuristic
  "text_spacing_supported",
]);

/** Confidence for a check, by detection method. */
export function deriveConfidence(check: PulseScanCheckInput): { confidence: CheckConfidence; reason: string } {
  const key = check.checkKey;
  if (LOW_CONFIDENCE_KEYS.has(key)) return { confidence: "LOW", reason: "Weak single-signal heuristic." };
  if (HIGH_CONFIDENCE_KEYS.has(key)) return { confidence: "HIGH", reason: "Directly observed (header / DNS / content-verified)." };
  // Deterministic families by prefix.
  if (key.startsWith("no_exposed_")) return { confidence: "HIGH", reason: "Content-verified exposure probe." };
  if (key.startsWith("has_") || key.startsWith("branch_") || key.startsWith("secret_scanning") || key.startsWith("ai_has_"))
    return { confidence: "HIGH", reason: "Repository / configuration fact." };
  return { confidence: "MEDIUM", reason: "Inferred from page content (heuristic)." };
}

// Our existing copy for an unprovable probe (catch-all hosts, etc.) — if the detail
// says so, the result is inconclusive regardless of status/confidence.
function readsInconclusive(detail: string | undefined): boolean {
  if (!detail) return false;
  const d = detail.toLowerCase();
  return d.includes("inconclusive") || d.includes("catch-all") || d.includes("can't be probed") || d.includes("cannot be probed");
}

/** Bucket a check into the 4-way trust view. */
export function deriveTrustBucket(check: PulseScanCheckInput, confidence: CheckConfidence): TrustBucket | null {
  if (check.status === "SKIPPED") return null;
  if (readsInconclusive(check.detail)) return "INCONCLUSIVE";
  if (check.status === "PASS") return "VERIFIED_WORKING";
  // FAIL or WARN — graded by how sure we are.
  if (confidence === "HIGH") return "CONFIRMED";
  if (confidence === "MEDIUM") return "LIKELY";
  return "INCONCLUSIVE";
}

/** Stamp confidence + bucket onto a check. Called centrally in ingest(). */
export function annotateTrust(check: PulseScanCheckInput): PulseScanCheckInput {
  const { confidence, reason } = deriveConfidence(check);
  const trustBucket = deriveTrustBucket(check, confidence);
  return { ...check, confidence, confidenceReason: reason, trustBucket: trustBucket ?? undefined };
}
