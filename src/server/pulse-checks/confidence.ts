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
//
// ⚠️ "Directly observed" means we READ THE THING. It does not cover concluding from
// the ABSENCE of a string we know how to look for, and the distinction is not
// pedantic — the July-2026 false-positive audit found nine keys listed as HIGH whose
// adverse verdict was always an absence, and HIGH is what removed the hedge from every
// one of them (several shipped `status: WARN, confidence: HIGH, evidence: undefined`).
// An absence can only be as good as the question that was asked, and in each case the
// question was narrower than the standard it cited: DMARC queried without RFC 7489's
// organizational-domain step; a CDN "not detected" by a five-vendor header list that
// omits the RFC 9211 `Cache-Status` header; CSP reporting read only from the enforced
// policy and never from `-report-only` / `reporting-endpoints`. That is §35's
// "we couldn't look" → "it isn't there", one layer out — see ABSENCE_DERIVED_KEYS.
//
// ⚠️⚠️ CONFIDENCE FOLLOWS THE BRANCH, NOT THE KEY — and getting that wrong bought a
// false negative, which is the worse direction. A checkKey cannot say "read it this
// time, inferred it last time", but almost every one of these checks has BOTH a branch
// that reads a header/record and a branch that concludes from its absence. The first
// remediation pass demoted nine whole keys to MEDIUM while, in the same tree, the
// probes were being repaired — so `Access-Control-Allow-Origin: https://attacker.example`,
// an origin-reflection grant READ off the response, was hedged to MEDIUM/LIKELY/P3 and
// dropped out of the free report's actionable list, and `session_cookie_httponly`
// reported MEDIUM/P3 on a named cookie while its sibling `session_cookie_samesite`,
// parsing the same cookies with the same rigour, reported HIGH/P2. Two mechanisms keep
// the two branches apart now:
//   1. ABSENCE_DERIVED_KEYS is applied ONLY to an adverse verdict (WARN/FAIL). A PASS
//      in this family is a read by construction — the check passes because it FOUND
//      the header, record or attribute — so it is never floored.
//   2. A module that measures its own evidence quality declares `confidence` and wins
//      outright (checked first, below). `infrastructure-extended.ts` uses this on both
//      sides: HIGH on the branch that read `Cache-Status`, MEDIUM on the absence.
// A key therefore belongs in BOTH sets when its adverse verdict is an absence and its
// PASS is a read. That is the normal case, not a contradiction.

import type {
  PulseControlSeverity,
  PulseEvidenceStrength,
  PulseScanCheckInput,
} from "@/types/pulse";

export type CheckConfidence = "HIGH" | "MEDIUM" | "LOW";
export type TrustBucket = "CONFIRMED" | "LIKELY" | "VERIFIED_WORKING" | "INCONCLUSIVE";

// Directly-observed checks → HIGH. Curated; the `has_`/`no_exposed_` prefix rules
// below catch the rest of the deterministic families.
export const HIGH_CONFIDENCE_KEYS = new Set<string>([
  // Infrastructure — connection / headers / content-verified files / DNS
  "ssl_valid", "http_redirect", "response_time", "status_200", "custom_domain",
  "compression", "caching_headers", "health_endpoint", "favicon",
  "pwa_manifest", "universal_links", "android_asset_links", "dns_ttl_healthy",
  "ipv6_dns_record", "security_txt",
  // Security — response headers
  "csp_header", "hsts_header", "x_frame_options", "referrer_policy", "permissions_policy",
  "content_security_policy_nonce", "csp_frame_ancestors",
  "cross_origin_opener_policy", "cross_origin_resource_policy", "cross_origin_embedder_policy",
  "cors_not_wildcard", "cors_credentials_restricted",
  "session_cookie_samesite", "secure_cookie_attributes",
  "caa_dns_record", "dnssec_enabled", "certificate_expiry_30d", "sql_error_exposure",
  "no_api_keys_in_html", "no_exposed_source_maps",
  // ── Repaired in August 2026; HIGH again because the probe now reads the thing ──
  // Three whose ADVERSE verdict is itself a direct read (or a completed standard), so
  // HIGH applies on every branch. They are NOT in ABSENCE_DERIVED_KEYS:
  //   cors_policy             SKIPs when the header is absent; the only WARNs are on
  //                           an Access-Control-Allow-Origin VALUE it read (`*`, or a
  //                           third-party origin). corsPolicyVerdict, pulse-scan.ts.
  //   session_cookie_httponly parses each Set-Cookie separately, filters to
  //                           session-shaped names, SKIPs when there is no candidate,
  //                           and the WARN names the cookie. Same rigour as
  //                           session_cookie_samesite, which was never demoted.
  //   dmarc_record            implements RFC 7489 §6.6.3 discovery (org-domain retry,
  //                           honours sp= over p= for a subdomain that exists),
  //                           returns INCONCLUSIVE when a lookup does not complete or
  //                           the organizational domain could not be established, and
  //                           cites the whole search path in the WARN. Its absence
  //                           verdict is a complete answer to the right question — the
  //                           identical reason spf_record is HIGH.
  //                           ⚠️ RESIDUAL, verified 2026-08: the CALLER caps the ladder
  //                           at `organizationalDomainCandidates(hostname).slice(0, 3)`
  //                           (pulse-scan.ts:4006, and identically in
  //                           email-deliverability.ts:249). Candidates are ordered
  //                           most-specific-first, so on a host more than three labels
  //                           below its registrable domain (`a.b.c.d.example.com`) the
  //                           cap drops the ORGANIZATIONAL domain — the one query
  //                           §6.6.3 actually mandates — while keeping three it does
  //                           not, and `unresolvedReason` is null in that case, so the
  //                           result is a WARN from a truncated search. Rare shape,
  //                           real defect; the fix is in those two call sites, not
  //                           here. Do not hedge the key for it: that would demote the
  //                           sp=none reads too (see the ⚠️⚠️ at the top of this file).
  "cors_policy", "session_cookie_httponly", "dmarc_record",
  // Five whose adverse verdict is STILL an absence: they are listed here for their
  // PASS branch only (a header/record that was read) and ABSENCE_DERIVED_KEYS floors
  // their WARN/FAIL to MEDIUM. Removing them from that set re-opens audit item 17.
  "cdn_detected", "load_balancer_detected", "backup_domain_configured",
  "csp_report_directive", "rate_limiting_headers",
  // Vibe-coded live security probes — directly observed (live read-only query / bundle scan).
  "supabase_rls_enforced", "no_service_role_key_exposed", "firebase_rules_locked", "no_public_secret_env",
  // AI-app safety — bundle-observed exposures (HIGH); the guardrail/output/rate-limit checks stay MEDIUM (heuristic default).
  "ai_system_prompt_not_client_exposed", "ai_llm_key_not_client_exposed",
  // Email deliverability — DNS records. `spf_record` is HIGH on purpose: RFC 7208 §3.1
  // makes SPF explicitly NON-inheriting, so a NOERROR/EMPTY answer at the exact queried
  // name IS the complete answer to the right question. `dmarc_record` now reaches HIGH
  // by the same standard, having implemented RFC 7489 §6.6.3's second query (see the
  // note in ABSENCE_DERIVED_KEYS).
  //
  // `dmarc_quarantine_reject` (email-deliverability.ts) is a DIFFERENT probe, and this
  // comment used to say it "still makes a single `_dmarc.<host>` query with no
  // organizational-domain retry". That is no longer true and was re-verified against
  // the code on 2026-08-22. `resolveApplicableDmarc` + `dmarcPolicyChecks` now share
  // the whole §6.6.3 ladder with `dmarc_record` and reach four branches, three of which
  // earn HIGH on their own terms:
  //   own / inherited record → PASS or WARN quoting the governing tag (sp= over p= for a
  //                            subdomain that exists). A READ. HIGH is correct, and
  //                            hedging it would bury a p=none/sp=none finding — a real
  //                            spoofing exposure read straight off a published record.
  //   absent                 → WARN whose detail names every name queried. Same
  //                            standard, same completeness argument, as dmarc_record.
  //   unavailable            → probeInconclusive(), which DECLARES `confidence: "LOW"`
  //                            and status INCONCLUSIVE. Module-declared confidence is
  //                            checked first in deriveConfidence, so HIGH_CONFIDENCE_KEYS
  //                            never touches it: a failed org-domain retry is already
  //                            hedged, and hedged harder than MEDIUM.
  // ⚠️ The one residual it shares with `dmarc_record` is the `.slice(0, 3)` ladder cap
  // described above (email-deliverability.ts:249) — a WARN from a truncated search on a
  // host 4+ labels deep. It is a CROSS-FILE fix in the caller, and the treatment here is
  // deliberately per-branch, not a key-level hedge: moving this key into
  // ABSENCE_DERIVED_KEYS would floor the p=none read as well, which is the exact false
  // negative the first remediation pass bought (see the ⚠️⚠️ at the top of this file).
  "spf_record", "spf_hardfail", "dkim_record_present",
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

/**
 * Keys whose ADVERSE verdict (WARN/FAIL only — see `deriveConfidence`) is derived from
 * the absence of a signal the check knows how to look for, where an absence cannot
 * settle the question. Their PASS branch reads a real header or record and is NOT
 * floored; that is why several of them also appear in HIGH_CONFIDENCE_KEYS.
 *
 * Each entry names the question the absence cannot answer:
 *
 *   cdn_detected             a transparent cache or an L4 tier sets no header at all,
 *                            so "no Cache-Status / Age / Via / vendor header" is
 *                            consistent with both no CDN and an invisible one.
 *   load_balancer_detected   same shape: an AWS NLB, a bare TCP balancer or DNS
 *                            round-robin adds nothing to the response.
 *   backup_domain_configured an empty DNS answer for one name; a record served to some
 *                            resolvers and not others looks identical from here.
 *   csp_report_directive     some hosts (vercel.com measurably) emit `report-to` /
 *                            `reporting-endpoints` on a SAMPLE of requests, so one
 *                            response missing them is not proof of no reporting.
 *   rate_limiting_headers    a header is not proof of a limit in either direction, and
 *                            the real answer belongs to the probed API check.
 *
 * MEDIUM, not LOW: the observation is real, the inference from it is incomplete. That
 * keeps them in the report (LOW-confidence adverse checks are excluded from scoring by
 * score-breakdown.ts) while dropping them out of CONFIRMED and out of the P1/P2
 * actionable list.
 *
 * ⚠️ REMOVED from this set in August 2026, and each removal is load-bearing — do not
 * restore one without re-reading the probe it belongs to:
 *   multi_region_signals     no longer emits a verdict at all. infrastructure-extended.ts
 *                            emits it SKIPPED (PROSE_INFERRED_CHECKS), so an entry here
 *                            is dead config that reads as an active hedge.
 *   cors_policy              SKIPs on absence; every WARN is a value it read.
 *   session_cookie_httponly  per-cookie parse + session-name filter + SKIP when there
 *                            is no candidate; the WARN names the cookie.
 *   dmarc_record             runs RFC 7489 §6.6.3's organizational-domain retry and
 *                            returns INCONCLUSIVE when it cannot, so its WARN is not an
 *                            under-asked question. (One residual, in the CALLER not the
 *                            key: the candidate ladder is capped at 3, which on a host
 *                            4+ labels deep drops the organizational domain itself. See
 *                            the RESIDUAL note in HIGH_CONFIDENCE_KEYS — it is a
 *                            cross-file fix, and hedging the key instead would demote
 *                            the sp= reads with it.)
 * The three probes above were repaired IN THE SAME TREE as the first version of this
 * list, which is how the hedge came to demote direct reads. Check the code, not this
 * comment's history, before adding a key.
 *
 * ⚠️ This is a FLOOR, not a ceiling, and the escape hatch matters: `deriveConfidence`
 * honours a confidence the emitting module declares, and that check runs FIRST. A
 * module that measures its own evidence quality should declare `confidence: "HIGH"`
 * with a `confidenceReason` on the branch that read the thing — `load_balancer_detected`
 * does exactly that on its `Cache-Status`/`Age`/`Via` branch.
 */
export const ABSENCE_DERIVED_KEYS = new Set<string>([
  "cdn_detected",
  "load_balancer_detected",
  "backup_domain_configured",
  "csp_report_directive",
  "rate_limiting_headers",
]);

// A handful of genuinely weak inferences → LOW.
const LOW_CONFIDENCE_KEYS = new Set<string>([
  "sufficient_colour_contrast", // inline-style heuristic only
  "valid_html_parsing", // div-balance heuristic
  "text_spacing_supported",
]);

/**
 * Controls whose failure is technically CRITICAL — they lose data, expose credentials, or let
 * one user reach another's. Assigning `severity: "CRITICAL"` here is what gives them the heaviest
 * scoring weight and lets them block a release via the gate's blocking categories.
 *
 * Exported because `priority.ts` must rank every one of these at the top of the fix list. It kept
 * its own separate list and the two had silently diverged in both directions: `outbound_target_
 * ssrf_safe` and `auth_content_redaction` were CRITICAL for scoring but got no priority boost, so
 * a confirmed SSRF in the scanned product could sit below a cosmetic finding in the ranked list a
 * customer actually works through. `criticalControls.test.ts` now asserts the containment, so a
 * key added here cannot fail to be ranked.
 */
export const CRITICAL_KEYS = new Set([
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
  // Adverse verdicts only, and BEFORE the HIGH list — so a key may sit in both sets and
  // still be hedged where it matters: HIGH credits the branch that read a header, this
  // floor hedges the branch that concluded from an absence. Listing a key in
  // HIGH_CONFIDENCE_KEYS therefore cannot silently restore an unhedged negative.
  //
  // ⚠️ Scoped to WARN/FAIL deliberately. A PASS in this family is a read by
  // construction — the check passes because it FOUND the header, record or attribute —
  // so flooring it credited a site that genuinely runs an edge tier less than one that
  // does not run anything at all. That is the mirror error, and it is just as wrong.
  const adverse = check.status === "WARN" || check.status === "FAIL";
  if (adverse && ABSENCE_DERIVED_KEYS.has(key)) {
    return {
      confidence: "MEDIUM",
      reason: "Derived from the absence of a specific signal — an absence cannot settle this question.",
    };
  }
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
