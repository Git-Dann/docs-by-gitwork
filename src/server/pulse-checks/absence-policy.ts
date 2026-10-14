// ─────────────────────────────────────────────────────────────────────────────
// ABSENCE POLICY — what an adverse result means when it rests only on not finding something.
//
// A 2026-10 audit verified every finding from 170 real scans against the live sites. Two
// kinds of check kept failing it, and neither was a bug in one probe:
//
//   UNOBSERVABLE — the control lives behind sign-in or on the server (password reset,
//   brute-force protection, MFA, SCIM, billing portal, a DPO contact in the privacy
//   policy). Not finding a sign of it on a public page says nothing about whether it
//   exists, so "No password reset" was a claim about something Pulse never saw (§35).
//   Its adverse result becomes INCONCLUSIVE. A PASS still stands: presence was seen.
//
//   OPTIONAL — the thing is a choice, not a defect (a Product Hunt badge, RTL support,
//   an affiliate programme, Server-Timing, a page naming PECR). Not having it is not a
//   finding, so its adverse result is dropped from the report and the score.
//
// Applied once, in runLiteScan's ingest, so every surface (in-app scan, public scan,
// MCP) agrees. A check whose adverse branch also covers a real observed defect does not
// belong here — fix that check instead.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";

/** Adverse only when Pulse looked and did not find it; the control sits where Pulse cannot see. */
export const UNOBSERVABLE_ABSENCE: ReadonlySet<string> = new Set([
  "accessibility_statement_eaa", "account_settings", "ai_prompt_injection_guardrail",
  "api_health_status_endpoint", "api_rate_limit_headers", "api_sla_documented", "apm_signals",
  "aria_roles_valid", "audit_log_api_export", "auth_password_reset", "auth_security_notifications",
  "billing_portal", "bing_webmaster_verified", "biometric_auth_signals",
  "breach_password_detection", "brute_force_protection", "ccpa_notice_at_collection",
  "community_forum_slack", "coppa_signals", "csrf_protection_signals", "custom_roles",
  "data_deletion_right", "data_export_csv_pdf", "data_retention_schedule",
  "email_verification_flow", "enterprise_sso", "eu_vat", "form_error_identification",
  "g2_capterra_listed", "gdpr_article13_notice", "gdpr_dpa_list_public", "gdpr_dpo_contact",
  "gdpr_right_to_object", "google_business_profile", "graphql_depth_limiting",
  "guest_anonymous_mode", "health_endpoint", "in_app_notifications", "incident_subscriptions",
  "invite_expiry", "invite_revocation", "invite_workflow", "invoicing_capability",
  "ip_allowlisting", "keyboard_shortcuts_ui", "last_admin_protection", "load_balancer_detected",
  "magic_link_auth", "mfa_admin_enforced", "mfa_signals", "migration_import_guide",
  "no_unused_javascript", "onboarding_flow", "otp_expiry_configured", "ownership_transfer",
  "passkey_webauthn_support", "password_reset", "payment_checkout_provider",
  "payment_recurring_terms", "payment_refund_policy", "pci_saq_evidence",
  "pricing_comparison_table", "real_user_monitoring", "refund_policy", "saml_sso_available",
  "scim_user_provisioning", "search_engine_verified", "security_whitepaper",
  "session_timeout_warning", "social_consent_mode", "social_event_tracking",
  "sso_scim_provisioning", "system_requirements_page", "tax_automation", "timezone_locale_support",
  "token_expiry_short", "uptime_monitoring", "us_privacy_rights_request",
  "us_state_optout_signals", "wallet_payments",
]);

/** Not having it is a choice, not a defect. */
export const OPTIONAL_ABSENCE: ReadonlySet<string> = new Set([
  "aeo_content_feed", "aeo_content_freshness", "aeo_question_answer", "affiliate_program",
  "affiliate_programme_page", "amazon_app_store", "api_error_rfc7807", "api_sandbox_test_mode",
  "aria_live_regions", "article_schema", "awards_recognition", "breadcrumb_schema",
  "conference_speaking", "cors_policy", "cross_origin_embedder_policy",
  "cross_origin_resource_policy", "crypto_payments", "customer_logo_wall",
  "eprivacy_pecr_compliance", "eu_data_residency", "faqpage_schema", "gesture_navigation",
  "graphql_signal", "high_contrast_css", "icp_license", "intellectual_property_notice",
  "investor_backing_listed", "iso_27701_signals", "language_switcher", "legal_hub_page",
  "live_chat_signal", "local_business_schema", "local_phone_numbers", "meta_robots",
  "module_script_type", "money_back_signal", "newsletter_signup", "oauth_signals",
  "offline_mode_capable", "og_site_name", "pagination_rel_links", "partner_reseller_program",
  "partners_ecosystem_page", "payment_price_currency", "paypal_integration",
  "prefers_high_contrast", "press_coverage", "press_media", "product_hunt_badge", "product_schema",
  "public_roadmap", "regional_payment_methods", "release_notes_page", "review_schema",
  "roadmap_public_page", "rtl_support", "search_functionality", "sepa_bank_transfer",
  "server_timing", "service_worker_present", "sitemap_index", "smart_app_banner_meta",
  "social_ad_pixel", "social_aggregate_rating", "social_app_store_link",
  "social_description_distinct", "social_faq_schema", "social_media_links",
  "social_oembed_discovery", "social_og_locale", "social_person_schema", "social_profiles_linked",
  "social_proof_numbers", "social_review_platform", "social_share_affordance",
  "social_short_form_video", "social_speakable_schema", "social_tag_manager",
  "stale_while_revalidate", "store_preview_video", "team_presence", "theme_color_defined",
  "third_party_reviews", "tls_rpt_record", "uk_gdpr_ico_registration", "uk_pecr_cookie_law",
  "video_embed_present", "volume_discount_signals",
]);

const UNOBSERVABLE_DETAIL =
  "Not established from outside. This is decided behind sign-in or on the server, so finding no sign of it on the public pages does not show it is missing.";
const OPTIONAL_DETAIL = "Optional — not having it is not a defect.";

const isAdverse = (status: PulseScanCheckInput["status"]) => status === "WARN" || status === "FAIL";

export function applyAbsencePolicy(check: PulseScanCheckInput): PulseScanCheckInput {
  if (!isAdverse(check.status)) return check;
  if (UNOBSERVABLE_ABSENCE.has(check.checkKey)) {
    return {
      ...check,
      status: "INCONCLUSIVE",
      detail: UNOBSERVABLE_DETAIL,
      evidence: check.detail ? `Probe said: ${check.detail}` : check.evidence,
    };
  }
  if (OPTIONAL_ABSENCE.has(check.checkKey)) {
    return { ...check, status: "NOT_APPLICABLE", detail: OPTIONAL_DETAIL };
  }
  return check;
}
