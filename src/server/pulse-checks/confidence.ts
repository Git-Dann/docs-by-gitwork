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

import type {
  PulseControlSeverity,
  PulseEvidenceStrength,
  PulseScanCheckInput,
} from "@/types/pulse";

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
  // AI-app safety — bundle-observed exposures (HIGH); the guardrail/output/rate-limit checks stay MEDIUM (heuristic default).
  "ai_system_prompt_not_client_exposed", "ai_llm_key_not_client_exposed",
  // Email deliverability — DNS records
  "spf_record", "spf_hardfail", "dkim_record_present", "dmarc_record",
  "dmarc_quarantine_reject", "bimi_record_present", "mta_sts_policy", "tls_rpt_record",
  // SEO — reliable single-tag parses
  "meta_title", "meta_description", "og_tags", "twitter_card", "canonical_url",
  "h1_present", "charset_utf8", "has_heading_hierarchy", "hreflang_tags",
  // Native iOS — parses of files we actually fetched (Info.plist, entitlements,
  // project.pbxproj, lockfiles) or a pattern PRESENT in fetched source. Absence-based
  // iOS checks are deliberately NOT here: they stay MEDIUM, and ios-app.ts downgrades
  // them to LOW itself when the source sample is too thin to prove an absence.
  "ios_release_logging", "ios_sensitive_payload_logging", "ios_env_switcher_in_release",
  "ios_ats_arbitrary_loads", "ios_token_storage", "ios_password_retention",
  "ios_keychain_accessibility", "ios_privacy_manifest", "ios_usage_descriptions",
  "ios_aps_environment", "ios_encryption_declaration", "ios_deployment_target",
  "ios_test_target", "ios_ui_test_target", "ios_dependency_pinning",
  "ios_vendored_deps_committed", "ios_swiftlint", "ios_committed_junk",
  "ios_http_status_discarded", "ios_force_unwrap_density", "ios_adaptive_streaming",
  // Flutter — same rule: config-file parses (pubspec, AndroidManifest, build.gradle,
  // analysis_options) and patterns PRESENT in fetched Dart. Absence-based Flutter
  // checks stay MEDIUM and self-downgrade to LOW on a thin sample.
  "flutter_env_baseurl", "flutter_cleartext_traffic", "flutter_token_storage",
  "flutter_password_retention", "flutter_firebase_config_committed", "flutter_target_sdk",
  "flutter_sdk_currency", "flutter_release_shrinking", "flutter_test_coverage",
  "flutter_dependency_pinning", "flutter_unpinned_git_dep", "flutter_dev_deps_in_prod",
  "flutter_analyzer_lints", "flutter_dev_endpoints", "flutter_commented_features",
  "flutter_metered_network", "flutter_adaptive_streaming",
]);

// A handful of genuinely weak inferences → LOW.
const LOW_CONFIDENCE_KEYS = new Set<string>([
  "sufficient_colour_contrast", // inline-style heuristic only
  "valid_html_parsing", // div-balance heuristic
  "text_spacing_supported",
]);

const CRITICAL_KEYS = new Set([
  "ssl_valid", "supabase_rls_enforced", "no_service_role_key_exposed",
  "no_exposed_env", "no_exposed_git", "outbound_target_ssrf_safe",
  "auth_content_redaction",
]);

const NON_TECHNICAL_KEYS = new Set([
  "github_stars", "press_media", "press_coverage", "product_hunt_badge",
  "public_roadmap", "social_media_links", "social_proof", "social_proof_numbers",
  "customer_logo_wall", "named_customer_quotes", "affiliate_program",
  "affiliate_programme_page", "bnpl_options", "crypto_payments",
  "investor_backing_listed", "community_forum_slack", "newsletter_signup",
  "media_kit",
]);

const CONTROL_ALIASES = new Map<string, string>([
  ["eu_ai_act_disclosure", "eu_ai_act_disclosure"],
  ["ai_ai_act_disclosure", "eu_ai_act_disclosure"],
  ["prefers_high_contrast", "prefers_contrast"],
  ["high_contrast_css", "prefers_contrast"],
  ["prefers_reduced_motion", "prefers_reduced_motion"],
  ["reduced_motion_css", "prefers_reduced_motion"],
  ["android_x_external_storage", "android_external_storage"],
  ["android_external_storage", "android_external_storage"],
  ["android_x_signing_config_committed", "android_signing_credentials_committed"],
  ["android_signing_credentials_committed", "android_signing_credentials_committed"],
  ["android_x_webview_file_access", "android_webview_file_access"],
  ["android_webview_file_access", "android_webview_file_access"],
]);

/** Confidence for a check, by detection method. */
export function deriveConfidence(check: PulseScanCheckInput): { confidence: CheckConfidence; reason: string } {
  const key = check.checkKey;
  // A module that knows its own evidence quality may declare it, and wins. Confidence
  // here is keyed by checkKey, which cannot express "sound this run, weak the next" —
  // and that case is real: the iOS family's absence findings depend on how much of the
  // source it managed to sample. Only modules that measure their own coverage should
  // set this; everything else leaves it unset and is derived below.
  if (check.confidence) {
    return {
      confidence: check.confidence,
      reason: check.confidenceReason ?? "Declared by the emitting check module.",
    };
  }
  if (LOW_CONFIDENCE_KEYS.has(key)) return { confidence: "LOW", reason: "Weak single-signal heuristic." };
  if (HIGH_CONFIDENCE_KEYS.has(key)) return { confidence: "HIGH", reason: "Directly observed (header / DNS / content-verified)." };
  // Deterministic families by prefix.
  if (key.startsWith("no_exposed_")) return { confidence: "HIGH", reason: "Content-verified exposure probe." };
  if (key.startsWith("has_") || key.startsWith("branch_") || key.startsWith("secret_scanning") || key.startsWith("ai_has_"))
    return { confidence: "HIGH", reason: "Repository / configuration fact." };
  // AEO / AI-discoverability checks are all directly observed — fetched files
  // (llms.txt, robots.txt, feed) or parsed markup (JSON-LD, semantic tags, server text).
  if (key.startsWith("aeo_"))
    return { confidence: "HIGH", reason: "Directly observed (fetched file / parsed markup)." };
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
  if (["SKIPPED", "NOT_APPLICABLE", "NOT_TESTED"].includes(check.status)) return null;
  if (["INCONCLUSIVE", "ERROR", "EVIDENCE_REQUIRED"].includes(check.status)) return "INCONCLUSIVE";
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
  const severity: PulseControlSeverity = check.severity
    ?? (CRITICAL_KEYS.has(check.checkKey)
      ? "CRITICAL"
      : check.category === "Security" || check.category === "AI Safety"
        ? "HIGH"
        : check.status === "WARN"
          ? "LOW"
          : "MEDIUM");
  const evidenceStrength: PulseEvidenceStrength = check.evidenceStrength
    ?? (confidence === "HIGH" ? "VERIFIED" : confidence === "MEDIUM" ? "HEURISTIC" : "CLAIMED");
  const scoreEligible = check.scoreEligible
    ?? (check.category !== "Standards Verification" && !NON_TECHNICAL_KEYS.has(check.checkKey));
  return {
    ...check,
    confidence,
    confidenceReason: reason,
    trustBucket: trustBucket ?? undefined,
    severity,
    evidenceStrength,
    scoreEligible,
    controlId: check.controlId ?? CONTROL_ALIASES.get(check.checkKey) ?? check.checkKey,
  };
}
