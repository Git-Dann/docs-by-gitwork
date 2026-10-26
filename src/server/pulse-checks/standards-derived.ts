// ─────────────────────────────────────────────────────────────────────────────
// STANDARDS CONTROLS DERIVED FROM LIVE EVIDENCE
//
// The standards catalogue (standards-verification.ts) is a list of formal
// controls: "Rotate sessions after login and privilege changes". On their own
// they are a reference list, not checks, and a report never shows them as a
// verdict. A small subset CAN carry a real verdict, because Pulse already runs a
// live check that observes part of the control. This file names exactly that
// subset, and the evidence each one rests on.
//
// The rule that keeps this honest: a control is almost always BROADER than any
// single observation. "auth_x_session_rotation FAIL" proves the control is not
// met; "auth_x_session_rotation PASS" does not prove it is (privilege changes
// were never tested). So each derivation has two lists:
//
//   refutedBy  live checks whose adverse verdict (FAIL or WARN, at MEDIUM or HIGH
//              confidence) is, by itself, evidence the control is not met;
//   provedBy   groups of live checks which, all present and all passing,
//              establish the control as worded. Most controls have none, and
//              can therefore never PASS from Pulse evidence.
//
// Combination (deriveStandardVerdict, pure):
//   any decisive adverse evidence  → that adverse verdict (FAIL beats WARN);
//   else a provedBy group complete → PASS;
//   else                           → INCONCLUSIVE.
// Nothing is ever inferred from a missing check. A LOW-confidence verdict, and
// any INCONCLUSIVE / SKIPPED / NOT_APPLICABLE source, counts as no evidence.
//
// Evidence keys must be LIVE checks (registered, not WITHHELD, not standards_*);
// standards-derived.test.ts enforces that, so a derived verdict can never carry
// a check the report has decided not to show.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";

export interface StandardsDerivation {
  /** Control id without the `standards_` prefix, e.g. "security_core_01". */
  controlId: string;
  /** Live checks whose adverse verdict alone shows the control is not met. */
  refutedBy: readonly string[];
  /** Groups of live checks that together establish the control. Empty: never PASS. */
  provedBy?: readonly (readonly string[])[];
  /** Why this evidence speaks to the control, and what it leaves untested. */
  rationale: string;
}

const d = (
  controlId: string,
  refutedBy: string[],
  rationale: string,
  provedBy?: string[][],
): StandardsDerivation => ({ controlId, refutedBy, rationale, ...(provedBy ? { provedBy } : {}) });

// Groups reused across controls.
const LOCKFILES = ["web_dependency_pinning", "cli_lockfile_committed", "svc_dependency_lockfile", "ios_dependency_pinning", "flutter_dependency_pinning"];
const ON_DEVICE_SECRETS = [
  "rn_token_storage", "flutter_token_storage", "flutter_password_retention", "ios_keychain_accessibility",
  "ios_x_data_protection", "android_external_storage", "android_x_external_storage", "desk_x_credentials_plaintext", "ext_token_storage",
];
const RELEASE_DEBUG = [
  "android_debuggable_release", "android_release_logging", "ios_release_logging", "ios_debug_guards",
  "ios_env_switcher_in_release", "flutter_release_logging", "rn_release_logging", "desk_x_devtools_release", "android_x_strict_mode",
];
const ERROR_LEAKS = ["api_verbose_errors", "svc_stack_trace_leak", "sql_error_exposure"];
const CONTROL_NAMES = ["buttons_have_names", "form_labels_present", "dialogs_have_names", "aria_hidden_not_focusable", "image_input_alt", "rn_accessibility_labels", "flutter_semantics"];
const CORS = ["api_cors_credentials", "api_cors_origin_reflection", "cors_credentials_restricted", "web_cors_source_config"];
const NATIVE_BRIDGES = [
  "electron_node_integration", "tauri_remote_ipc_access", "tauri_global_api", "android_webview_js_bridge",
  "android_x_webview_js_interface", "ios_x_webview_js_bridge", "xp_bridge_eval",
];
const BUILD_INPUT_PINS = [
  "ci_actions_sha_pinned", "ci_actions_branch_ref", "ci_unpinned_images", "docker_base_image_latest",
  "compose_pinned_images", "docker_pinned_packages", "pulse_ci_immutable_actions", "pulse_ci_immutable_images",
];
const STORE_PRIVACY_DECLARATIONS = ["appstore_privacy_label", "playstore_data_safety", "cws_privacy_practices", "ios_privacy_manifest"];
const PERMISSION_RATIONALE = ["android_sensitive_permissions", "ext_high_risk_permissions", "ext_host_permissions_scoped"];

export const DERIVED_STANDARDS: readonly StandardsDerivation[] = [
  // ── Security core ─────────────────────────────────────────────────────────
  d("security_core_01", ["auth_x_session_rotation"], "A session id kept across login fails the control; privilege-change rotation is never tested, so it cannot pass."),
  d("security_core_02", ["auth_x_password_reset_token_ttl", "auth_depth_recovery_single_use"], "A recovery token that never expires or can be reused is an account-takeover path. Other takeover routes are not tested."),
  d("security_core_05", ["auth_x_password_hashing_modern"], "Passwords hashed with a fast or legacy algorithm fail the control; upgrade-on-login paths are not tested."),
  d("security_core_06", ["roles_depth_object_ownership"], "Data access with no ownership or membership check contradicts object-level authorisation. Pulse cannot exercise requests as two users."),
  d("security_core_07", ["roles_depth_tenant_query_scope", "supabase_rls_enforced", "web_supabase_rls_migrations", "firebase_rules_locked"], "Unscoped tenant queries or open database rules let data cross accounts. A clean result is not a cross-tenant test."),
  d("security_core_08", ["roles_depth_service_account_scope", "ci_token_permissions"], "Unscoped service tokens or a CI token with write-all permissions contradict least privilege."),
  d("security_core_09", ["web_dynamic_code_execution", "web_shell_injection", "web_unsafe_deserialization", "android_x_sql_raw_query", "sql_error_exposure"], "Each is an injection sink observed in source or a database error observed in a response. Absence of sinks in a sample is not a defence."),
  d("security_core_12", ON_DEVICE_SECRETS, "Credentials or sensitive files stored outside the platform's protected storage are stored unencrypted. Server-side storage is not observed."),
  d("security_core_13", ["legal_depth_retention_enforcement", "saas_depth_account_deletion_workflow"], "No scheduled retention enforcement, or a deletion flow that misses data, contradicts the control."),
  d("security_core_14", ["obs_x_no_secrets_in_logs", "obs_depth_structured_redaction", "rn_reporting_pii_scrub", "ai_safety_sensitive_telemetry"], "Credentials or personal data written to logs, crash reports or telemetry break the control directly."),
  d("security_core_15", ERROR_LEAKS, "A stack trace or database error returned to a client reveals implementation detail. Only the responses Pulse provoked are covered."),
  d("security_core_16", ["dependency_osv_vulnerabilities", "dependency_audit_clean", "web_dependency_pinning", "ci_actions_sha_pinned"], "Known-vulnerable libraries, unpinned dependencies or mutable action refs contradict dependency integrity. Vulnerability response is a process Pulse cannot see."),
  d("security_core_17", ["pulse_ssrf", "ai_safety_url_egress_policy"], "A server-side fetch of a user-controlled URL, or unconstrained AI egress, is the failure this control exists to prevent."),
  d("security_core_18", ["pay_x_webhook_signature", "email_depth_webhook_signature", "api_depth_webhook_replay_window"], "A webhook handler that skips signature or timestamp verification fails the control for that webhook."),
  d("security_core_19", ["roles_depth_role_change_audit", "payments_depth_refund_audit", "saas_depth_admin_audit_timeline"], "Role changes or refunds with no audit record contradict auditing of high-risk actions."),

  // ── Inclusive access ──────────────────────────────────────────────────────
  // The first six rest on the rendered-page pass (rendered-a11y.ts): one page, one load,
  // so each can refute a control and none can prove it — core tasks span other pages.
  d("inclusive_access_01", ["rendered_keyboard_reachable"], "A visible control Tab cannot reach on the scanned page fails keyboard-only use there. Whole tasks across pages are not walked."),
  d("inclusive_access_02", ["rendered_no_keyboard_trap"], "Focus that cycles and Escape does not release is a keyboard trap. Only the scanned page's initial state is walked; dialogs opened later are not."),
  d("inclusive_access_03", ["rendered_focus_not_obscured"], "A focused control completely covered by a sticky header or overlay fails the control. Dialogs opened later are not tested."),
  d("inclusive_access_04", ["rendered_focus_visible"], "Controls that look identical focused and unfocused have no perceptible focus indicator. Indicator contrast is not measured."),
  d("inclusive_access_05", ["touch_target_size"], "Controls under 24×24 px that crowd another control at phone width fail WCAG 2.5.8 on the scanned page."),
  d("inclusive_access_11", ["rendered_text_contrast"], "Rendered text below WCAG AA contrast fails the control. Icons, control borders and state colours are not measured."),
  d("inclusive_access_06", ["wcag22_dragging_alternative"], "Draggable elements with no non-drag alternative on the scanned page fail the control there."),
  d("inclusive_access_12", CONTROL_NAMES, "Controls with no accessible name, or hidden content that still takes focus, fail name/role/value. Only the scanned page or sampled screens are covered."),
  d("inclusive_access_13", ["video_captions"], "Video on the scanned page without a captions track fails the control. Transcripts and audio description are not tested."),

  // ── Performance core ──────────────────────────────────────────────────────
  d("performance_core_01", ["psi_lcp"], "A poor lab LCP on the scanned route shows at least one route misses the budget. Other routes are not measured."),
  d("performance_core_03", ["psi_cls"], "Poor lab layout shift on the scanned route fails the control there. Shifts during interaction are not measured."),
  d("performance_core_05", ["ios_low_data_mode", "flutter_metered_network", "rn_metered_network", "android_metered_network"], "Large transfers that ignore constrained or metered connections fail the control."),
  d("performance_core_07", ["responsive_images", "next_gen_image_formats", "perf_depth_responsive_images", "image_width_height", "ios_image_downsampling"], "Oversized, legacy-format or undimensioned images show no image budget is enforced."),
  d("performance_core_08", ["psi_tbt", "perf_depth_bundle_budget", "js_appears_minified"], "Long blocking time, unminified scripts or no bundle budget contradict a script budget."),
  d("performance_core_09", ["font_display_swap"], "Web fonts that block text rendering fail the control."),
  d("performance_core_12", ["ios_x_background_task_expiry"], "Background tasks with no expiry handler are killed by the system rather than yielding."),
  d("performance_core_13", ["third_party_script_blocking"], "A render-blocking third-party script makes the page depend on that vendor's speed and uptime."),
  d("performance_core_14", ["perf_depth_bundle_budget"], "With no enforced bundle budget, releases are not gated on size regressions."),

  // ── Privacy core ──────────────────────────────────────────────────────────
  d("privacy_core_03", ["legal_depth_consent_withdrawal"], "Consent that cannot be withdrawn as easily as it is given fails the control."),
  d("privacy_core_04", ["legal_depth_dsar_identity", "legal_depth_export_authorization"], "Rights requests with no identity check, or exports with no access control, fail the control."),
  d("privacy_core_05", ["legal_depth_child_consent"], "Age-sensitive processing with no guardian path fails child-data requirements."),
  d("privacy_core_10", ["payment_refund_policy", "payment_billing_support"], "A product that takes payment with no discoverable refund policy or billing support route fails the control."),
  d("privacy_core_11", ["accessibility_statement"], "With no accessibility statement, users have no published contact or remediation path."),
  d("privacy_core_12", ["legal_depth_consent_receipt", "legal_depth_policy_acceptance_version"], "Consent or terms acceptance recorded with no version or receipt cannot be evidenced later."),

  // ── Release core ──────────────────────────────────────────────────────────
  d("release_core_01", ["pr_review_culture"], "Most merged pull requests landing without review contradicts reviewed release changes. Branch rules are not read."),
  d("release_core_02", ["ci_cd_present", "ci_runs_tests"], "No CI pipeline, or CI that never runs the tests, means merges are not gated on passing tests."),
  d("release_core_03", ["has_tests", "ios_test_target", "android_test_coverage", "flutter_test_coverage", "rn_test_coverage"], "No test suite, or one far smaller than the codebase, cannot cover the critical paths."),
  d("release_core_07", ["saas_depth_feature_flag_defaults"], "Feature flags with no safe default or owner fail the control."),
  d("release_core_08", ["svc_db_migrations_versioned"], "Schema changes applied without versioned migrations cannot be tested forward or back."),
  d("release_core_10", ["pulse_supply_chain_inventory"], "No release inventory is generated, so there is no SBOM to review."),
  d("release_core_11", ["cli_publish_provenance", "tauri_updater_signature", "rn_ota_update_signing"], "Packages published without provenance, or updates shipped unsigned, fail artifact signing."),
  d("release_core_12", ["infra_depth_secret_versions"], "Secrets with no versioning cannot be rotated without interruption."),

  // ── Reliability core ──────────────────────────────────────────────────────
  d("reliability_core_03", ["infra_depth_readiness_liveness", "obs_x_dependency_health"], "Health reporting that conflates readiness with liveness, or ignores dependencies, fails the control."),
  d("reliability_core_06", ["api_x_timeout_on_outbound", "api_x_retry_backoff", "api_depth_request_deadline", "pulse_ai_retry_policy"], "Unbounded outbound calls, immediate retries or no request deadline contradict bounded timeouts and retries."),

  // ── Distribution core ─────────────────────────────────────────────────────
  d("distribution_core_02", PERMISSION_RATIONALE, "Sensitive or broad permissions with no justification fail the control."),
  d("distribution_core_03", STORE_PRIVACY_DECLARATIONS, "A missing privacy declaration cannot match actual behaviour. Pulse cannot observe the behaviour itself."),
  d("distribution_core_05", ["android_app_links_verified", "ios_x_url_scheme_validation"], "Unverified app links or unvalidated deep-link input fail the control."),
  d("distribution_core_08", ["store_screenshots", "store_description", "app_listing_screenshots"], "A listing missing screenshots or a description fails the asset review. Copy quality and localisation are not judged."),
  d("distribution_core_09", ["ios_x_crash_symbols", "rn_source_maps"], "No debug symbols or source maps for release builds leaves crash reports unreadable."),
  d("distribution_core_11", ["ios_offline_cache_fallback"], "An app that shows nothing offline when it has cached data fails offline behaviour."),

  // ── API and AI core ───────────────────────────────────────────────────────
  d("api_ai_core_01", ["api_depth_contract_validation_ci"], "An API contract never validated in CI cannot catch backward-incompatible changes."),
  d("api_ai_core_02", ["api_x_input_validation_schema", "api_depth_response_schema", "api_verbose_errors"], "Unvalidated payloads, or malformed input answered with internals, fail the control."),
  d("api_ai_core_03", ["api_x_idempotency", "api_depth_idempotency_persisted", "email_depth_send_idempotency", "saas_depth_usage_meter_idempotency"], "State-changing operations with no idempotency protection repeat on retry."),
  d("api_ai_core_04", ["api_x_pagination", "api_depth_page_size_cap", "api_depth_cursor_validation", "graphql_depth_limiting"], "Unpaginated collections, uncapped page sizes or unlimited query depth fail resource-limit boundaries."),
  d("api_ai_core_07", ["ai_prompt_injection_guardrail", "ai_safety_remote_content_boundary"], "Retrieved content passed to the model unmarked, with no injection guardrail, fails the control."),
  d("api_ai_core_10", ["pulse_ai_unscoped_retrieval"], "Retrieval with no user or tenant scope can return another user's data."),
  d("api_ai_core_11", ["pulse_ai_evaluation_fixture", "ai_has_evals", "ai_safety_refusal_regression"], "With no versioned evaluations, model or prompt changes ship untested."),
  d("api_ai_core_12", ["pulse_ai_budget_timeout", "pulse_ai_cost_budget", "ai_safety_tool_iteration_cap"], "AI calls with no token, cost or iteration limit fail the control."),

  // ── Deep: identity and authorisation ──────────────────────────────────────
  d("deep_identity_02", ["auth_x_logout_invalidates"], "Logout that only clears the client cookie leaves the session valid on the server."),
  d("deep_identity_06", ["auth_x_token_expiry"], "Access tokens with no expiry are never rejected as expired."),
  d("deep_identity_11", ["auth_depth_sensitive_reauthentication", "auth_depth_admin_step_up"], "Sensitive or administrative changes with no recent-authentication check fail the control."),
  d("deep_authorization_07", ["roles_depth_impersonation_control"], "Impersonation that is not explicit, bounded and audited fails the control."),
  d("deep_authorization_09", ["builder_client_side_authorization"], "Authorisation enforced only in the client means hidden routes accept direct requests."),

  // ── Deep: input ───────────────────────────────────────────────────────────
  d("deep_input_01", ["api_x_input_validation_schema", "vibe_depth_boundary_validation", "svc_express_body_limit", "pulse_request_body_limit"], "Request data used without parsing, or bodies with no size cap, fail input validation."),
  d("deep_input_04", ["graphql_depth_limiting", "svc_express_body_limit", "pulse_request_body_limit"], "Unlimited query depth or body size fails structured payload limits."),
  d("deep_input_05", ERROR_LEAKS, "A parser or database error returned with internals fails the control."),
  d("deep_input_06", ["web_dynamic_code_execution", "ai_safety_output_not_executed", "xp_bridge_eval"], "Evaluating strings or model output as code is the expression-injection sink this control names."),
  d("deep_input_07", ["web_shell_injection", "tauri_shell_scope"], "Shell commands built from variables, or unconstrained shell execution, cross the shell boundary."),
  d("deep_input_10", ["pulse_open_redirect"], "Redirect targets taken from input without an allow-list fail the control."),
  d("deep_input_11", ["pulse_ssrf", "ai_safety_url_egress_policy"], "Server-side fetches of user-controlled URLs can reach protected networks."),

  // ── Deep: data and secrets ────────────────────────────────────────────────
  d("deep_data_04", ["legal_depth_processor_deletion"], "Erasure that does not reach derived stores leaves deleted data in search and caches."),
  d("deep_data_05", ["legal_depth_retention_enforcement"], "With no scheduled retention job, data is not removed on schedule."),
  d("deep_secrets_01", ["roles_depth_service_account_scope", "ci_token_permissions"], "Tokens issued without explicit scopes are not least-privilege."),
  d("deep_secrets_04", ["auth_x_token_expiry", "token_expiry_short"], "Credentials with no or long expiry can be replayed long after issue."),
  d("deep_secrets_06", ["obs_x_no_secrets_in_logs", "obs_depth_structured_redaction"], "Secrets written to application logs fail the control directly."),
  d("deep_secrets_07", ["rn_reporting_pii_scrub"], "Crash reports sent without scrubbing tokens fail the control."),
  d("deep_secrets_09", [
    "desktop_embedded_secret", "rn_bundled_secret", "cli_embedded_secret", "docker_no_secrets_in_env", "docker_no_copy_env_file",
    "pulse_container_secret_layer", "no_api_keys_in_html", "ai_llm_key_not_client_exposed", "android_hardcoded_api_key",
  ], "A credential found in a shipped bundle, image layer or served page fails the control. Scanning finds known patterns, so a clean result is not proof."),

  // ── Deep: network ─────────────────────────────────────────────────────────
  d("deep_network_01", ["ssl_valid", "http_redirect", "no_mixed_content", "ios_ats_arbitrary_loads", "flutter_cleartext_traffic", "electron_insecure_content"], "An invalid certificate, plain-HTTP access or permitted cleartext fails the control. Internal hops are never observed, so it cannot pass."),
  d("deep_network_02", ["web_tls_verification_disabled", "infra_depth_database_tls"], "Code that disables certificate verification lets a forged certificate through."),
  d("deep_network_03", ["pulse_ssrf", "ai_safety_url_egress_policy"], "Outbound destinations taken from input, with no allow-list, fail the control."),
  d("deep_network_04", ["svc_express_trust_proxy"], "Trusting every proxy hop lets a client forge its own address."),
  d("deep_network_07", [...CORS, "ext_externally_connectable_scoped", "ext_x_external_connectable"], "Reflected origins, wildcard credentials or open externally-connectable origins let unintended callers in. Pulse probes only the scanned endpoint."),

  // ── Deep: API ─────────────────────────────────────────────────────────────
  d("deep_api_05", ["api_depth_idempotency_persisted", "api_x_idempotency"], "Idempotency keys not persisted atomically do not survive a retry after timeout."),
  d("deep_api_07", ["api_x_versioning"], "An API with no version in its path or headers has no version to negotiate or deprecate."),
  d("deep_api_11", ERROR_LEAKS, "An error response carrying a stack trace or database error leaks data. Whether errors carry a support identifier is not judged."),
  d("deep_api_09",["pay_x_webhook_signature", "email_depth_webhook_signature", "api_depth_webhook_replay_window"], "Webhooks accepted without signature or freshness checks fail the control."),

  // ── Deep: commerce ────────────────────────────────────────────────────────
  d("deep_commerce_01", ["pay_x_currency_explicit", "pay_x_minor_units", "pay_x_amount_server_side", "payments_depth_price_allowlist", "payments_depth_tax_calculation"], "Client-set amounts, float money, implicit currency or fixed tax fail the calculation control."),
  d("deep_commerce_03", ["payments_depth_event_deduplication", "payments_depth_entitlement_transaction"], "Provider events processed without deduplication can grant an entitlement twice."),
  d("deep_commerce_05", ["pay_x_subscription_lifecycle"], "Unhandled subscription lifecycle events mean cancellation is not applied when promised."),
  d("deep_commerce_06", ["payments_depth_proration_preview"], "Plan changes with no proration preview fail the control."),
  d("deep_commerce_10", ["payments_depth_dunning_state"], "Failed renewals with no bounded dunning flow surprise the customer."),

  // ── Deep: AI ──────────────────────────────────────────────────────────────
  d("deep_ai_behavior_02", ["ai_safety_remote_content_boundary"], "Retrieved content not marked as untrusted can steer tool use."),
  d("deep_ai_behavior_10", ["pulse_ai_evaluation_fixture", "ai_safety_refusal_regression"], "With no fixed evaluation set, model changes cannot be held to a baseline."),
  d("deep_ai_tools_03", ["pulse_ai_tool_confirmation"], "High-impact tool calls with no confirmation step fail the control."),
  d("deep_ai_tools_04", ["pulse_ai_unsafe_tool"], "Tool arguments executed without validation fail the control."),
  d("deep_ai_tools_09", ["pulse_ai_audit_log"], "Tool decisions with no audit record are not attributable."),
  d("deep_ai_tools_10", ["pulse_ai_failure_fallback"], "AI failures with no user-safe fallback do not fail safely."),
  d("deep_ai_tools_11", ["ai_safety_tool_iteration_cap", "pulse_ai_budget_timeout"], "Agent loops with no iteration or budget cap can run away."),
  d("deep_ai_data_02", ["pulse_ai_unscoped_retrieval"], "Retrieval with no user or tenant scope ignores current access."),

  // ── Deep: privacy, accessibility, UX ──────────────────────────────────────
  d("deep_privacy_03", ["legal_depth_consent_withdrawal"], "Consent that cannot be withdrawn does not stop optional processing."),
  d("deep_privacy_05", ["legal_depth_export_authorization"], "Personal-data exports with no access control or expiry fail the control."),
  d("deep_privacy_07", ["saas_depth_account_deletion_workflow"], "A deletion flow that misses data or processors is not tracked to completion."),
  d("deep_privacy_10", ["legal_depth_child_consent"], "Age-sensitive processing with no guardian path fails the safeguard."),
  d("deep_privacy_11", ["legal_depth_policy_acceptance_version", "legal_depth_consent_receipt"], "Acceptance recorded without the policy version loses the historical evidence."),
  d("deep_accessibility_05", ["wcag22_dragging_alternative"], "Drag interactions with no simple alternative fail the control."),
  d("deep_accessibility_07", ["text_spacing_supported", "ios_dynamic_type"], "Fixed text spacing or text that ignores Dynamic Type breaks when resized."),
  d("deep_accessibility_08", CONTROL_NAMES, "Controls with no accessible name expose nothing meaningful to assistive technology."),
  d("deep_accessibility_10", ["no_autoplay_audio", "no_autoplay_video"], "Media that autoplays without controls cannot be operated without a pointer."),
  d("deep_ux_recovery_07", ["vibe_depth_async_ui_states"], "Data screens with no empty state leave the user with nothing to do."),
  d("deep_ux_recovery_08", ["custom_404_page"], "A framework default 404 page offers no route back."),

  // ── Deep: performance and resilience ──────────────────────────────────────
  d("deep_performance_07", ["ios_request_timeout"], "Requests with no explicit timeout give no slow-network feedback."),
  d("deep_performance_08", ["responsive_images", "next_gen_image_formats", "ios_adaptive_streaming", "flutter_adaptive_streaming", "ios_image_downsampling"], "Oversized images or non-adaptive video fail a media load budget."),
  d("deep_performance_11", ["third_party_script_blocking", "render_blocking_scripts"], "Render-blocking scripts make rendering wait on third parties."),
  d("deep_resilience_01", ["api_x_timeout_on_outbound", "ios_request_timeout"], "Dependency calls with no timeout have no bounded fallback."),
  d("deep_resilience_02", ["api_x_retry_backoff", "pulse_ai_retry_policy"], "Immediate or unbounded retries amplify a failing dependency."),
  d("deep_resilience_05", ["payments_depth_event_deduplication", "email_depth_send_idempotency"], "Duplicate events processed twice are not harmless."),

  // ── Deep: observability, integrity ────────────────────────────────────────
  d("deep_observability_04", ["obs_x_tracing"], "Without tracing, client, service and dependency work cannot be joined."),
  d("deep_observability_05", ["obs_depth_structured_redaction", "obs_x_no_secrets_in_logs", "svc_request_id"], "Logs with secrets or with no correlation id fail the control."),
  d("deep_integrity_01", ["svc_db_migrations_versioned"], "Unversioned schema changes are neither reversible nor safely forward-only."),
  d("deep_integrity_06", ["pay_x_minor_units"], "Money held in floating point rounds wrongly at boundaries."),
  d("deep_integrity_07", ["global_depth_utc_storage", "obs_depth_utc_timestamps"], "Timestamps stored without UTC semantics break across time zones and daylight changes."),

  // ── Deep: release and supply chain ────────────────────────────────────────
  d("deep_release_01", ["pr_review_culture"], "Changes merged without review cannot have review matched to risk."),
  d("deep_release_04", ["cli_publish_provenance"], "Packages published without provenance are not bound to the reviewed revision."),
  d("deep_release_07", ["saas_depth_feature_flag_defaults"], "Flags with no safe default do not default to the safer state."),
  d(
    "deep_supply_01",
    [...LOCKFILES, "android_dependency_pinning", "flutter_unpinned_git_dep"],
    "A committed lockfile is deterministic resolution; a missing lockfile, loose specifier or unpinned git dependency is not. This one can pass.",
    [["web_dependency_pinning"], ["cli_lockfile_committed"], ["svc_dependency_lockfile"], ["ios_dependency_pinning"], ["flutter_dependency_pinning"]],
  ),
  d("deep_supply_02", ["pulse_supply_chain_blocking"], "With no blocking threshold, an unapproved dependency can enter a release."),
  d("deep_supply_04", ["ci_token_permissions", "cli_install_scripts", "pulse_install_lifecycle_risk"], "Builds that run install scripts or hold a write-all token do not run with least privilege."),
  d("deep_supply_05", BUILD_INPUT_PINS, "Actions, images or packages taken from moving tags are not pinned build inputs."),
  d("deep_supply_06", ["cli_publish_provenance"], "Without provenance, artifact integrity cannot be verified at promotion."),
  d("deep_supply_10", ["pulse_supply_chain_inventory"], "With no release inventory, there is nothing to match against the shipped artifact."),

  // ── Deep: device, host, distribution ──────────────────────────────────────
  d("deep_device_01", ["android_x_screenshot_flag"], "Sensitive screens without FLAG_SECURE appear in the task switcher."),
  d("deep_device_02", ON_DEVICE_SECRETS, "Tokens or sensitive files outside the keychain, keystore or protected storage fail the control."),
  d("deep_device_05", ["ios_x_url_scheme_validation", "rn_deeplink_credentials", "android_app_links_verified"], "Deep links used without validation, or carrying credentials, fail the control."),
  d("deep_device_07", ["ext_x_optional_permissions", "ext_optional_permissions"], "Broad permissions demanded at install rather than when needed fail the control."),
  d("deep_device_10", RELEASE_DEBUG, "A debuggable release, ungated logging or a staging switch in release fails the control. A PASS from these only means guards exist, so it cannot pass."),
  d("deep_host_01", NATIVE_BRIDGES, "Remote content with Node integration, IPC or a native bridge obtains native capabilities."),
  d("deep_host_02", ["tauri_fs_scope", "ios_x_webview_file_access"], "Unscoped file access, or web content granted file URLs, fails the control."),
  d("deep_host_03", ["electron_ipc_sender_validation", "electron_preload_surface", "tauri_remote_ipc_access", "ext_message_sender_validation", "ext_x_message_sender_check"], "Message handlers that do not check the sender accept messages from anyone."),
  d("deep_host_04", ["ext_high_risk_permissions", "ext_host_permissions_scoped"], "An extension holding unjustified or all-sites permissions does not run with minimal permissions."),
  d("deep_host_06", ["electron_open_external_validated", "desk_x_shell_open_external", "desk_x_protocol_handler", "tauri_shell_open_validator"], "Opening arbitrary URLs or schemes from the app lets an attacker launch dangerous handlers."),
  d("deep_host_07", ["electron_window_open_handler", "desk_x_new_window_guard", "desk_x_navigation_guard"], "New windows and navigations that are not intercepted escape the isolation settings."),
  d(
    "deep_host_08",
    ["tauri_updater_signature", "rn_ota_update_signing", "xp_ota_updates_signed", "electron_update_transport"],
    "An updater with no signature key, or updates over plain HTTP, accepts a substituted release. A Tauri updater with a public key verifies every bundle, so that can pass.",
    [["tauri_updater_signature"]],
  ),
  d("deep_host_10", ["ext_high_risk_permissions", "ext_host_permissions_scoped", "ext_activetab_alternative"], "Permissions broader than the visible feature needs fail the control."),
  d("deep_host_11", ["ext_externally_connectable_scoped", "ext_x_external_connectable", "ext_web_accessible_resources"], "Open externally-connectable origins or exposed resources leave local integrations reachable by any site."),
  d("deep_distribution_02", PERMISSION_RATIONALE, "Permissions with no justification have no explanation to match behaviour."),
  d("deep_distribution_03", STORE_PRIVACY_DECLARATIONS, "A missing privacy declaration cannot match the data flow."),
  d("deep_distribution_08", ["global_depth_rtl_logical_layout"], "Physical left/right layout breaks in right-to-left locales the product ships."),
];

export const DERIVED_STANDARD_KEYS: ReadonlySet<string> = new Set(DERIVED_STANDARDS.map((x) => `standards_${x.controlId}`));

/**
 * A derived standards row restates checks that already ran. It belongs in the full check
 * list, but never as a finding of its own: counting it made one missing button label read
 * as three failures on linear.app, and listed commerce's vulnerable libraries twice in its
 * top fixes. Everything that counts or ranks findings skips these.
 */
export function isDerivedRestatement(checkKey: string): boolean {
  return DERIVED_STANDARD_KEYS.has(checkKey);
}

/** Every live check key any derivation reads, for the registry guard. */
export function derivationEvidenceKeys(x: StandardsDerivation): string[] {
  return [...new Set([...x.refutedBy, ...(x.provedBy ?? []).flat()])];
}

export interface DerivedVerdict {
  status: "PASS" | "WARN" | "FAIL" | "INCONCLUSIVE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** The observations the verdict rests on: the adverse ones, or the proving group. */
  sources: PulseScanCheckInput[];
}

function decisive(c: PulseScanCheckInput | undefined): c is PulseScanCheckInput {
  return !!c && (c.status === "PASS" || c.status === "WARN" || c.status === "FAIL") && c.confidence !== "LOW";
}

function weakest(checks: PulseScanCheckInput[]): "HIGH" | "MEDIUM" {
  return checks.some((c) => (c.confidence ?? "MEDIUM") === "MEDIUM") ? "MEDIUM" : "HIGH";
}

/**
 * The verdict a control earns from this scan's observations (pure). Each check key
 * appears once in a scan, so there is no tie to break between duplicates.
 */
export function deriveStandardVerdict(x: StandardsDerivation, observations: readonly PulseScanCheckInput[]): DerivedVerdict {
  const byKey = new Map<string, PulseScanCheckInput>();
  for (const c of observations) if (decisive(c)) byKey.set(c.checkKey, c);

  const adverse = derivationEvidenceKeys(x)
    .map((k) => byKey.get(k))
    .filter((c): c is PulseScanCheckInput => !!c && (c.status === "FAIL" || c.status === "WARN"));
  if (adverse.length > 0) {
    const fails = adverse.filter((c) => c.status === "FAIL");
    const sources = fails.length > 0 ? fails : adverse;
    return { status: fails.length > 0 ? "FAIL" : "WARN", confidence: weakest(sources), sources };
  }

  for (const group of x.provedBy ?? []) {
    const seen = group.map((k) => byKey.get(k));
    if (group.length > 0 && seen.every((c) => c?.status === "PASS")) {
      const sources = seen as PulseScanCheckInput[];
      return { status: "PASS", confidence: weakest(sources), sources };
    }
  }

  return { status: "INCONCLUSIVE", confidence: "LOW", sources: [] };
}

